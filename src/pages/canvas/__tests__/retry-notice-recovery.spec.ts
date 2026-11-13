import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { computed, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasMessage from '../components/canvas-message.vue'
import { createShell } from '@/sandbox/shell'
import { pendingReplyLabel } from '../canvas-pending-reply'
import { dispatchSSEEvent, handleParsedChatSSEEventGate } from '../chat-sse-dispatch'

const source = readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')
const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1]
const ast = ts.createSourceFile('canvas.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
function declaration(name: string) {
  for (const node of ast.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.getText(ast)
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === name)) return node.getText(ast)
  }
  throw new Error(`Missing canvas declaration: ${name}`)
}
function evaluate(code: string, scope: Record<string, any>) {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(scope), js)(...Object.values(scope))
}

// Execute the real prepStep branch, context wiring and bubble upsert together.
function fixture() {
  const scope: Record<string, any> = {}
  const ctxNode = declaration('dispatchCtx')
  const ctxAst = ts.createSourceFile('ctx.ts', ctxNode, ts.ScriptTarget.Latest, true)
  const ctxObject = (ctxAst.statements[0] as ts.VariableStatement).declarationList.declarations[0].initializer as ts.ObjectLiteralExpression
  for (const p of ctxObject.properties) {
    if (ts.isShorthandPropertyAssignment(p)) scope[p.name.text] = vi.fn()
  }
  for (const name of ['currentChatId', 'replyContent', 'thinkingContent', 'lastFinishReason', 'streamId', 'tempContent', 'content', 'prepStepStage', 'prepStepQuery', 'prepStepResource']) scope[name] = ref('')
  for (const name of ['lastEventId', 'prepRetryAttempt', 'prepRetryMax', 'prepRetryInSeconds', 'prepStepCount']) scope[name] = ref(0)
  for (const name of ['isStreamActive', 'isResumeInitial', 'userStopRequested']) scope[name] = ref(false)
  scope.currentChatId.value = 'ai'
  scope.talkList = ref([{ id: 'ai', type: 0, content: '', chatLoading: true, chatFinish: false }])
  scope.prepSteps = ref<string[]>([])
  scope.pendingPrepTrail = ref<string[]>([])
  scope.pendingChatTurn = { aiBubbleId: 'ai' }
  scope.pendingMessageMeta = ref(null)
  scope.pendingResendPayload = ref(null)
  scope.pic = ref('')
  scope.formData = {}
  scope.handleOperationStatusEvent = vi.fn()
  scope.t = (key: string) => key
  scope.chatTransport = { noteServerStreamProgress: vi.fn() }
  scope.exitSlowWait = vi.fn()
  scope.nextTick = (cb?: () => void) => cb?.()
  scope.resolvePendingThinkingCollapsed = () => true
  scope.resolvePendingPrepTrailCollapsed = () => true
  scope.unref = (value: any) => value?.value ?? value
  scope.stageHost = { locale: { get: () => 'en' } }
  scope.prepStepText = computed(() => scope.prepStepStage.value === 'retrying' ? '模型暫時不穩定，2 秒後再試' : '回想先前的劇情')
  Object.assign(scope, {
    isCompacting: ref(false), waitPhrase: ref(''), waitClock: { startedAt: () => 0 },
    pendingReplyLabel, renderMessage: (item: any) => item.content,
    roleView: ref({ roleName: '角色' }), convertPlainText: (s: string) => s, displayScript: 'original',
    allowsStageAction: () => false, canGenerate: ref(true), previewOnly: ref(false), showGreetingSwipes: ref(false), openingOriginLabel: () => '',
    operationFailureTitle: () => '', operationFailureSub: () => '', canSwitchModelFor: () => false,
    getSystemMsgCtas: () => [], filterCardFor: () => ({}),
  })
  const view = (item = scope.talkList.value[0]) => evaluate(`${declaration('messageProps')}\nreturn messageProps(item, 0);`, { ...scope, item })
  const ctx = evaluate(`${declaration('upsertPendingAIBubble')}\n${ctxNode}\nreturn dispatchCtx;`, scope)
  const start = source.indexOf("case 'prepStep': {")
  const branch = source.slice(start, source.indexOf("case 'passBlock':", start))
  const prep = (stage: string) => evaluate(`switch (event.event) { ${branch} }`, { ...scope, event: { event: 'prepStep', data: { stage, attempt: 1, maxAttempts: 3, retryInSeconds: 2 } } })
  const output = (event: string, delta: any, current = true) => handleParsedChatSSEEventGate({ event, raw: '', data: { choices: [{ delta }] } } as any, { isGenerationCurrent: () => current, dispatchEvent: ev => dispatchSSEEvent(ev, ctx) })
  return { scope, ctx, prep, output, view }
}

describe('retry notice lifetime', () => {
  it('scrolls the transient retry notice into view even without preparation work', () => {
    const f = fixture()
    f.prep('retrying')
    expect(f.scope.scrollToBottom).toHaveBeenCalledOnce()
    expect(f.view().prepSteps).toEqual(['模型暫時不穩定，2 秒後再試'])
  })

  it.each(['thinking', 'answer'])('clears the active retry on first %s token, keeping actual preparation work', event => {
    const f = fixture()
    f.prep('reading')
    f.prep('retrying')
    expect(f.scope.prepStepText.value).toContain('模型暫時不穩定')
    expect(f.view().prepSteps).toEqual(['回想先前的劇情', '模型暫時不穩定，2 秒後再試'])
    f.output(event, event === 'thinking' ? { reasoning_content: '思考' } : { content: '正文' })
    expect(f.scope.prepStepStage.value).not.toBe('retrying')
    expect(f.scope.prepRetryInSeconds.value).toBe(0)
    expect(f.scope.prepSteps.value).toEqual(['回想先前的劇情'])
  })

  it('does not archive a recovered countdown beside streaming thinking', () => {
    const f = fixture()
    f.prep('reading')
    f.prep('retrying')
    f.prep('done')
    f.output('thinking', { reasoning_content: '思考持續輸出' })
    const row = f.scope.talkList.value[0]
    const wrapper = mount(CanvasMessage, { props: { message: f.view(row) } })
    expect(wrapper.text()).toContain('思考持續輸出')
    expect(wrapper.text()).toContain('回想先前的劇情')
    expect(wrapper.text()).not.toContain('模型暫時不穩定')
    wrapper.unmount()
  })


  it('sends the same recovered view to the sandbox and clears a later retry again', async () => {
    const f = fixture()
    f.prep('retrying')
    document.body.innerHTML = '<div id="retry-shell"></div>'
    const shell = createShell({ doc: document, win: window, mount: document.getElementById('retry-shell')!,
      config: { theme: 'dark', locale: 'zh-Hant', role: { name: '角色', avatarUrl: '' }, user: { nickname: '玩家', avatarUrl: '' }, card: { rules: [], statusbar: '' }, capabilities: { saves: false, edit: false, send: true }, composer: true },
      transport: { send: () => {} } })
    try {
      shell.handle({ type: 'messages', messages: [{ id: 'ai', role: 'ai', content: '', serverId: null, view: f.view() }] })
      expect(shell.refs.list.textContent).toContain('模型暫時不穩定')
      f.output('thinking', { reasoning_content: '思考' })
      shell.handle({ type: 'message.view', id: 'ai', view: f.view() })
      await nextTick()
      expect(shell.refs.list.textContent).toContain('思考')
      expect(shell.refs.list.textContent).not.toContain('模型暫時不穩定')
      f.prep('retrying')
      f.output('answer', { content: '正文' })
      expect(f.scope.prepStepStage.value).toBe('')
    } finally { shell.dispose(); delete (window as any).sdk }
  })

  it('keeps retry state for metadata, empty chunks, stale events and final failure without output', () => {
    const f = fixture()
    f.prep('retrying')
    f.output('thinking', {})
    f.output('answer', {})
    f.output('thinking', { reasoning_content: 'stale' }, false)
    dispatchSSEEvent({ event: 'error', raw: '', data: { finishReason: 'server_error' } } as any, f.ctx)
    expect(f.scope.prepStepStage.value).toBe('retrying')
    expect(f.scope.prepRetryInSeconds.value).toBe(2)
    expect(f.scope.talkList.value[0].chatLoading).toBe(true)
  })
})
