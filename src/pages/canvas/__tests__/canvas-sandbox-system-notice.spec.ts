// @vitest-environment jsdom
/**
 * 沙箱卡的系統訊息卡：宿主那一側。
 *
 * 一般卡在每一列底下掛 <chat-system-message>（canvas.vue 模板裡那一段：閘、語氣、標題、說明、按鍵）。
 * 沙箱卡的列表在跨源殼裡，以前宿主把系統列整批濾掉、也不送卡的內容，玩家什麼都看不到。
 * 現在 canvas.vue 用 systemNoticeFor() 把**同一組函式**算好的卡放進送給殼的 view，殼照畫。
 *
 * 這裡量三件事：
 *   1. systemNoticeFor 跑的是 canvas.vue 裡真的那幾支函式（不是平行的一張表）：字對、按鍵對、
 *      只有最新那一列有按鍵；模板與 systemNoticeFor 的運算式一字不差（改一邊沒改另一邊就紅）。
 *   2. 宿主橋把系統列送進殼（以前在 visible() 濾掉），殼回來的 sys:<動作> 交給畫布。
 *   3. 畫布收到 sys:<動作> 先對這一列現在給的按鍵核一次，才走卡片同一個動作。
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSandboxHost } from '../canvas-sandbox-host'
import type { HudHost, HudHostMessage, HudHostState } from '../canvas-hud-bridge'
import { envelope } from '@/sandbox/protocol'
import {
  isTerminalActionAllowed,
  terminalUIActionFromAllowedActions,
  terminalUIActionsFromAllowedActions,
} from '../chat-operation-ui-state'
import { operationFailureSub, operationFailureTitle } from '@/utils/operation-failure-copy'
import { findResumableAgentOperation } from '@/utils/agent-composer-action'
import { allowsStageAction } from '@/host/capabilities'
import zh from '@/locale/zh-Hant.json'

const CANVAS = fs.readFileSync(path.join(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
const t = (key: string) => (zh as Record<string, string>)[key] || ''

/** 從 canvas.vue 取出那幾支頂層函式（到下一個頂層 function 為止），去掉型別後在給定的環境裡跑。 */
function canvasFunctions(names: string[], env: Record<string, unknown>): Record<string, (...args: any[]) => any> {
  const code = names.map((name) => {
    const start = CANVAS.indexOf(`\nfunction ${name}(`)
    expect(start, `canvas.vue 裡找不到 function ${name}(`).toBeGreaterThan(-1)
    const end = CANVAS.indexOf('\nfunction ', start + 1)
    return CANVAS.slice(start, end)
  }).join('\n')
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  const keys = Object.keys(env)
  return new Function(...keys, `${js}\nreturn { ${names.join(', ')} };`)(...keys.map((k) => env[k]))
}

function resolver(timeline: any[], over: { capabilities?: unknown; operations?: unknown[] } = {}) {
  const fns = canvasFunctions([
    'getSystemMsgKind', 'getSystemMsgLabel', 'getSystemMsgSub', 'getSystemMsgCtaLabel', 'getSystemMsgCta',
    'getSystemMsgCtas', 'getSystemMsgCtaAction', 'systemNoticeFor',
  ], {
    t,
    unref: (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v),
    talkList: { value: timeline },
    knownOperations: { value: over.operations || [] },
    stageHost: { capabilities: over.capabilities },
    allowsStageAction,
    isTerminalActionAllowed,
    terminalUIActionFromAllowedActions,
    terminalUIActionsFromAllowedActions,
    findResumableAgentOperation,
    operationFailureTitle,
    operationFailureSub,
  })
  return (index: number) => fns.systemNoticeFor(timeline[index], index)
}

const user = (id: string, content = '嗨') => ({ id, chatId: id, type: 1, content, chatFinish: true })
const failed = (over: Record<string, unknown> = {}) => ({
  id: 'operation-projection-op1', operationProjectionOnly: true, systemOnly: true, type: 0, content: '',
  chatLoading: false, chatFinish: true, isApplicationError: true,
  operationProjectionCapable: true, operationId: 'op1', operationKind: 'send', serverOperationKind: 'send',
  operationState: 'failed_retryable', sourceChatId: 'u1', allowedActions: ['retry', 'switch_model'],
  finishReason: 'server_error', failureCause: '',
  ...over,
})

describe('systemNoticeFor：跟一般卡同一組函式算出來的卡', () => {
  it('內部錯誤（最新一列）：伺服器不穩定的字，重試與切換模型兩顆鍵', () => {
    const notice = resolver([user('u1'), failed()])(1)
    expect(notice).toEqual({
      kind: 'server-error',
      label: t('systemMsg.serverError'),
      sub: t('systemMsg.serverErrorSub'),
      actions: [{ action: 'retry', label: t('chat.retry') }, { action: 'switch_model', label: t('chat.switchModel') }],
    })
  })

  it('模型暫時不能用：標題講原因（failureCause），按鍵照伺服器給的', () => {
    const notice = resolver([user('u1'), failed({ failureCause: 'service_unavailable' })])(1)
    expect(notice?.label).toBe(t('error.serviceUnavailable'))
    expect(notice?.sub).toBe(t('systemMsg.upstreamSub'))
    expect(notice?.actions.map((a: any) => a.action)).toEqual(['retry', 'switch_model'])
  })

  it('我們這邊出錯：說是我們的問題、道歉、沒扣點，按鍵照伺服器給的', () => {
    const notice = resolver([user('u1'), failed({ failureCause: 'internal_error' })])(1)
    expect(notice?.label).toBe(t('systemMsg.ourError'))
    expect(notice?.sub).toBe(t('systemMsg.ourErrorSub'))
    expect(notice?.actions.map((a: any) => a.action)).toEqual(['retry', 'switch_model'])
  })

  it('點數不足：點數的卡，沒有按了會落空的鍵', () => {
    const notice = resolver([user('u1'), failed({ finishReason: 'insufficient_credits', failureCause: 'insufficient_credits', operationState: 'failed_terminal', allowedActions: [] })])(1)
    expect(notice).toEqual({ kind: 'quota', label: t('chat.point_no_tips'), sub: t('chat.manageCredits'), actions: [] })
  })

  it('只有最新那一列有按鍵：舊的失敗留著字，鍵收掉', () => {
    const timeline = [user('u1'), failed(), user('u2', '再來'), { id: 'a2', chatId: 'a2', type: 0, content: '好', chatFinish: true, finishReason: 'stop' }]
    const notice = resolver(timeline)(1)
    expect(notice?.label).toBe(t('systemMsg.serverError'))
    expect(notice?.actions).toEqual([])
  })

  it('舊歷史（沒有操作投影）的停止：停止的卡＋繼續說', () => {
    const notice = resolver([user('u1'), { id: 'a1', chatId: 'a1', type: 0, content: '說到一半', chatFinish: true, finishReason: 'user_stop' }])(1)
    expect(notice).toEqual({ kind: 'stopped', label: t('systemMsg.stopped'), sub: t('systemMsg.stoppedSub'), actions: [{ action: 'continue', label: t('chat.say_continue') }] })
  })

  it('跟一般卡同一道能力閘：宿主不給接續類操作時沒有按鍵', () => {
    const notice = resolver([user('u1'), failed()], { capabilities: { actions: ['copy'] } })(1)
    expect(notice?.actions).toEqual([])
  })

  it('一般卡不畫卡的列，這裡也是 null：正常完成、Agent 中斷卡（另一張卡承載）、恢復不了的串流、還在跑的', () => {
    const rows = [
      { id: 'a1', type: 0, content: '好', chatFinish: true, finishReason: 'stop' },
      failed({ agentInterrupted: true, finishReason: 'agent_progress_preserved' }),
      { id: 'a3', type: 0, content: '', chatFinish: true, finishReason: 'resume_unavailable', systemOnly: true },
      { id: 'a4', type: 0, content: '', chatFinish: false, chatLoading: true, finishReason: '' },
      user('u9'),
    ]
    const resolve = resolver(rows)
    rows.forEach((_, i) => expect(resolve(i)).toBeNull())
  })

  it('模板與 systemNoticeFor 用的是同一組運算式（改一邊沒改另一邊就紅）', () => {
    const start = CANVAS.indexOf('<chat-system-message')
    const template = CANVAS.slice(start, CANVAS.indexOf('></chat-system-message>', start))
    const attr = (name: string) => {
      const m = template.match(new RegExp(`\\n\\s*${name.replace(/[-:]/g, (c) => `\\${c}`)}="([^"]*)"`))
      expect(m, `模板少了 ${name}`).toBeTruthy()
      return m![1]
    }
    const fnStart = CANVAS.indexOf('\nfunction systemNoticeFor(')
    const fn = CANVAS.slice(fnStart, CANVAS.indexOf('\nfunction ', fnStart + 1))
    for (const name of ['v-if', ':kind', ':label', ':sub', ':cta', ':cta-action', ':ctas']) {
      expect(fn, `systemNoticeFor 跟模板的 ${name} 不一樣`).toContain(attr(name))
    }
  })
})

describe('canvas.vue：沙箱卡的 view 帶系統訊息卡，殼回來的動作先核再做', () => {
  it('送進殼的 view 帶 systemNotice（一般卡的 messageProps 不動）', () => {
    expect(CANVAS).toMatch(/view: sandboxCard\.value \? \{ \.\.\.messageProps\(item, index, .*?\), systemNotice: systemNoticeFor\(item, index\) \} : undefined/)
  })

  it('卡已經畫在殼裡：不再另外彈一個問要不要重試的確認框（同一件事只說一次）', () => {
    expect(CANVAS).not.toContain('sandboxRetryPrompt')
    expect(CANVAS).not.toContain('promptSandboxRetry')
  })

  it('sys:<動作> 在訊息選單的能力閘之前處理，只放行這一列現在給的鍵，走卡片同一個 onSystemMsgCta', () => {
    const start = CANVAS.indexOf('\nfunction onMessageAction(')
    const body = CANVAS.slice(start, CANVAS.indexOf('\nfunction ', start + 1))
    const sys = body.indexOf("key.startsWith('sys:')")
    expect(sys).toBeGreaterThan(-1)
    expect(sys).toBeLessThan(body.indexOf('onMenuPick(key)'))
    expect(body).toContain('systemNoticeFor(row, index)')
    expect(body).toMatch(/\.actions\.some\(\(entry[^)]*\) => entry\.action === action\)/)
    expect(body).toContain('onSystemMsgCta(action, row, index)')
  })
})

// ── 宿主橋 ──────────────────────────────────────────────────────────────

const ORIGIN = 'https://c1.example.test'
const msg = (over: Partial<HudHostMessage> & { id: string }): HudHostMessage =>
  ({ role: 'assistant', text: '', html: '', opening: false, finished: true, canonicalLatestAI: false, ...over })
const state = (messages: HudHostMessage[]): HudHostState => ({
  character: { id: '1', name: '露娜', avatar: null }, messages, generation: 'idle', streamingMessageId: null, inputText: '',
  previewOnly: false, editing: { open: false, messageId: null, text: '' }, model: { selectedId: '', groups: [] },
  conversations: { currentId: 'c1', rows: [], full: false },
  persona: { mode: 'name_only', modes: [], name: '', genders: [], gender: '', identity: '' }, moreItems: [],
})
const NOTICE = { kind: 'server-error', label: '伺服器暫時不穩定', sub: '可能過載中，稍候再試', actions: [{ action: 'retry', label: '重試' }] }

describe('宿主橋：系統列送進殼', () => {
  let posted: Array<Record<string, any>>
  let iframe: HTMLIFrameElement
  let target: { postMessage: (data: unknown) => void }
  const fromShell = (message: Record<string, unknown>) =>
    window.dispatchEvent(new MessageEvent('message', { data: envelope(message as { type: string }), origin: ORIGIN, source: target as unknown as Window }))
  beforeEach(() => {
    posted = []
    iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    target = { postMessage: (data: unknown) => posted.push(structuredClone(data) as Record<string, any>) }
    Object.defineProperty(iframe, 'contentWindow', { value: target, configurable: true })
  })
  afterEach(() => { iframe.remove() })

  it('歷史還沒載到、畫面上只有一張系統卡（例如載入失敗）：不算冷啟動，等真的歷史來了再送', async () => {
    const current = { value: state([msg({ id: 'history-error', role: 'system', view: { role: 'system', html: '', systemNotice: NOTICE } })]) }
    const hud = { labels: {}, read: () => current.value } as unknown as HudHost
    const host = createSandboxHost({
      hud, iframe, win: window, origin: ORIGIN, roleId: '1',
      hello: () => ({ theme: 'dark', locale: 'zh-Hant', role: { name: '露娜', avatarUrl: '' }, user: { nickname: '小明', avatarUrl: '' }, card: { rules: [], statusbar: '' }, composer: true }),
      onMessageAction: () => {},
    })
    host.start()
    fromShell({ type: 'ready-shell' })
    await new Promise((r) => setTimeout(r, 0))
    expect(posted.some((p) => p.type === 'messages')).toBe(false)
    current.value = state([msg({ id: 'u1', role: 'user', text: '嗨' }), msg({ id: 'a1', text: '你好', html: '<p>你好</p>' })])
    host.sync()
    const cold = posted.find((p) => p.type === 'messages')!
    expect(cold.messages.map((m: any) => m.id)).toEqual(['hu1', 'ha1'])
    host.destroy?.()
  })

  it('冷啟動與之後長出來的系統列都送：角色 system、沒有 serverId、已定稿、帶算好的卡；殼按的鍵交給畫布', async () => {
    const current = { value: state([
      msg({ id: 'u1', role: 'user', text: '嗨' }),
      msg({ id: 'operation-projection-op1', role: 'system', view: { role: 'system', html: '', systemNotice: NOTICE } }),
    ]) }
    const actions: Array<[string, string]> = []
    const hud = { labels: {}, read: () => current.value } as unknown as HudHost
    const host = createSandboxHost({
      hud, iframe, win: window, origin: ORIGIN, roleId: '1',
      hello: () => ({ theme: 'dark', locale: 'zh-Hant', role: { name: '露娜', avatarUrl: '' }, user: { nickname: '小明', avatarUrl: '' }, card: { rules: [], statusbar: '' }, composer: true }),
      onMessageAction: (hostId, key) => actions.push([hostId, key]),
    })
    host.start()
    fromShell({ type: 'ready-shell' })
    await new Promise((r) => setTimeout(r, 0))
    const cold = posted.find((p) => p.type === 'messages')!
    expect(cold.messages).toEqual([
      { id: 'hu1', role: 'user', content: '嗨', serverId: null, state: 'done' },
      { id: 'hoperation-projection-op1', role: 'system', content: '', serverId: null, state: 'done', view: { role: 'system', html: '', systemNotice: NOTICE } },
    ])

    // 送出後失敗：玩家那句還在，底下多一列系統卡（不是 AI，不補 done）
    posted.length = 0
    current.value = state([
      ...current.value.messages,
      msg({ id: 'u2', role: 'user', text: '再一次' }),
      msg({ id: 'operation-projection-op2', role: 'system', view: { role: 'system', html: '', systemNotice: { ...NOTICE, kind: 'quota', actions: [] } } }),
    ])
    host.sync()
    const fresh = posted.filter((p) => p.type === 'message.new').map((p) => [p.message.id, p.message.role, p.message.view?.systemNotice?.kind ?? null])
    expect(fresh).toEqual([['l1', 'user', null], ['l2', 'system', 'quota']])
    expect(posted.some((p) => p.type === 'message.done' && p.id === 'l2')).toBe(false)
    expect(posted.some((p) => p.type === 'message.remove')).toBe(false)

    // 舊那張卡不再是最新：按鍵收起（呈現資料變了 → message.view）
    posted.length = 0
    current.value.messages[1] = msg({ id: 'operation-projection-op1', role: 'system', view: { role: 'system', html: '', systemNotice: { ...NOTICE, actions: [] } } })
    host.sync()
    expect(posted).toEqual([{ ms: 1, type: 'message.view', id: 'hoperation-projection-op1', view: { role: 'system', html: '', systemNotice: { ...NOTICE, actions: [] } } }])

    fromShell({ type: 'message.ui', id: 'l2', kind: 'action', key: 'sys:retry' })
    expect(actions).toEqual([['operation-projection-op2', 'sys:retry']])
    host.destroy()
  })
})
