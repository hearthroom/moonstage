import { describe, expect, it } from 'vitest'
import { createFollowBottom } from '../render/follow-bottom'

// 假的捲動容器：scrollTop 可寫並夾在 [0, scrollHeight - clientHeight]，跟瀏覽器一樣。
function scroller(height: number, client = 733) {
  const listeners: Array<() => void> = []
  let top = 0
  const s = {
    clientHeight: client,
    scrollHeight: height,
    get scrollTop() { return top },
    set scrollTop(v: number) { top = Math.max(0, Math.min(v, s.scrollHeight - s.clientHeight)) },
    addEventListener: (_: string, cb: () => void) => { listeners.push(cb) },
    removeEventListener: (_: string, cb: () => void) => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1) },
    /** 內容高度改變（瀏覽器會夾 scrollTop，然後發 scroll 事件） */
    resize(h: number) { s.scrollHeight = h; s.scrollTop = top; for (const cb of listeners) cb() },
    /** 玩家自己捲 */
    userScroll(to: number) { s.scrollTop = to; for (const cb of listeners) cb() },
    listeners,
  }
  return s
}
const bind = (s: ReturnType<typeof scroller>) => {
  let grow: (() => void) | null = null
  const fb = createFollowBottom({ scroller: s as unknown as HTMLElement, observeGrowth: (cb) => { grow = cb; return () => { grow = null } } })
  return { fb, grow: () => grow && grow(), detached: () => grow == null }
}

describe('殼的跟到底', () => {
  // owner 2026-09-22 沙箱卡回報的原始情境：捲到底 → 最後一則重建時先縮 859px（瀏覽器夾回）→ 面板長回來。
  it('在底部時內容先縮再長回來（虛擬化重建），最後仍在底部', () => {
    const s = scroller(12774)
    const { fb, grow } = bind(s)
    s.userScroll(12774 - 733); fb.pin()
    s.resize(11915); grow()                       // 重建當下較矮：夾回 11182
    expect(s.scrollTop).toBe(11915 - 733)
    s.resize(12775); grow()                       // 面板長回來：要跟到新的底
    expect(s.scrollTop).toBe(12775 - 733)
    expect(fb.following()).toBe(true)
  })

  it('玩家往上捲離開底部之後，內容撐高不再把人拉回去；回到底部又恢復跟隨', () => {
    const s = scroller(5000)
    const { fb, grow } = bind(s)
    s.userScroll(5000 - 733)
    s.userScroll(2000)
    expect(fb.following()).toBe(false)
    s.resize(6000); grow()
    expect(s.scrollTop).toBe(2000)
    s.userScroll(6000 - 733 - 3)                  // 離底 3px 內算在底部
    expect(fb.following()).toBe(true)
    s.resize(6500); grow()
    expect(s.scrollTop).toBe(6500 - 733)
  })

  it('殼自己捲到底（pin）之後跟隨；冷啟動預設就是跟隨', () => {
    const s = scroller(3000)
    const { fb, grow } = bind(s)
    expect(fb.following()).toBe(true)
    s.resize(4000); grow()
    expect(s.scrollTop).toBe(4000 - 733)
    s.userScroll(100)
    expect(fb.following()).toBe(false)
    s.scrollTop = s.scrollHeight; fb.pin()
    s.resize(4500); grow()
    expect(s.scrollTop).toBe(4500 - 733)
  })

  it('dispose 之後不再監聽', () => {
    const s = scroller(3000)
    const { fb, detached } = bind(s)
    fb.dispose()
    expect(s.listeners.length).toBe(0)
    expect(detached()).toBe(true)
  })
})
