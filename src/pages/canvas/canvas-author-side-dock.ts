/*
  作者側欄「停靠在對話欄兩側」時，對話欄讓出多少。

  MMD 卡常在畫面左右貼一條固定的快捷欄（圖片管理、上下捲、角色創建⋯⋯），它是照 MMD 的
  版面畫的；到我們這邊對話欄的左右內距只有 10–12px，側欄就壓在氣泡上。實測 #100076
  （owner 2026-09-25 截圖）：手機 430 寬，左欄畫在 0–28、右邊兩個頁籤 401–430，氣泡兩側
  各被蓋掉 18–19px。

  這裡不看作者怎麼寫，只看畫出來的形狀：
  - 候選只有作者的 fixed 節點（一般畫布是作者容器裡的，殼是作者自己掛的）；量整棵子樹畫出來
    的範圍——#100076 的左欄外層本身是 0×0，按鈕是底下 absolute 的子節點，只量外層會量成 0。
  - 猜測：貼著對話欄左緣或右緣、夠窄、伸進對話欄不超過上限、有壓到訊息區的那一段。
    全螢幕彈窗、浮在中間的面板、只在頁首的東西、太寬的欄都不算——讓一半還是擋，只會讓氣泡平白變窄。
  - 作者宣告（CSS 變數 --lt-dock: left | right | none）優先於猜測：none 完全不讓；left／right
    不必貼邊、上限放寬到對話欄三成寬。用 CSS 變數而不是 data 屬性：殼的淨化會剝掉訊息 HTML 裡的
    data-*，作者 CSS 則原樣生效，兩種頁面才能用同一種寫法。
  - 讓完之後欄寬不到原本四分之三（或 240px）就整個不讓，小螢幕不擠成一條。

  寫出去的是「內距至少要多少」，CSS 用 max(原內距, 變數)：量出來比原內距小（桌機欄置中，側欄
  碰不到氣泡）就等於沒變。量的是 #chat 的外框，不受這份內距影響，不會自己觸發自己。
*/

export type Box = { left: number; top: number; right: number; bottom: number }

/** 作者在候選節點上寫的 --lt-dock；空字串 = 沒宣告，走猜測。 */
export type DockDeclaration = 'left' | 'right' | 'none' | ''

export type DockCandidate = {
  /** 畫出來的範圍（paintedBox）；null = 看不到 */
  box: Box | null
  declared: DockDeclaration
}

export type DockInput = {
  /** 左右取 #chat 的外框，上下取捲動區看得到的那一段 */
  lane: Box
  candidates: DockCandidate[]
}

export type DockClearance = { left: number; right: number }

/** 「貼邊」的容許誤差 */
const EDGE_SLOP = 4
/** 讓到側欄外緣之後再多留的空隙 */
const GAP = 6
/** 猜測：側欄本身最寬多少 */
const GUESS_MAX_WIDTH = 48
/** 猜測：伸進對話欄最多多少（取兩者較小） */
const GUESS_MAX_INTRUSION = 36
const GUESS_MAX_INTRUSION_RATIO = 0.1
/** 宣告：伸進對話欄最多占欄寬幾成 */
const DECLARED_MAX_INTRUSION_RATIO = 0.3
/** 至少要有這麼多高度壓在訊息區上才算（或整個側欄都在訊息區裡） */
const MIN_VERTICAL_OVERLAP = 24
/** 讓完之後的欄寬下限 */
const MIN_COLUMN_RATIO = 0.75
const MIN_COLUMN_PX = 240

function intrusionOf(side: 'left' | 'right', box: Box, lane: Box): number {
  return side === 'left' ? box.right - lane.left : lane.right - box.left
}

function guessSide(box: Box, lane: Box): 'left' | 'right' | null {
  const width = box.right - box.left
  if (width > GUESS_MAX_WIDTH) return null
  const cap = Math.min(GUESS_MAX_INTRUSION, (lane.right - lane.left) * GUESS_MAX_INTRUSION_RATIO)
  const atLeft = box.left <= lane.left + EDGE_SLOP
  const atRight = box.right >= lane.right - EDGE_SLOP
  if (atLeft === atRight) return null // 沒貼邊，或兩邊都貼（整條橫過去）
  const side = atLeft ? 'left' : 'right'
  return intrusionOf(side, box, lane) <= cap ? side : null
}

export function sideDockClearance(input: DockInput): DockClearance {
  const { lane, candidates } = input
  const laneWidth = lane.right - lane.left
  const out: DockClearance = { left: 0, right: 0 }
  if (!(laneWidth > 0)) return out
  const laneCenter = (lane.left + lane.right) / 2

  for (const c of candidates) {
    const box = c.box
    if (!box || c.declared === 'none') continue
    const height = box.bottom - box.top
    const overlap = Math.min(box.bottom, lane.bottom) - Math.max(box.top, lane.top)
    if (!(overlap >= Math.min(MIN_VERTICAL_OVERLAP, height)) || !(overlap > 0)) continue

    let side: 'left' | 'right' | null
    if (c.declared === 'left' || c.declared === 'right') {
      side = c.declared
      // 宣告的那一側要真的在那一半：寫了 right 卻畫在左邊，照宣告讓會讓錯邊。
      const center = (box.left + box.right) / 2
      if (side === 'left' ? center > laneCenter : center < laneCenter) continue
      if (intrusionOf(side, box, lane) > laneWidth * DECLARED_MAX_INTRUSION_RATIO) continue
    } else {
      side = guessSide(box, lane)
      if (!side) continue
    }
    const intrusion = intrusionOf(side, box, lane)
    if (!(intrusion > 0)) continue
    out[side] = Math.max(out[side], Math.round(intrusion + GAP))
  }

  const remaining = laneWidth - out.left - out.right
  if (remaining < Math.max(MIN_COLUMN_PX, laneWidth * MIN_COLUMN_RATIO)) return { left: 0, right: 0 }
  return out
}

/** 一組框的聯集；零面積與整個在畫面外的不算。全部不算 → null。 */
export function paintedBox(rects: Box[], viewport: { width: number; height: number }): Box | null {
  let box: Box | null = null
  for (const r of rects) {
    if (!(r.right - r.left >= 1) || !(r.bottom - r.top >= 1)) continue
    if (r.right <= 0 || r.bottom <= 0 || r.left >= viewport.width || r.top >= viewport.height) continue
    if (!box) box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    else {
      box.left = Math.min(box.left, r.left)
      box.top = Math.min(box.top, r.top)
      box.right = Math.max(box.right, r.right)
      box.bottom = Math.max(box.bottom, r.bottom)
    }
  }
  return box
}

/** 單一候選量子樹時最多看幾個節點——側欄就是幾顆按鈕，量爆了代表這不是側欄。 */
const MAX_NODES_PER_CANDIDATE = 400
/** 一次最多收幾個候選 */
const MAX_CANDIDATES = 64

function hiddenBy(style: CSSStyleDeclaration): 'subtree' | 'self' | null {
  if (style.display === 'none' || style.opacity === '0') return 'subtree'
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return 'self' // 子節點可以寫回 visible
  return null
}

/** 候選節點畫出來的所有框：自己與看得到的子孫。 */
function subtreeRects(el: Element, win: Window): Box[] {
  const rects: Box[] = []
  const stack: Element[] = [el]
  let seen = 0
  while (stack.length && seen < MAX_NODES_PER_CANDIDATE) {
    const node = stack.pop() as Element
    seen++
    let style: CSSStyleDeclaration
    try { style = win.getComputedStyle(node) } catch { continue }
    const hidden = hiddenBy(style)
    if (hidden === 'subtree') continue
    if (!hidden) {
      const r = node.getBoundingClientRect()
      rects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
    }
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i])
  }
  return rects
}

/**
 * 從 roots 往下找 fixed 的節點（root 自己是 fixed 就收它自己）；找到了不再往它底下找——
 * 側欄底下的按鈕屬於同一條側欄。display:none 的整棵跳過。
 */
export function collectFixedRoots(roots: Array<Element | null | undefined>, win: Window): Element[] {
  const out: Element[] = []
  const stack: Element[] = []
  for (let i = roots.length - 1; i >= 0; i--) { const r = roots[i]; if (r) stack.push(r) }
  let seen = 0
  while (stack.length && out.length < MAX_CANDIDATES && seen < 5000) {
    const node = stack.pop() as Element
    seen++
    let style: CSSStyleDeclaration
    try { style = win.getComputedStyle(node) } catch { continue }
    if (style.display === 'none') continue
    if (style.position === 'fixed') { out.push(node); continue }
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i])
  }
  return out
}

function declarationOf(el: Element, win: Window): DockDeclaration {
  let v = ''
  try { v = win.getComputedStyle(el).getPropertyValue('--lt-dock').trim().toLowerCase() } catch { /* 量不到當沒宣告 */ }
  return v === 'left' || v === 'right' || v === 'none' ? v : ''
}

export const SIDE_DOCK_LEFT_VAR = '--lt-canvas-dock-left'
export const SIDE_DOCK_RIGHT_VAR = '--lt-canvas-dock-right'

export type BindSideDockOptions = {
  doc: Document
  win: Window
  /** 對話欄（#chat）：取它的左右外框 */
  lane: HTMLElement | null
  /** 捲動區：取它看得到的上下範圍 */
  scroll: HTMLElement | null
  /** 每次量的時候重新收候選（作者的節點會增減） */
  candidates: () => Element[]
  /** 盯這些節點的子樹變化（新增節點、style／class 改變）來重量 */
  observe: Array<Node | null | undefined>
  /** 只盯直接子節點的增減（例如 body：作者腳本往上掛側欄，但訊息串流的改動不必每次都重量） */
  observeShallow?: Array<Node | null | undefined>
  /** 變數寫在哪：一般畫布是 documentElement，殼是它自己 iframe 的 documentElement */
  target: HTMLElement
}

/*
  「收候選 → 量 → 寫成 CSS 變數 → 盯著作者節點與視窗尺寸」。一般畫布（canvas.vue）與沙箱殼
  （sandbox/shell.ts）共用：殼在跨源 iframe 裡，畫布那邊看不到殼裡的作者節點。
*/
export function bindAuthorSideDock(opts: BindSideDockOptions): () => void {
  const { win, lane, scroll, candidates, observe, observeShallow = [], target } = opts
  if (!lane || !scroll) return () => {}
  let raf = 0
  let last = { left: -1, right: -1 }
  const write = (name: string, px: number) => {
    if (px > 0) target.style.setProperty(name, px + 'px')
    else target.style.removeProperty(name)
  }
  const measure = () => {
    const l = lane.getBoundingClientRect()
    const s = scroll.getBoundingClientRect()
    const viewport = { width: win.innerWidth, height: win.innerHeight }
    let list: DockCandidate[] = []
    try {
      list = candidates().map((el) => ({ box: paintedBox(subtreeRects(el, win), viewport), declared: declarationOf(el, win) }))
    } catch { list = [] }
    const out = sideDockClearance({ lane: { left: l.left, right: l.right, top: s.top, bottom: s.bottom }, candidates: list })
    // 差不到 2px 不重寫：側欄動畫、次像素抖動不該讓整條對話欄跟著重排。
    if (Math.abs(out.left - last.left) >= 2 || (out.left === 0) !== (last.left === 0)) write(SIDE_DOCK_LEFT_VAR, out.left)
    if (Math.abs(out.right - last.right) >= 2 || (out.right === 0) !== (last.right === 0)) write(SIDE_DOCK_RIGHT_VAR, out.right)
    last = out
  }
  const schedule = () => {
    if (raf) return
    const next = typeof win.requestAnimationFrame === 'function'
      ? (fn: () => void) => win.requestAnimationFrame(fn)
      : (fn: () => void) => win.setTimeout(fn, 16) as unknown as number
    raf = -1
    const id = next(() => { raf = 0; measure() })
    if (raf === -1) raf = id
  }
  let observer: MutationObserver | null = null
  const MO = (win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null)
  if (MO) {
    observer = new MO(schedule)
    for (const node of observe) {
      if (node) observer.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] })
    }
    for (const node of observeShallow) if (node) observer.observe(node, { childList: true })
  }
  win.addEventListener('resize', schedule)
  schedule()
  return () => {
    if (observer) { try { observer.disconnect() } catch { /* 收尾不得拋錯 */ } observer = null }
    win.removeEventListener('resize', schedule)
    try { target.style.removeProperty(SIDE_DOCK_LEFT_VAR); target.style.removeProperty(SIDE_DOCK_RIGHT_VAR) } catch { /* 同上 */ }
  }
}
