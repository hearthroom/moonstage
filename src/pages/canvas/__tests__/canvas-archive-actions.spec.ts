import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { resolve } from 'node:path'

// Execute the page's actual action handlers with controlled transport and UI boundaries.
const page = parse(readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')).descriptor.scriptSetup!.content
const ast = ts.createSourceFile('canvas.ts', page, ts.ScriptTarget.Latest, true)
function handler(name: string, bindings: Record<string, any>) {
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)!
  const js = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(bindings), `${js}; return ${name}`)(...Object.values(bindings))
}
function fixture() {
  const post = vi.fn().mockResolvedValue({ statusCode: 200, data: { conversationId: 'new' } })
  const error = vi.fn()
  const bindings = {
    _this: { http: { post }, requestUrl: { saveAndStartNew: '/new' } },
    conversationId: { value: 'current' }, pendingGreetingStart: { value: false },
    archiveBusy: { value: false }, canGenerate: { value: true },
    unref: (r: any) => r.value, t: (key: string) => key,
    message: { error }, adoptStartedConversation: vi.fn(), askArchivesFull: vi.fn(),
    archiveCount: { value: 1 }, archiveLimit: { value: 20 },
    isTimelineMutationBlocked: () => false, notifyTimelineMutationBlocked: vi.fn(),
    startPendingGreeting: vi.fn().mockResolvedValue(true), chatStart: vi.fn().mockResolvedValue(true),
    resolveChatErrorMessage: () => 'generic', resolveChatErrorTypeFromFailure: () => 'generic',
  }
  Object.assign(bindings, { postArchiveAction: handler('postArchiveAction', bindings) })
  return { bindings, post, error, run: () => handler('saveAndStartNew', bindings)() }
}
describe('new conversation action', () => {
  it('creates the selected opening when there is no conversation to retire', async () => {
    const f = fixture()
    f.bindings.conversationId.value = ''
    f.bindings.pendingGreetingStart.value = true
    await f.run()
    expect(f.post).not.toHaveBeenCalled()
    expect(f.bindings.startPendingGreeting).toHaveBeenCalledOnce()
  })
  it('reports rejected transport errors and releases the busy state', async () => {
    const f = fixture()
    f.post.mockRejectedValue({ statusCode: 400, data: { error: 'invalid_request' } })
    await f.run()
    await Promise.resolve()
    expect(f.error).toHaveBeenCalledWith('canvas.archive.newFailed')
    expect(f.bindings.archiveBusy.value).toBe(false)
  })
  it('keeps the full-save recovery dialog when HTTP 409 is rejected by the transport', async () => {
    const f = fixture()
    f.post.mockRejectedValue({ statusCode: 409, data: { error: 'conversation_limit_reached' } })
    await f.run()
    expect(f.bindings.askArchivesFull).toHaveBeenCalledOnce()
    expect(f.error).not.toHaveBeenCalled()
  })
  it('reports a rejected initial start instead of only writing to the console', async () => {
    const f = fixture()
    Object.assign(f.bindings, { roleId: { value: 'role' }, ajax: { value: { rows: 20 } } })
    f.post.mockRejectedValue(new Error('offline'))
    await handler('chatStart', f.bindings)()
    expect(f.error).toHaveBeenCalledWith('canvas.archive.newFailed')
  })
  it('does not submit twice while a save is pending', async () => {
    const f = fixture()
    let complete!: (r: any) => void
    f.post.mockReturnValue(new Promise(resolve => { complete = resolve }))
    const first = f.run()
    const second = f.run()
    expect(f.post).toHaveBeenCalledTimes(1)
    complete({ statusCode: 200, data: { conversationId: 'new' } })
    await Promise.all([first, second])
    expect(f.bindings.adoptStartedConversation).toHaveBeenCalledOnce()
  })
})

describe('branch from a message', () => {
  function forkFixture(row: any) {
    const post = vi.fn().mockResolvedValue({ statusCode: 200, data: { conversationId: 'branch' } })
    const error = vi.fn()
    const bindings = {
      conversationId: { value: 'current' }, pendingForkChatId: { value: String(row.id) },
      talkList: { value: [row] }, unref: (r: any) => r.value,
      archiveBusy: { value: false }, isTimelineMutationBlocked: () => false,
      notifyTimelineMutationBlocked: vi.fn(), _this: { requestUrl: { conversationFork: '/fork' } },
      postArchiveAction: post, adoptConversation: vi.fn(), loadArchives: vi.fn(),
      message: { error }, t: (key: string) => key,
      reportArchiveFailure: vi.fn(),
    }
    Object.assign(bindings, { savedForkChatId: handler('savedForkChatId', bindings), reportForkFailure: handler('reportForkFailure', bindings) })
    return { bindings, post, error, run: () => handler('forkArchive', bindings)() }
  }
  it('explains that an unsaved failure row cannot be branched, without sending its local id', async () => {
    const f = forkFixture({ id: 'operation-failed', type: 0, systemOnly: true, chatFinish: true })
    await f.run()
    expect(f.post).not.toHaveBeenCalled()
    expect(f.error).toHaveBeenCalledWith('canvas.archive.forkUnsaved')
    expect(f.bindings.adoptConversation).not.toHaveBeenCalled()
  })
  it('preserves the SDK contract that a saved player message can be a branch target', async () => {
    const f = forkFixture({ id: 'saved-player', type: 1, chatFinish: true })
    await f.run()
    expect(f.post).toHaveBeenCalledWith('/fork', { conversationId: 'current', chatId: 'saved-player' })
  })
  it('branches a saved partial reply using its server chat id instead of its display id', async () => {
    const f = forkFixture({ id: 'local-12', chatId: 'saved-ai', assistantChatId: 'saved-ai', type: 0, chatFinish: true })
    await f.run()
    expect(f.post).toHaveBeenCalledWith('/fork', { conversationId: 'current', chatId: 'saved-ai' })
    expect(f.bindings.adoptConversation).toHaveBeenCalledWith('branch')
  })
})
