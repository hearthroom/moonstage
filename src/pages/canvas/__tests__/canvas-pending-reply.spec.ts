// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasMessage from '../components/canvas-message.vue'
import {
  clearPendingReplyPhase,
  insertBeforePendingReply,
  isPendingReplyRow,
  markPendingReplyPhase,
  pendingReplyLabel,
  type PendingReplyRow,
} from '../canvas-pending-reply'

/*
  從按下送出到第一個字，回覆那一側一定要有一個看得到的東西。

  owner 2026-09-23（card 100019，長對話）：那一輪先整理劇情 43 秒、再讀 120K 的上下文，
  畫面上只有玩家自己的「1」和停止鍵，回覆那一側什麼都沒有。原因是收到 compacting
  時畫布把等回覆的氣泡拿掉，而接手的 pill 從來沒有搬過來。
*/

const T: Record<string, string> = {
  'chat.compacting': '整理劇情中…',
  'chat.aiReplying': '正在回覆',
  'chat.thinkingInProgress': '思考中',
}
const t = (k: string) => T[k] || k

const user = (): PendingReplyRow => ({ id: 'u1', type: 1, content: '1' })
const placeholder = (id = 'ai1'): PendingReplyRow => ({ id, type: 0, content: '', chatLoading: true, chatFinish: false })

describe('等回覆的氣泡在整理劇情期間留著', () => {
  it('送出後已有占位：compacting（伺服器每 15 秒重送）只換階段，不拿掉、不重複', () => {
    const list = [user(), placeholder()]
    const make = () => placeholder('new')
    markPendingReplyPhase(list, 'compacting', make)
    markPendingReplyPhase(list, 'compacting', make)
    expect(list.map((r) => r.id)).toEqual(['u1', 'ai1'])
    expect(list[1].pendingPhase).toBe('compacting')
    expect(pendingReplyLabel({ phase: list[1].pendingPhase, hasLiveSteps: false, t })).toBe('整理劇情中…')
  })

  it('末尾沒有占位（刷新進來接上正在整理的那一輪）：補一顆', () => {
    const list = [user()]
    markPendingReplyPhase(list, 'compacting', () => placeholder('resume'))
    expect(list.map((r) => r.id)).toEqual(['u1', 'resume'])
    expect(isPendingReplyRow(list[1])).toBe(true)
  })

  it('末尾是已完成或已有內容的 AI 訊息：不動它，另補一顆', () => {
    const done: PendingReplyRow = { id: 'old', type: 0, content: '上一輪', chatFinish: true }
    const list = [done, user()]
    markPendingReplyPhase(list, 'compacting', () => placeholder('p'))
    expect(done.pendingPhase).toBeUndefined()
    expect(list[list.length - 1].id).toBe('p')
  })

  it('整理完成：氣泡留著、標籤換回正在回覆；摘要插在它前面，回覆仍接在摘要之後', () => {
    const list = [user(), placeholder()]
    markPendingReplyPhase(list, 'compacting', () => placeholder('x'))
    clearPendingReplyPhase(list)
    expect(list[1].pendingPhase).toBe('')
    expect(pendingReplyLabel({ phase: list[1].pendingPhase, hasLiveSteps: false, t })).toBe('正在回覆')
    insertBeforePendingReply(list, { id: 'sum', type: 0, content: '摘要', chatFinish: true })
    expect(list.map((r) => r.id)).toEqual(['u1', 'sum', 'ai1'])
  })

  it('末尾不是等回覆的氣泡時，摘要照常接在最後', () => {
    const list = [user()]
    insertBeforePendingReply(list, { id: 'sum', type: 0, content: '摘要', chatFinish: true })
    expect(list.map((r) => r.id)).toEqual(['u1', 'sum'])
  })

  it('標籤：Agent 準備中寫思考中，有當下步驟用步驟文字，其餘正在回覆', () => {
    expect(pendingReplyLabel({ hasLiveSteps: true, t })).toBe('思考中')
    expect(pendingReplyLabel({ hasLiveSteps: false, prepStepText: '回想先前的劇情', t })).toBe('回想先前的劇情')
    expect(pendingReplyLabel({ hasLiveSteps: false, t })).toBe('正在回覆')
  })
})

describe('畫布接線（canvas.vue 的 inline WebSocket switch 無法獨立掛載，照既有慣例切原始碼）', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
  const slice = (start: string, end: string) => {
    const a = source.indexOf(start)
    const b = source.indexOf(end, a + start.length)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(b).toBeGreaterThan(a)
    return source.slice(a, b)
  }

  it('compacting 不再拿掉等回覆的氣泡，而是標成整理劇情中', () => {
    const body = slice("case 'compacting':\n        store.commit('setIsCompacting', true)", "case 'compactDone':")
    expect(body).not.toContain('removeOrphanPlaceholder()')
    expect(body).toContain("markPendingReplyPhase(talkList.value, 'compacting'")
  })

  it('compactDone／compactSkipped 清掉階段；摘要插在等回覆的氣泡之前', () => {
    const done = slice("case 'compactDone':", "case 'compactFailed':")
    expect(done).toContain('clearPendingReplyPhase(talkList.value)')
    expect(done).toContain('insertBeforePendingReply(talkList.value, summaryMsg)')
    expect(done).not.toContain('talkList.value.push(summaryMsg)')
    const skipped = slice("case 'compactSkipped':", "case 'waiting':")
    expect(skipped).toContain('clearPendingReplyPhase(talkList.value)')
  })

  it('messageProps 依氣泡的階段決定標籤，並把等候提示交給訊息元件（一般卡與沙箱卡同一份）', () => {
    const body = slice('function messageProps(', '\n}\n')
    expect(body).toContain('pendingReplyLabel(')
    expect(body).toContain('item.pendingPhase')
    // 任何一條清掉壓縮狀態的路徑（錯誤、看門狗、斷線、停止）都會讓標籤換回來
    expect(body).toContain('unref(isCompacting)')
    expect(body).toMatch(/\n\s+waitingHint,\n/)
    expect(body).toMatch(/\n\s+slowHint,\n/)
  })
})

describe('訊息元件：等回覆時的提示', () => {
  const BASE = { id: 'm1', mesid: 1, role: 'ai' as const, name: '角色', avatar: '', html: '', finished: false, loading: true, latest: true, swipes: null, prepSteps: null }

  it('伺服器說模型回應慢：指示器下方立即顯示那句話', () => {
    const el = mount(CanvasMessage, { props: { message: { ...BASE, loadingLabel: '正在回覆', waitingHint: '模型回應較慢，請耐心等待...' } } }).element as HTMLElement
    const hint = el.querySelector('.lt-waiting-hint')
    expect(hint?.textContent).toContain('模型回應較慢')
    expect(hint?.classList.contains('is-delayed')).toBe(false)
  })

  it('沒有伺服器提示時，放一句延遲浮現的提示（長上下文讀取要幾十秒）', () => {
    const el = mount(CanvasMessage, { props: { message: { ...BASE, loadingLabel: '正在回覆', slowHint: '模型回應較慢，請耐心等待...' } } }).element as HTMLElement
    const hint = el.querySelector('.lt-waiting-hint')
    expect(hint?.classList.contains('is-delayed')).toBe(true)
    expect(hint?.getAttribute('aria-hidden')).toBe('true')
  })

  it('沒有任何提示時不畫提示節點；有內容之後也不畫', () => {
    const a = mount(CanvasMessage, { props: { message: { ...BASE, loadingLabel: '整理劇情中…' } } }).element as HTMLElement
    expect(a.querySelector('.lt-waiting-hint')).toBeNull()
    expect(a.querySelector('.chat-typing-indicator')?.textContent).toContain('整理劇情中…')
    const b = mount(CanvasMessage, { props: { message: { ...BASE, loading: false, html: '<p>正文</p>', slowHint: 'x' } } }).element as HTMLElement
    expect(b.querySelector('.lt-waiting-hint')).toBeNull()
  })

  it('延遲浮現靠 CSS（不必計時器）：規則存在且只用 token 內的時長', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/pages/canvas/canvas.css'), 'utf8')
    const at = css.indexOf('.mes_text .lt-waiting-hint.is-delayed {')
    expect(at).toBeGreaterThan(-1)
    const rule = css.slice(at)
    expect(rule.slice(0, 400)).toMatch(/animation:[^;]*250ms[^;]*12s/)
  })
})
