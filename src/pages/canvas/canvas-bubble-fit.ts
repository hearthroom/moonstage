/*
  氣泡不准超出對話欄——卡片內容寫死多寬都一樣。

  氣泡那一列（.mes_turn）在 canvas.css 裡撐到內容的最小寬度：作者用 vw 寫死寬度的面板
  （#100076：`.character-panel-wrap{width:80vw}`，手機上 344px）不再伸出氣泡外框，外框跟著
  內容走。但 min-content 沒有上限——作者寫 width:700px，氣泡就被撐到 700px，捲動區雖然
  overflow-x:hidden，內容已經在畫面外，程式捲動（捲到某個元素）還是能把整頁往旁邊推。
  這個頁面沒有設計任何橫向捲動，所以這裡保底：氣泡碰到對話欄邊界（兩側各留 EDGE）就釘住
  寬度，裡面伸出去的最外層元素收進 max-width:100%。

  只在真的超出時動手，沒超出的氣泡一個屬性都不碰。動過的都標上屬性，視窗尺寸一變先全部
  拿掉再量——上限是跟著畫面寬度算的，轉向之後舊的數字就不對了。
*/

export const FIT_ATTR = 'data-lt-fit'
const FIT_CHILD_ATTR = 'data-lt-fit-child'
/** 氣泡離對話欄邊界至少留多少 */
const EDGE = 8
const MAX_NODES = 2000

export type Span = { left: number; right: number }

/** 超出上限時氣泡該釘的寬度；沒超出 → null。靠左的往右超、靠右的（玩家）往左超，兩種都算。 */
export function bubbleCap(bubble: Span, limit: Span): number | null {
  const overRight = bubble.right > limit.right + 0.5
  const overLeft = bubble.left < limit.left - 0.5
  if (!overRight && !overLeft) return null
  if (overRight && overLeft) return Math.floor(limit.right - limit.left)
  return Math.floor(overRight ? limit.right - bubble.left : bubble.right - limit.left)
}

/**
 * 量一個氣泡，超出就鎖回來。回傳有沒有動。
 * 伸出的判斷用「鎖完之後的內容區」：氣泡釘寬之後內容區的左右界是算得出來的，不用再量一次版面。
 */
export function clampWideBubble(bubble: HTMLElement, limit: Span, win: Window): boolean {
  const r = bubble.getBoundingClientRect()
  const cap = bubbleCap(r, limit)
  if (cap == null || !(cap > 0)) return false
  // cap 是外框（含內距與邊框）的寬；content-box 的氣泡（沙箱殼）要扣掉再寫，外框才正好停在上限。
  const style = win.getComputedStyle(bubble)
  const px = (v: string) => parseFloat(v) || 0
  const insetLeft = px(style.paddingLeft) + px(style.borderLeftWidth)
  const insetRight = px(style.paddingRight) + px(style.borderRightWidth)
  const cssWidth = style.boxSizing === 'border-box' ? cap : Math.max(0, cap - insetLeft - insetRight)
  bubble.setAttribute(FIT_ATTR, '')
  bubble.style.width = cssWidth + 'px'
  bubble.style.maxWidth = cssWidth + 'px'

  const overRight = r.right > limit.right + 0.5
  const overLeft = r.left < limit.left - 0.5
  const boxLeft = overRight && overLeft ? limit.left : overRight ? r.left : r.right - cap
  const contentLeft = boxLeft + insetLeft
  const contentRight = boxLeft + cap - insetRight

  const stack: Element[] = Array.from(bubble.children).reverse()
  let seen = 0
  while (stack.length && seen < MAX_NODES) {
    const el = stack.pop() as HTMLElement
    seen++
    let s: CSSStyleDeclaration
    try { s = win.getComputedStyle(el) } catch { continue }
    if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') continue // 裝飾與浮層是作者刻意放的位置
    const er = el.getBoundingClientRect()
    if (er.right > contentRight + 0.5 || er.left < contentLeft - 0.5) {
      // 最外層伸出去的那個收進來；它底下的東西跟著它的寬度走，不再逐層改。
      el.setAttribute(FIT_CHILD_ATTR, '')
      el.style.maxWidth = '100%'
      el.style.minWidth = '0px'
      continue
    }
    for (let i = el.children.length - 1; i >= 0; i--) stack.push(el.children[i])
  }
  return true
}

/** 拿掉這裡加的寬度（只拿自己加的屬性，作者原本的 inline 樣式留著）。 */
export function resetBubbleFit(root: ParentNode): void {
  root.querySelectorAll('[' + FIT_ATTR + ']').forEach((el) => {
    const h = el as HTMLElement
    h.style.removeProperty('width')
    h.style.removeProperty('max-width')
    h.removeAttribute(FIT_ATTR)
  })
  root.querySelectorAll('[' + FIT_CHILD_ATTR + ']').forEach((el) => {
    const h = el as HTMLElement
    h.style.removeProperty('max-width')
    h.style.removeProperty('min-width')
    h.removeAttribute(FIT_CHILD_ATTR)
  })
}

export type BindBubbleFitOptions = {
  doc: Document
  win: Window
  /** 對話欄（#chat）：上限取它的左右界 */
  chat: HTMLElement | null
  /** 盯這個節點的子樹增減（新訊息、串流改寫） */
  observe: Node | null
  /** 觀察器盯不到的時機（殼：訊息掛上、定稿）。拆掉之後的通知一律不理。 */
  subscribe?: (refresh: () => void) => void
}

/*
  平常只量最後三則（新訊息、串流中的那則）；視窗尺寸一變全部重來。一般畫布與沙箱殼共用。
*/
export function bindBubbleFit(opts: BindBubbleFitOptions): () => void {
  const { win, chat, observe, subscribe } = opts
  if (!chat) return () => {}
  let raf = 0
  let full = true
  let disposed = false
  const run = () => {
    const c = chat.getBoundingClientRect()
    if (!(c.width > 0)) return
    const limit = { left: c.left + EDGE, right: c.right - EDGE }
    const bubbles = Array.from(chat.querySelectorAll('.mes_text')) as HTMLElement[]
    const targets = full ? bubbles : bubbles.slice(-3)
    if (full) resetBubbleFit(chat)
    else for (const b of targets) { if (b.hasAttribute(FIT_ATTR)) resetBubbleFit(b.parentNode || b) }
    full = false
    for (const b of targets) { try { clampWideBubble(b, limit, win) } catch { /* 單一氣泡量不到不影響其他 */ } }
  }
  const schedule = (all?: boolean) => {
    if (disposed) return
    if (all) full = true
    if (raf) return
    const next = typeof win.requestAnimationFrame === 'function'
      ? (fn: () => void) => win.requestAnimationFrame(fn)
      : (fn: () => void) => win.setTimeout(fn, 16) as unknown as number
    raf = -1
    const id = next(() => { raf = 0; if (!disposed) run() })
    if (raf === -1) raf = id
  }
  const onResize = () => schedule(true)
  let observer: MutationObserver | null = null
  const MO = (win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null)
  if (MO && observe) {
    observer = new MO(() => schedule())
    observer.observe(observe, { childList: true, subtree: true })
  }
  win.addEventListener('resize', onResize)
  if (subscribe) { try { subscribe(() => schedule()) } catch { /* 訂不到就只靠觀察器 */ } }
  schedule(true)
  return () => {
    disposed = true
    if (observer) { try { observer.disconnect() } catch { /* 收尾不得拋錯 */ } observer = null }
    win.removeEventListener('resize', onResize)
    try { resetBubbleFit(chat) } catch { /* 同上 */ }
  }
}
