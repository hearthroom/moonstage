// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createShell, type Shell } from '../shell'
import type { HostToShell, SandboxCardState, SandboxHelloConfig } from '../protocol'
import type { StatePanelLabels } from '@/common/panel/state-panel'

const LABELS: StatePanelLabels = {
  open: '數值面板', title: '數值面板', close: '關閉', updatedLatest: '最新一輪更新', updatedOneAgo: '上一輪更新', updatedAgo: '{n} 輪前更新',
  updatedOpening: '開場時的數值', showRaw: '查看原始數值', showPanel: '返回面板', rejected: '未採用的變更', unavailable: '面板暫時無法顯示',
  unavailableSub: '數值照常記錄，可以先查看原始數值。', errorAt: '面板皮膚第 {line} 行有錯誤：{message}', errorHelper: '面板皮膚第 {line} 行用了不支援的 helper「{helper}」', copied: '已複製',
}

function config(over: Partial<SandboxHelloConfig> = {}): SandboxHelloConfig {
  return {
    theme: 'dark', locale: 'zh-Hant', role: { name: '露娜', avatarUrl: '' }, user: { nickname: '小明', avatarUrl: '' },
    card: { rules: [], statusbar: '' }, capabilities: { saves: false, edit: false, send: true }, composer: true, ...over,
  }
}

let shell: Shell | null = null
const boot = (cfg: SandboxHelloConfig) => {
  shell?.dispose()
  document.body.innerHTML = '<div id="app"></div>'
  shell = createShell({ doc: document, win: window as Window & typeof globalThis, mount: document.getElementById('app')!, config: cfg, transport: { send: () => {} } })
  return shell
}
afterEach(() => { shell?.dispose(); shell = null; delete (window as unknown as Record<string, unknown>).sdk })

const st = (messageId: string, seq: number, data: unknown): SandboxCardState => ({ messageId, data, changes: [], seq, source: seq ? 'inline' : 'seed' })

describe('殼：卡片數值', () => {
  it('舊殼相容：不認得的訊息 type 一律忽略，不丟錯、畫面不動', () => {
    const s = boot(config())
    s.handle({ type: 'messages', messages: [{ id: 'g', role: 'ai', content: '你好', serverId: null }] })
    const before = document.body.innerHTML
    expect(() => s.handle({ type: 'state-from-the-future', id: 'g', whatever: 1 } as unknown as HostToShell)).not.toThrow()
    expect(document.body.innerHTML).toBe(before)
  })

  it('沒有數值設定：不畫鍵；有數值設定但沒皮膚：不畫鍵，sdk.state 照常', () => {
    boot(config())
    expect(document.querySelector('[data-lt="state-panel"]')).toBeNull()
    const s = boot(config({ cardState: { initial: { a: 1 } } }))
    expect(document.querySelector('[data-lt="state-panel"]')).toBeNull()
    expect(s.sdk.state.get()).toEqual({ messageId: null, data: { a: 1 }, changes: [] })
  })

  it('沒帶呈現資料的訊息：state 訊息補上數值，發 state:change；state=null 拿掉', () => {
    const s = boot(config({ cardState: { initial: { a: 0 } } }))
    const seen: unknown[] = []
    s.sdk.on('state:change', (p) => seen.push(p))
    s.handle({ type: 'messages', messages: [{ id: 'greeting', role: 'ai', content: '開場', serverId: null }, { id: 'h2', role: 'user', content: '嗨', serverId: null }] })
    expect(seen).toEqual([])
    s.handle({ type: 'state', id: 'greeting', state: st('1', 0, { a: 1 }) })
    expect(seen).toEqual([{ messageId: '1', data: { a: 1 }, changes: [] }])
    s.handle({ type: 'state', id: 'greeting', state: st('1', 0, { a: 1 }) })
    expect(seen).toHaveLength(1)
    s.handle({ type: 'message.new', message: { id: 'l1', role: 'ai', content: '回覆', serverId: '3', state: 'done' } })
    s.handle({ type: 'state', id: 'l1', state: st('3', 1, { a: 2 }) })
    expect(s.sdk.state.get()).toEqual({ messageId: '3', data: { a: 2 }, changes: [] })
    expect(s.sdk.state.of('h2')).toEqual({ messageId: '1', data: { a: 1 }, changes: [] })
    s.handle({ type: 'state', id: 'l1', state: null })
    expect(s.sdk.state.get()?.messageId).toBe('1')
    // 現值那一份不在了：整條重發
    expect(seen.map((p) => (p as { messageId: string }).messageId)).toEqual(['1', '3', '1'])
  })

  it('切會話：數值清掉、補發記錄清掉，新會話從頭發', () => {
    const s = boot(config({ cardState: {} }))
    s.handle({ type: 'messages', messages: [{ id: 'greeting', role: 'ai', content: '開場', serverId: null, view: { html: '<p>開場</p>', state: st('1', 0, { a: 1 }) } }] })
    expect(s.sdk.state.get()?.messageId).toBe('1')
    s.handle({ type: 'conversation.switch', conversationId: 'c2' })
    expect(s.sdk.state.get()).toBeNull()
    const late: unknown[] = []
    s.sdk.on('state:change', (p) => late.push(p))
    expect(late).toEqual([])
    s.handle({ type: 'messages', messages: [{ id: 'greeting', role: 'ai', content: '開場', serverId: null, view: { html: '<p>開場</p>', state: st('9', 0, { b: 1 }) } }] })
    expect(late).toEqual([{ messageId: '9', data: { b: 1 }, changes: [] }])
  })

  it.each(['author', 'player'] as const)('皮膚出錯（%s）：作者看到行號與 helper，玩家看到中性提示', async (audience) => {
    boot(config({ cardState: { initial: { a: 1 }, panel: { template: 'x\n{{format a}}', audience, labels: LABELS } } }))
    await nextTick()
    const error = document.querySelector('.lt-state-error')!.textContent
    if (audience === 'author') expect(error).toBe('面板皮膚第 2 行用了不支援的 helper「format」')
    else expect(error).toBe('面板暫時無法顯示數值照常記錄，可以先查看原始數值。')
  })

  it('面板跟著現值與「更新於」走', async () => {
    const s = boot(config({ cardState: { initial: { a: 0 }, panel: { template: '<b>{{a}}</b>{{#each @changes}}<i>{{path}}</i>{{/each}}', audience: 'player', labels: LABELS } } }))
    await nextTick()
    const skin = () => document.querySelector('[data-lt="state-panel-skin"]')!.innerHTML
    const updated = () => document.querySelector('.lt-state-updated')!.textContent
    expect(skin()).toBe('<b>0</b>')
    expect(updated()).toBe('開場時的數值')
    s.handle({ type: 'messages', messages: [
      { id: 'greeting', role: 'ai', content: '開場', serverId: null },
      { id: 'h2', role: 'user', content: '嗨', serverId: null },
      { id: 'h3', role: 'ai', content: '回覆', serverId: '3' },
    ] })
    s.handle({ type: 'state', id: 'h3', state: { messageId: '3', data: { a: 5 }, changes: [{ op: 'set', path: 'a', old: 0, new: 5 }], seq: 1, source: 'inline' } })
    await nextTick()
    expect(skin()).toBe('<b>5</b><i>a</i>')
    expect(updated()).toBe('最新一輪更新')
    s.handle({ type: 'message.new', message: { id: 'l1', role: 'user', content: '再來', serverId: null, state: 'done' } })
    s.handle({ type: 'message.new', message: { id: 'l2', role: 'ai', content: '好', serverId: '5', state: 'done' } })
    await nextTick()
    expect(updated()).toBe('上一輪更新')
  })
})
