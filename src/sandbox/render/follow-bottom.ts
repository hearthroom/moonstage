/*
  跟到底：內容撐高時，若玩家本來就在底部，就把捲動位置跟到新的底部。

  由來（owner 2026-09-22，沙箱卡在 Android／iOS 上「拖到底又跳回上面」「最後一則的動作列露不出來」）：
  捲到底時最後幾則的虛擬化空殼被重建，重建當下比空殼矮（作者的狀態面板是腳本在 mount 之後才補畫的），
  scrollHeight 先縮，瀏覽器把 scrollTop 夾回新的底；面板長回來之後 scrollHeight 又變大，畫面就停在離底
  幾百 px 的地方。一般畫布靠捲底哨兵＋IntersectionObserver 做同一件事，殼沒有，這裡補上。

  「玩家本來就在底部」怎麼判斷：只有 scrollHeight 沒變的 scroll 事件才算玩家自己捲的，用它更新意圖；
  scrollHeight 變了的 scroll 事件是內容變動（撐高、縮短、夾回）造成的，不動意圖。殼自己捲到底（onGrow）
  時把意圖釘成「在底部」。
*/
export type FollowBottomDeps = {
  scroller: HTMLElement
  /** 內容高度變化的來源：預設用 ResizeObserver 盯 content；測試注入假的 */
  observeGrowth?: (cb: () => void) => () => void
  content?: Element | null
  win?: Window & typeof globalThis
  /** 離底多少 px 內算「在底部」 */
  threshold?: number
}

export type FollowBottom = {
  /** 殼自己捲到底之後叫：意圖釘成在底部 */
  pin(): void
  following(): boolean
  dispose(): void
}

export function createFollowBottom(deps: FollowBottomDeps): FollowBottom {
  const { scroller } = deps
  const threshold = deps.threshold ?? 8
  let follow = true
  let lastHeight = scroller.scrollHeight
  const distance = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
  const onScroll = () => {
    const height = scroller.scrollHeight
    if (height === lastHeight) follow = distance() <= threshold
    lastHeight = height
  }
  scroller.addEventListener('scroll', onScroll, { passive: true })
  // 瀏覽器一幀裡的順序是 scroll 事件（夾回造成的）先、ResizeObserver 後，所以這裡不能拿
  // 「scrollHeight 沒變」當判斷；在跟隨中而人不在底部，就跟上去。
  const onGrowth = () => {
    lastHeight = scroller.scrollHeight
    if (follow && distance() > threshold) scroller.scrollTop = scroller.scrollHeight
  }
  const observe = deps.observeGrowth ?? ((cb: () => void) => {
    const RO = (deps.win || (typeof window !== 'undefined' ? window : undefined))?.ResizeObserver
    const target = deps.content
    if (!RO || !target) return () => {}
    const ro = new RO(cb)
    ro.observe(target)
    return () => ro.disconnect()
  })
  const unobserve = observe(onGrowth)
  return {
    pin() { follow = true; lastHeight = scroller.scrollHeight },
    following: () => follow,
    dispose() { scroller.removeEventListener('scroll', onScroll); unobserve() },
  }
}
