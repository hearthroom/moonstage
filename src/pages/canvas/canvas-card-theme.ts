/**
 * 從作者的卡抽出「塊」的外觀，讓我方的獨立區塊（準備軌跡、思考過程、中斷卡、狀態列、
 * 等待指示器、模型選單的選中態）跟著卡片走。
 *
 * 作者的卡只對 MMD／舊頁面的節點寫規則，不會改我們的 --lt-canvas-* 變數；先前這些區塊
 * 用自己的預設（金色強調、深色底），在亮色或紅色主題的卡上就是一塊突兀的東西
 * （owner 2026-09-05：「都應該要被使用者自訂的美化主題自動覆寫掉」）。
 *
 * 做法：量卡片已經漆好的兩個節點——AI 氣泡（.mes_text：邊框、底色、圓角）與快捷鍵
 * （.shortcut-btn：邊框色＝卡片的主色）——把量到的值寫回我們的變數。這裡是純函式，
 * 量測與寫回在 canvas.vue。
 */

export interface CardThemeSample {
  bubbleBorderColor?: string
  bubbleBorderWidth?: string
  bubbleBorderStyle?: string
  bubbleBackground?: string
  bubbleRadius?: string
  /** 氣泡的字色：塊拿了氣泡的底，字也要跟著拿，不然淺底配上站台的淺字 */
  bubbleColor?: string
  accentColor?: string
  /** 快捷鍵（.shortcut-btn）：卡片已經漆好的一顆藥丸，動作列那兩顆照它長 */
  pillBorderColor?: string
  pillBorderWidth?: string
  pillBorderStyle?: string
  pillBackground?: string
  pillColor?: string
  pillRadius?: string
}

export interface CardThemeVars {
  '--lt-canvas-block-border'?: string
  '--lt-canvas-block-bg'?: string
  '--lt-canvas-block-fg'?: string
  '--lt-canvas-block-radius'?: string
  '--lt-canvas-accent'?: string
  '--lt-canvas-accent-fg'?: string
  '--lt-canvas-accent-bg'?: string
  '--lt-canvas-pill-border'?: string
  '--lt-canvas-pill-bg'?: string
  '--lt-canvas-pill-fg'?: string
  '--lt-canvas-pill-radius'?: string
}

interface RGBA { r: number; g: number; b: number; a: number }

export function parseCssColor(value: string | undefined | null): RGBA | null {
  const v = String(value || '').trim()
  let m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] }
  m = v.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i)
  if (m) {
    const a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4])
    return { r: +m[1], g: +m[2], b: +m[3], a }
  }
  m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (m) {
    const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }
  }
  return null
}

function luminance(c: RGBA): number {
  const f = (x: number) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

function saturation(c: RGBA): number {
  const max = Math.max(c.r, c.g, c.b) / 255
  const min = Math.min(c.r, c.g, c.b) / 255
  if (max === 0) return 0
  return (max - min) / max
}

function rgba(c: RGBA): string {
  return c.a >= 1 ? `rgb(${c.r}, ${c.g}, ${c.b})` : `rgba(${c.r}, ${c.g}, ${c.b}, ${+c.a.toFixed(3)})`
}

/**
 * 量到什麼就給什麼；量不到（沒有邊框、透明底、灰色主色）就不給——不給等於用我們的預設。
 * 主色要「像個主色」：太透明或幾乎沒有彩度（灰／黑／白）的邊框不當主色，那多半只是分隔線。
 */
export function computeCardThemeVars(sample: CardThemeSample): CardThemeVars {
  const out: CardThemeVars = {}
  const border = parseCssColor(sample.bubbleBorderColor)
  const width = parseFloat(String(sample.bubbleBorderWidth || '0')) || 0
  const style = String(sample.bubbleBorderStyle || 'none')
  if (border && border.a > 0.2 && width > 0 && style !== 'none' && style !== 'hidden') {
    out['--lt-canvas-block-border'] = `${Math.min(width, 3)}px ${style} ${rgba(border)}`
  }
  const bg = parseCssColor(sample.bubbleBackground)
  if (bg && bg.a > 0.05) out['--lt-canvas-block-bg'] = rgba(bg)
  // 氣泡量到了、底卻是透明的（作者要文字直接壓在背景上，或用漸層／圖片當底，量到的底色是透明）：
  // 塊也用淡框，不能退到我們預設的深色氣泡底——那會在透明的兩顆氣泡中間夾一塊深色（owner 2026-09-05 的「黑膏藥」）。
  else if (bg) out['--lt-canvas-block-bg'] = 'color-mix(in srgb, currentColor 7%, transparent)'
  // 底跟著氣泡走時字也一起：作者把氣泡漆成白底深字，塊若只拿到白底、字仍是站台深色模式的淺字，
  // 整段就讀不到（2026-11-06 量到：白底上 rgb(242,242,245) 的字）。
  const fg = parseCssColor(sample.bubbleColor)
  if (out['--lt-canvas-block-bg'] && fg && fg.a > 0.5) out['--lt-canvas-block-fg'] = rgba({ ...fg, a: 1 })
  const radius = parseFloat(String(sample.bubbleRadius || '')) || 0
  if (radius > 0) out['--lt-canvas-block-radius'] = `${Math.min(radius, 24)}px`

  const pillBorder = parseCssColor(sample.pillBorderColor)
  const pillWidth = parseFloat(String(sample.pillBorderWidth || '0')) || 0
  const pillStyle = String(sample.pillBorderStyle || 'none')
  if (pillBorder && pillBorder.a > 0.2 && pillWidth > 0 && pillStyle !== 'none' && pillStyle !== 'hidden') {
    out['--lt-canvas-pill-border'] = `${Math.min(pillWidth, 3)}px ${pillStyle} ${rgba(pillBorder)}`
  }
  const pillBg = parseCssColor(sample.pillBackground)
  if (pillBg && pillBg.a > 0.05) out['--lt-canvas-pill-bg'] = rgba(pillBg)
  const pillFg = parseCssColor(sample.pillColor)
  if (pillFg && pillFg.a > 0.5 && (out['--lt-canvas-pill-bg'] || out['--lt-canvas-pill-border'])) {
    out['--lt-canvas-pill-fg'] = rgba({ ...pillFg, a: 1 })
  }
  const pillRadius = parseFloat(String(sample.pillRadius || '')) || 0
  if (pillRadius > 0 && (out['--lt-canvas-pill-bg'] || out['--lt-canvas-pill-border'])) {
    out['--lt-canvas-pill-radius'] = `${Math.min(pillRadius, 9999)}px`
  }

  // 主色：氣泡邊框與快捷鍵邊框都是候選，挑「比較鮮明」的那個——BA 卡夜間快捷鍵是暗紅
  // rgb(100,36,50)、氣泡是亮紅 rgb(216,75,97)，玩家眼裡的主色是後者（2026-09-05 實測）。
  const accent = pickAccent([parseCssColor(sample.accentColor), border && width > 0 ? border : null])
  if (accent && accent.a > 0.5 && saturation(accent) > 0.15) {
    out['--lt-canvas-accent'] = rgba({ ...accent, a: 1 })
    out['--lt-canvas-accent-fg'] = luminance(accent) > 0.55 ? '#0F1419' : '#FFFFFF'
    out['--lt-canvas-accent-bg'] = `color-mix(in srgb, ${rgba({ ...accent, a: 1 })} 16%, transparent)`
  }
  return out
}

// 鮮明度：彩度高、亮度不極端的顏色分數高。分數相同時前者優先。
function vividness(c: RGBA): number {
  return saturation(c) * (1 - Math.abs(luminance(c) - 0.45))
}

function pickAccent(candidates: Array<RGBA | null>): RGBA | null {
  let best: RGBA | null = null
  let bestScore = -1
  for (const c of candidates) {
    if (!c || c.a <= 0.5) continue
    const s = vividness(c)
    if (s > bestScore) { best = c; bestScore = s }
  }
  return best
}

export const CARD_BLOCK_VAR_NAMES: Array<keyof CardThemeVars> = [
  '--lt-canvas-block-border', '--lt-canvas-block-bg', '--lt-canvas-block-fg', '--lt-canvas-block-radius',
]

export const CARD_THEME_VAR_NAMES: Array<keyof CardThemeVars> = [
  ...CARD_BLOCK_VAR_NAMES,
  '--lt-canvas-accent', '--lt-canvas-accent-fg', '--lt-canvas-accent-bg',
  '--lt-canvas-pill-border', '--lt-canvas-pill-bg', '--lt-canvas-pill-fg', '--lt-canvas-pill-radius',
]

/** 量卡片已經漆好的 AI 氣泡與快捷鍵。一般畫布與沙箱殼共用同一組選擇器。 */
export function readCardThemeSample(doc: Document): CardThemeSample {
  const view = doc.defaultView
  if (!view) return {}
  const bubble = doc.querySelector('.mes[data-lt-role="ai"]:not([is_system="true"]) .mes_text') as HTMLElement | null
  const pill = doc.querySelector('.shortcut-btn') as HTMLElement | null
  const b = bubble ? view.getComputedStyle(bubble) : null
  const p = pill ? view.getComputedStyle(pill) : null
  return {
    bubbleBorderColor: b?.borderTopColor, bubbleBorderWidth: b?.borderTopWidth, bubbleBorderStyle: b?.borderTopStyle,
    bubbleBackground: b?.backgroundColor, bubbleRadius: b?.borderTopLeftRadius, bubbleColor: b?.color,
    accentColor: p?.borderTopColor,
    pillBorderColor: p?.borderTopColor, pillBorderWidth: p?.borderTopWidth, pillBorderStyle: p?.borderTopStyle,
    pillBackground: p?.backgroundColor, pillColor: p?.color, pillRadius: p?.borderTopLeftRadius,
  }
}

/** 把量到的值寫在根節點上；這次沒量到的就拿掉，退回 CSS 的預設。只動 names 列的那幾個。 */
export function writeCardThemeVars(root: HTMLElement, vars: CardThemeVars, names: Array<keyof CardThemeVars> = CARD_THEME_VAR_NAMES): void {
  for (const name of names) {
    const value = vars[name]
    if (value) {
      if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value)
    } else if (root.style.getPropertyValue(name)) {
      root.style.removeProperty(name)
    }
  }
}
