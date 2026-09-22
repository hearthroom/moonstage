/*
  輸入區「往上侵入捲動區」的量。

  MMD 卡常在畫面底部放自己的固定工具列，然後用腳本把我們的輸入區整塊往上推
  （實測某張 MMD 匯入卡：`.composer-scope` 被加了 `transform: translateY(-52px)`）。
  推是推上去了，但捲動區的高度沒有跟著縮——輸入區蓋住捲動區最底下的 52px，
  最後一則訊息的結尾永遠捲不出來（owner 2026-09-04 回報：行動端最底部沒有
  padding、內容被吃掉）。

  這裡不猜作者用的是 transform、relative 還是 margin：直接量輸入區畫出來的
  top 跟捲動區 bottom 的差，差多少就給對話欄多少底部內距。
*/
export type OverhangInput = {
  /** 捲動區（.scroll-view）畫出來的下緣 */
  scrollBottom: number
  /** 捲動區畫出來的高度；侵入量不可能比它還大 */
  scrollHeight: number
  /** 輸入區畫出來的上緣（含 transform） */
  composerTop: number
  /** 輸入區畫出來的高度；0 = 被藏起來，那就沒有侵入 */
  composerHeight: number
}

export function composerOverhang(input: OverhangInput): number {
  const { scrollBottom, scrollHeight, composerTop, composerHeight } = input
  if (!(composerHeight > 0) || !(scrollHeight > 0)) return 0
  const raw = scrollBottom - composerTop
  if (!(raw > 0)) return 0
  // 作者把輸入區整個丟到畫面上半部這種極端狀況不當侵入處理：
  // 那不是「蓋住底部」，補內距只會把對話欄撐出一大片空白。
  if (raw > scrollHeight / 2) return 0
  return Math.round(raw)
}

export type PaintedRect = {
  top: number
  height: number
  width: number
  /** getComputedStyle(el).position；absolute／fixed 的子節點（浮在輸入區上方的選單、面板）不算輸入區本體 */
  position?: string
}

/*
  輸入區「畫出來的上緣」：整棵子樹裡最高的那個節點，而不只是最外層容器。

  作者腳本推輸入區時挑的是哪一層並不固定——實測那張 MMD 卡從 textarea 往上走，挑
  「寬過半、高不到 190、貼底」的最後一個祖先來套 translateY；同一張卡在不同機器上
  可能挑到 .composer-scope，也可能挑到它的子節點 .chat-bottom（owner 2026-09-22 的
  Android 截圖就是後者：玻璃那層推上去了，最外層沒動，侵入量量成 0，動作列壓在
  玻璃底下只露一半）。只看最外層就會漏掉這種情況。
*/
export function paintedTop(rects: PaintedRect[]): number {
  let top = Number.POSITIVE_INFINITY
  for (const r of rects) {
    if (!(r.height > 0) || !(r.width > 0)) continue
    if (r.position === 'absolute' || r.position === 'fixed') continue
    if (r.top < top) top = r.top
  }
  return top
}

export type BindOverhangOptions = {
  doc: Document
  win: Window
  /** 捲動區（.scroll-view）；沒有就不量 */
  scroll: HTMLElement | null
  /** 輸入區的最外層（.composer-scope）；沒有就不量 */
  composer: HTMLElement | null
  /** 變數寫在哪個節點：一般畫布是 documentElement，殼在 iframe 裡也是它自己的 documentElement */
  target: HTMLElement
}

export const COMPOSER_OVERHANG_VAR = '--lt-canvas-composer-overhang'

/*
  把「量侵入量 → 寫成 CSS 變數 → 盯著輸入區子樹的 style／class 與視窗尺寸」綁在一個文件上。
  一般畫布（canvas.vue）與沙箱殼（sandbox/shell.ts）都用這一個：殼在跨源 iframe 裡自己
  掛標準舞台與標準輸入區，作者腳本推的是 iframe 裡的輸入區，畫布那邊的觀察器看不到
  （owner 2026-09-22：沙箱卡在 Android 上動作列一直被推上來的輸入區蓋住，修一般畫布三次都
  沒動靜，因為根本不是同一份文件）。

  transform 不會觸發 ResizeObserver，所以盯的是 style／class 的變化——作者的腳本通常就是
  改這兩個把輸入區推上去的；subtree 是因為推的可能是子節點（paintedTop 的說明）。
*/
export function bindComposerOverhang(opts: BindOverhangOptions): () => void {
  const { doc, win, scroll, composer, target } = opts
  if (!scroll || !composer) return () => {}
  let raf = 0
  const measure = () => {
    const s = scroll.getBoundingClientRect()
    const c = composer.getBoundingClientRect()
    const rects: PaintedRect[] = [{ top: c.top, height: c.height, width: c.width, position: 'static' }]
    composer.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (!(r.height > 0)) return
      rects.push({ top: r.top, height: r.height, width: r.width, position: win.getComputedStyle(el).position })
    })
    const top = paintedTop(rects)
    const px = composerOverhang({ scrollBottom: s.bottom, scrollHeight: s.height, composerTop: Number.isFinite(top) ? top : c.top, composerHeight: c.height })
    if (px > 0) target.style.setProperty(COMPOSER_OVERHANG_VAR, px + 'px')
    else target.style.removeProperty(COMPOSER_OVERHANG_VAR)
  }
  const schedule = () => {
    if (raf) return
    const next = typeof win.requestAnimationFrame === 'function'
      ? (fn: () => void) => win.requestAnimationFrame(fn)
      : (fn: () => void) => win.setTimeout(fn, 16) as unknown as number
    raf = next(() => { raf = 0; measure() })
  }
  let observer: MutationObserver | null = null
  const MO = (win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null)
  if (MO) {
    observer = new MO(schedule)
    observer.observe(composer, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] })
  }
  win.addEventListener('resize', schedule)
  schedule()
  return () => {
    if (observer) { try { observer.disconnect() } catch { /* 收尾不得拋錯 */ } observer = null }
    win.removeEventListener('resize', schedule)
    try { target.style.removeProperty(COMPOSER_OVERHANG_VAR) } catch { /* 同上 */ }
    void doc
  }
}
