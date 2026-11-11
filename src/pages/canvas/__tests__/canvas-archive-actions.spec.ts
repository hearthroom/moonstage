import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { resolve } from 'node:path'
import { buildGreetingList, greetingIndexForStart, hasAlternates, shouldDeferStart, showsOpening, stepGreeting } from '../canvas-greetings'
import { conversationRoleId } from '../canvas-role-settings'
import { nextTick, ref, watch } from 'vue'
import { createPendingStreamEntry, decideStreamResume } from '../chat-transport-ownership'

// Execute the page's actual action handlers with controlled transport and UI boundaries.
const page = parse(readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')).descriptor.scriptSetup!.content
const ast = ts.createSourceFile('canvas.ts', page, ts.ScriptTarget.Latest, true)
function handler(name: string, bindings: Record<string, any>) {
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)!
  const js = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(bindings), `${js}; return ${name}`)(...Object.values(bindings))
}
function initialResumeWatcher(bindings: Record<string, any>) {
  const node = ast.statements.find(n => ts.isExpressionStatement(n)
    && ts.isCallExpression(n.expression)
    && n.expression.expression.getText(ast) === 'watch'
    && n.expression.arguments[0]?.getText(ast) === 'conversationId')!
  const js = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  // The page's mutable pending turn must stay live across the scheduled Vue tick.
  return new Function('scope', `with (scope) { return ${js} }`)(bindings)
}
function fixture() {
  const post = vi.fn().mockResolvedValue({ statusCode: 200, data: { conversationId: 'new' } })
  const error = vi.fn()
  const get = vi.fn().mockImplementation(async (url: string) => ({ statusCode: 200, data: url === '/owned'
    ? { conversationId: 'current', roleId: 'source-role' }
    : { characterRoleId: 'source-role', roleWelcome: 'main' } }))
  const bindings = {
    _this: { http: { post, get }, requestUrl: { saveAndStartNew: '/new', ownedConversation: '/owned', getRoleDetail: '/detail' } },
    conversationId: { value: 'current' }, pendingGreetingStart: { value: false },
    pendingNewConversationFrom: { value: '' }, greetingStartBusy: { value: false },
    greeting: { list: ['main'], index: 0 }, shouldDeferStart, buildGreetingList, conversationRoleId,
    archiveBusy: { value: false }, canGenerate: { value: true },
    unref: (r: any) => r.value, t: (key: string) => key,
    message: { error }, adoptStartedConversation: vi.fn(), askArchivesFull: vi.fn(),
    archiveCount: { value: 1 }, archiveLimit: { value: 20 },
    isTimelineMutationBlocked: () => false, notifyTimelineMutationBlocked: vi.fn(),
    startPendingGreeting: vi.fn().mockResolvedValue(true), chatStart: vi.fn().mockResolvedValue(true),
    resolveChatErrorMessage: () => 'generic', resolveChatErrorTypeFromFailure: () => 'generic',
  }
  Object.assign(bindings, { postArchiveAction: handler('postArchiveAction', bindings) })
  return { bindings, post, get, error, run: () => handler('saveAndStartNew', bindings)() }
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
    await vi.waitFor(() => expect(f.post).toHaveBeenCalledTimes(1))
    expect(f.post).toHaveBeenCalledTimes(1)
    complete({ statusCode: 200, data: { conversationId: 'new' } })
    await Promise.all([first, second])
    expect(f.bindings.adoptStartedConversation).toHaveBeenCalledOnce()
  })
})

describe('choose an opening after New conversation', () => {
  function chooserFixture() {
    const f = fixture()
    const b = f.bindings as Record<string, any>
    Object.assign(b, {
      greeting: { list: ['main', 'alternate one', 'alternate two'], index: 0 },
      talkList: { value: [{ id: 'old', type: 1, content: 'old history' }] },
      pic: { value: '' }, content: { value: 'player draft' }, hasLogin: { value: true },
      historyConversation: { value: true }, openMore: { value: true },
      ajax: { value: { flag: true, hasNextPage: true } },
      autoScrollEnabled: { value: false }, isUserAtBottom: { value: false },
      teardownStreamForConversationSwitch: vi.fn(),
      uni: { $emit: vi.fn(), showToast: vi.fn() },
      nextTick: (f: () => void) => f(), scrollToBottom: vi.fn(), loadArchives: vi.fn(),
      followConversationRole: () => false,
      cardStateFromServer: () => null, nextBubbleId: () => 123,
      showsOpening, stepGreeting, greetingIndexForStart, hasAlternates,
      onActionBtnClick: vi.fn(),
    })
    f.get.mockImplementation(async (url: string) => ({ statusCode: 200, data: url === '/owned'
      ? { conversationId: 'current', roleId: 'source-role' }
      : { characterRoleId: 'source-role', roleWelcome: 'main', welcomeAlternates: ['alternate one', 'alternate two'] } }))
    for (const name of ['renderGreetingPreview', 'onGreetingSwipe', 'adoptStartedConversation', 'startPendingGreeting', 'onCanvasSend']) {
      b[name] = handler(name, b)
    }
    return { ...f, b }
  }
  it('shows a selectable preview without committing the default opening, then creates the selected opening once', async () => {
    const f = chooserFixture()
    await f.run()
    expect(f.b.pendingGreetingStart.value).toBe(true)
    expect(f.b.conversationId.value).toBe('')
    expect(f.post).not.toHaveBeenCalled()
    expect(f.b.talkList.value[0].content).toBe('main')
    f.b.onGreetingSwipe(1)
    expect(f.b.talkList.value[0].content).toBe('alternate one')
    f.post.mockResolvedValue({ statusCode: 200, data: { conversationId: 'new', defaultRelay: 'alternate one' } })
    await f.b.onCanvasSend()
    expect(f.post).toHaveBeenCalledTimes(1)
    expect(f.post.mock.calls[0][1].data).toEqual({ conversationId: 'current', save: true, greetingIndex: 1 })
    expect(f.b.chatStart).not.toHaveBeenCalled()
    expect(f.b.conversationId.value).toBe('new')
    expect(f.b.pendingGreetingStart.value).toBe(false)
    expect(f.b.pendingNewConversationFrom.value).toBe('')
    expect(f.b.talkList.value[0].content).toBe('alternate one')
    expect(f.b.onActionBtnClick).toHaveBeenCalledOnce()
  })
  it.each(['offline', 'full'])('preserves the selection, draft and source archive when creation fails: %s', async (failure) => {
    const f = chooserFixture()
    await f.run()
    f.b.onGreetingSwipe(1)
    if (failure === 'offline') f.post.mockRejectedValue(new Error('offline'))
    else f.post.mockResolvedValue({ statusCode: 409, data: { error: 'conversation_limit_reached', count: 20, limit: 20 } })
    await f.b.onCanvasSend()
    expect(f.b.onActionBtnClick).not.toHaveBeenCalled()
    expect(f.b.pendingGreetingStart.value).toBe(true)
    expect(f.b.pendingNewConversationFrom.value).toBe('current')
    expect(f.b.content.value).toBe('player draft')
    expect(f.b.talkList.value[0].content).toBe('alternate one')
    expect(f.b.greetingStartBusy.value).toBe(false)
    if (failure === 'full') {
      expect(f.b.askArchivesFull).toHaveBeenCalledOnce()
      expect(f.b.uni.showToast).not.toHaveBeenCalled()
    }
  })
  it('does not let a second send bypass an in-flight opening creation', async () => {
    const f = chooserFixture()
    await f.run()
    let complete!: (res: any) => void
    f.post.mockReturnValue(new Promise(resolve => { complete = resolve }))
    const first = f.b.onCanvasSend()
    await f.b.onCanvasSend()
    expect(f.b.onActionBtnClick).not.toHaveBeenCalled()
    expect(f.post).toHaveBeenCalledTimes(1)
    complete({ statusCode: 200, data: { conversationId: 'new', defaultRelay: 'main' } })
    await first
    expect(f.b.onActionBtnClick).toHaveBeenCalledOnce()
  })
  it('still uses chatStart for a card with no previous conversation', async () => {
    const f = chooserFixture()
    f.b.conversationId.value = ''
    f.b.pendingGreetingStart.value = true
    f.b.greeting.index = 2
    f.b.chatStart.mockImplementation(async () => { f.b.conversationId.value = 'first' })
    await f.b.onCanvasSend()
    expect(f.post).not.toHaveBeenCalled()
    expect(f.b.chatStart).toHaveBeenCalledWith(2)
    expect(f.b.onActionBtnClick).toHaveBeenCalledOnce()
  })
  it('clears the staged new-conversation intent when opening an existing archive', () => {
    const f = chooserFixture()
    Object.assign(f.b, {
      syncConversationRole: vi.fn(), getHistoryMsg: vi.fn(),
    })
    f.b.pendingGreetingStart.value = true
    f.b.pendingNewConversationFrom.value = 'current'
    handler('adoptConversation', f.b)('archive-picked')
    expect(f.b.conversationId.value).toBe('archive-picked')
    expect(f.b.pendingGreetingStart.value).toBe(false)
    expect(f.b.pendingNewConversationFrom.value).toBe('')
    expect(f.b.getHistoryMsg).toHaveBeenCalledOnce()
  })
  it('uses openings from the source archive revision instead of the URL revision', async () => {
    const f = chooserFixture()
    f.get.mockImplementation(async (url: string) => ({ statusCode: 200, data: url === '/owned'
      ? { conversationId: 'current', roleId: 'old-revision' }
      : { characterRoleId: 'old-revision', roleWelcome: 'old main', welcomeAlternates: ['old alternate'] } }))
    await f.run()
    f.b.onGreetingSwipe(1)
    expect(f.get.mock.calls[1][1].data).toEqual({ roleId: 'old-revision' })
    expect(f.b.greeting.list).toEqual(['old main', 'old alternate'])
    expect(f.b.talkList.value[0].content).toBe('old alternate')
  })
  it('does not abandon the old history or create a conversation if its opening revision cannot be read', async () => {
    const f = chooserFixture()
    f.get.mockRejectedValue(new Error('offline'))
    await f.run()
    expect(f.b.conversationId.value).toBe('current')
    expect(f.b.talkList.value[0].content).toBe('old history')
    expect(f.b.pendingGreetingStart.value).toBe(false)
    expect(f.post).not.toHaveBeenCalled()
    expect(f.error).toHaveBeenCalledWith('canvas.archive.newFailed')
  })
  it('does not send or create while an archive switch is in progress', async () => {
    const f = chooserFixture()
    await f.run()
    f.b.archiveBusy.value = true
    await f.b.onCanvasSend()
    await handler('openResponseSettings', f.b)()
    expect(f.post).not.toHaveBeenCalled()
    expect(f.b.onActionBtnClick).not.toHaveBeenCalled()
    expect(f.b.pendingGreetingStart.value).toBe(true)
  })
  it('does not treat the first live send as an abandoned mount-time draft while its WS ticket is pending', async () => {
    const f = chooserFixture()
    let stored: any = null
    let pendingTurn: any = null
    Object.assign(f.b, {
      conversationId: ref('current'), watch, nextTick,
      socket: ref(null), resumePendingBackwardOperation: () => false,
      resumePendingStopSettlement: () => false,
      readPendingStreamState: () => decideStreamResume(stored),
      recoverStoredStreamDraft: vi.fn(() => { f.b.content.value = 'player draft' }),
      onActionBtnClick: vi.fn(() => {
        const payload = { conversationId: 'new', message: 'player draft', supportsOperationOutcome: true, clientOperationId: 'first-intent' }
        pendingTurn = { payload }
        stored = { ...createPendingStreamEntry(payload), chatPayloadDispatched: false }
        f.b.content.value = ''
      }),
    })
    Object.defineProperty(f.b, 'pendingChatTurn', { get: () => pendingTurn, configurable: true, enumerable: true })
    f.b.tryResumeOnMount = handler('tryResumeOnMount', f.b)
    for (const name of ['adoptStartedConversation', 'startPendingGreeting', 'onCanvasSend']) f.b[name] = handler(name, f.b)
    const stop = initialResumeWatcher(f.b)
    try {
      await f.run()
      await nextTick()
      f.post.mockResolvedValue({ statusCode: 200, data: { conversationId: 'new', defaultRelay: 'main' } })
      await f.b.onCanvasSend()
      await nextTick()
      expect(f.b.onActionBtnClick).toHaveBeenCalledOnce()
      expect(f.b.recoverStoredStreamDraft).not.toHaveBeenCalled()
      expect(f.b.content.value).toBe('')
      expect(stored.chatPayloadDispatched).toBe(false)
    } finally { stop() }
  })
  it('still restores an abandoned draft on a real mount with no live turn', async () => {
    const tryResumeOnMount = vi.fn()
    const scope = { conversationId: ref(''), pendingChatTurn: null, watch, nextTick, tryResumeOnMount,
      unref: (r: any) => r.value }
    const stop = initialResumeWatcher(scope)
    try {
      scope.conversationId.value = 'restored'
      await nextTick()
      await nextTick()
      expect(tryResumeOnMount).toHaveBeenCalledOnce()
    } finally { stop() }
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
