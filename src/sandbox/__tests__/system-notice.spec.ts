// @vitest-environment jsdom
/**
 * 沙箱卡看得到系統訊息卡（誠實的失敗與下一步）。
 *
 * 一般卡在每一列底下掛 <chat-system-message>（內部錯誤、點數不足、模型暫時不能用、停止…）；
 * 沙箱卡以前把這些列整批濾掉，殼也沒有地方畫，玩家送出後什麼都看不到。現在宿主把一般卡
 * 算好的那張卡（語氣、標題、說明、按鍵，都是玩家語系的字）放在 view.systemNotice，殼用同一個
 * 元件掛在那一列底下；按鍵交回宿主，跟重新生成一樣只認真的手勢。系統列是平台的介面，
 * 不是對話內容：作者腳本不會收到它的任何事件。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { createShell, type Shell } from '../shell'
import { createMessageList, type MessageUi } from '../render/message-list'
import { createEventBus } from '../sdk/events'
import type { MessageView, SandboxHelloConfig, SandboxMessage, ShellToHost } from '../protocol'

const notice = (over: Record<string, unknown> = {}) => ({
  kind: 'server-error',
  label: '伺服器暫時不穩定',
  sub: '可能過載中，稍候再試',
  actions: [{ action: 'retry', label: '重試' }, { action: 'switch_model', label: '切換模型' }],
  ...over,
})

const systemRow = (id: string, systemNotice: unknown): SandboxMessage => ({
  id, role: 'system', content: '', serverId: null, state: 'done',
  view: { role: 'system', name: '露娜', html: '', finished: true, systemNotice } as MessageView,
})

function listHarness() {
  document.body.innerHTML = '<div id="list"></div>'
  const list = document.getElementById('list')!
  const bus = createEventBus()
  const log: string[] = []
  for (const ev of ['message:new', 'message:mount', 'message:done', 'message:unmount', 'message:stream'] as const) {
    bus.on(ev, (p) => log.push(`${ev.slice(8)}:${(p as { id: string }).id}`))
  }
  const ui: Array<[string, MessageUi]> = []
  const ml = createMessageList({
    doc: document, list, bus, render: (c) => `<p>${c}</p>`, strings: { generating: '…' },
    roleName: '露娜', roleAvatar: '', userName: '小明', userAvatar: '',
    onUi: (id, u) => ui.push([id, u]),
  })
  const frameOf = (id: string) => (list.querySelectorAll('[data-chat="message-frame"]')[ml.ids().indexOf(id)] as HTMLElement)
  return { ml, list, log, ui, frameOf }
}

describe('沙箱殼：系統訊息卡', () => {
  it('系統列畫出宿主算好的卡：語氣、標題、說明、按鍵都照給的字', () => {
    const h = listHarness()
    h.ml.reset([
      { id: 'h1', role: 'user', content: '嗨', serverId: null, state: 'done' },
      systemRow('h2', notice()),
    ])
    const card = h.frameOf('h2').querySelector('.sys-msg-card') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.classList.contains('sys-kind-server-error')).toBe(true)
    expect(card.querySelector('.sys-label')!.textContent).toBe('伺服器暫時不穩定')
    expect(card.querySelector('.sys-sub-text')!.textContent).toBe('可能過載中，稍候再試')
    expect(Array.from(card.querySelectorAll('.sys-cta')).map((b) => b.textContent!.trim())).toEqual(['重試', '切換模型'])
    // 卡掛在那一列自己底下（跟一般卡同一個位置），玩家那一列沒有
    expect(h.frameOf('h1').querySelector('.sys-msg-card')).toBeNull()
  })

  it('按鍵交回宿主：key 是 sys:<動作>，不是訊息選單的鍵', async () => {
    const h = listHarness()
    h.ml.reset([systemRow('h2', notice())])
    const buttons = h.frameOf('h2').querySelectorAll<HTMLElement>('.sys-cta')
    buttons[0].click()
    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(h.ui).toEqual([
      ['h2', { kind: 'action', key: 'sys:retry' }],
      ['h2', { kind: 'action', key: 'sys:switch_model' }],
    ])
  })

  it('作者腳本收不到系統列的任何事件（新增、掛上、定稿、移除都沒有）', () => {
    const h = listHarness()
    h.ml.reset([
      { id: 'h1', role: 'user', content: '嗨', serverId: null, state: 'done' },
      systemRow('h2', notice()),
    ])
    h.ml.add(systemRow('l1', notice({ kind: 'quota', label: '點數已用完', actions: [] })))
    h.ml.done('l1', '', null, systemRow('l1', notice({ actions: [] })).view)
    h.ml.remove('h2')
    // 冷啟動那包每則定稿的都補一個 done：玩家那句有，系統列沒有
    expect(h.log).toEqual(['new:h1', 'mount:h1', 'done:h1'])
    expect(h.list.querySelectorAll('.sys-msg-card')).toHaveLength(1)
  })

  it('AI 回覆底下的卡跟著呈現資料換：不再是最新一列時按鍵收起，卡本身留著', async () => {
    const h = listHarness()
    const stopped = { kind: 'stopped', label: '已停止生成', sub: '你中斷了這次生成', actions: [{ action: 'continue', label: '繼續' }] }
    h.ml.reset([{ id: 'h3', role: 'ai', content: '說到一半', serverId: '3', state: 'done', view: { role: 'ai', html: '<p>說到一半</p>', finished: true, systemNotice: stopped } as MessageView }])
    const frame = h.frameOf('h3')
    expect(frame.querySelector('.lt-bubble-body')!.textContent).toBe('說到一半')
    expect(frame.querySelectorAll('.sys-cta')).toHaveLength(1)
    h.ml.setView('h3', { role: 'ai', html: '<p>說到一半</p>', finished: true, systemNotice: { ...stopped, actions: [] } } as MessageView)
    await nextTick()
    expect(frame.querySelector('.sys-msg-card .sys-label')!.textContent).toBe('已停止生成')
    expect(frame.querySelectorAll('.sys-cta')).toHaveLength(0)
    h.ml.setView('h3', { role: 'ai', html: '<p>說到一半</p>', finished: true, systemNotice: null } as MessageView)
    await nextTick()
    expect(frame.querySelector('.sys-msg-card')).toBeNull()
  })
})

describe('沙箱殼：系統訊息卡的按鍵只認真的手勢', () => {
  let shell: Shell | null = null
  afterEach(() => { shell?.dispose(); shell = null; delete (window as unknown as Record<string, unknown>).sdk })

  it('作者腳本合成的 click 不會替玩家按重試；腳本的訊息事件裡也沒有系統列', () => {
    const config: SandboxHelloConfig = {
      theme: 'dark', locale: 'zh-Hant', role: { name: '露娜', avatarUrl: '' }, user: { nickname: '小明', avatarUrl: '' },
      card: { rules: [{ id: 1, name: 'kit', find: '{{kit}}', replace: `<script>window.__ids = []; sdk.on('message:new', function (p) { window.__ids.push(p.id + ':' + p.role); });</script>` }], statusbar: '' },
      capabilities: { saves: false, edit: false, send: true }, composer: true,
    }
    const sent: ShellToHost[] = []
    document.body.innerHTML = '<div id="app"></div>'
    shell = createShell({ doc: document, win: window as Window & typeof globalThis, mount: document.getElementById('app')!, config, transport: { send: (m) => sent.push(m) } })
    shell.handle({ type: 'messages', messages: [{ id: 'h1', role: 'user', content: '嗨', serverId: null }, systemRow('h2', notice())] })
    expect((window as unknown as { __ids: string[] }).__ids).toEqual(['h1:user'])
    const retry = shell.refs.list.querySelector<HTMLElement>('.sys-cta')!
    expect(retry.textContent!.trim()).toBe('重試')
    // jsdom 合成的 click 是 isTrusted=false：跟作者腳本代按一樣，不轉給宿主。
    retry.click()
    expect(sent.filter((m) => m.type === 'message.ui')).toEqual([])
  })
})
