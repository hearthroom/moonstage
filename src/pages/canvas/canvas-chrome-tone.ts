/**
 * 舞台自己的殼（頂欄、彈層）底色是亮是暗，字就跟著換。
 *
 * 作者的卡會把這些殼漆成自己的顏色（例如日間主題 `.topTabbar { background: var(--lb) !important }`），
 * 但作者只對 MMD 的節點名寫過字色——我們的返回鍵、模型 chip、欄位標題不在他的清單裡。
 * 站台在深色主題時字是白的，殼一被漆成米白就白字白底，整排看不見（owner 2026-09-12 截圖）。
 * MMD 的頂欄 icon 日夜都看得見，我們也得。
 *
 * 做法：量每個殼「實際看到的底色」（自己的底色疊在祖先的底色上，半透明照 alpha 混），
 * 亮就標 data-lt-tone="light"、暗就標 "dark"，CSS 照標記給字色（canvas.css，layer 外、
 * :where() 歸零特異性，作者指名 color 的規則永遠贏）。作者切日夜、卡片載入、彈層打開
 * 都會重量一次（canvas.vue 的 syncCardTheme 與 canvas-popup.vue）。
 */
import { parseCssColor } from './canvas-card-theme'

export type ChromeTone = 'light' | 'dark'

export interface RGBA { r: number; g: number; b: number; a: number }

/** 與 canvas.css 的實心主行動相同；各自量底色，不能沿用整片彈層的深淺。 */
const POPUP_PRIMARY_ACTIONS = '.u-popup__content .confirm-bottom .ok-btn, .u-popup__content .bottom .btn, .u-popup__content .role-setting .complete-btn, .u-popup__content .np-save-btn, .u-popup__content .custom-instruction-scope .add-btn'

/** 有這些節點就量：頂欄、彈層、需要獨立對比的主行動。 */
export const CHROME_TONE_SELECTORS = ['.topTabbar', '.u-popup__content', '.sys-msg-card', '.agent-resume-card', '.sys-link', '.sys-cta-primary', '.agent-resume-card__btn', '.chat-balance-hint', POPUP_PRIMARY_ACTIONS] as const

/** 頁面預設底：量不到任何底色時當作深色（舞台的預設主題）。 */
const DEFAULT_PAGE_BG: RGBA = { r: 15, g: 18, b: 23, a: 1 }

/**
 * 解析 getComputedStyle 回來的顏色。除了 rgb／rgba／#hex，Chrome 對 color-mix() 的結果
 * 會回 `color(srgb 0.95 0.95 0.96 / 0.07)`（0–1 的分量），也要認得。
 */
export function parseComputedColor(value: string | undefined | null): RGBA | null {
  const v = String(value || '').trim()
  const m = v.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i)
  if (m) {
    const a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4])
    return { r: Math.round(+m[1] * 255), g: Math.round(+m[2] * 255), b: Math.round(+m[3] * 255), a }
  }
  if (/^transparent$/i.test(v)) return { r: 0, g: 0, b: 0, a: 0 }
  return parseCssColor(v)
}

/** top 疊在 bottom 上（一般 alpha 混色）。 */
export function blendOver(top: RGBA, bottom: RGBA): RGBA {
  const a = top.a + bottom.a * (1 - top.a)
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 }
  const mix = (t: number, b: number) => Math.round((t * top.a + b * bottom.a * (1 - top.a)) / a)
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a }
}

export function relativeLuminance(c: RGBA): number {
  const f = (x: number) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

/** 亮度過半就是亮底，字用深色；否則字用淺色。 */
export function toneForBackground(c: RGBA): ChromeTone {
  return relativeLuminance(c) > 0.5 ? 'light' : 'dark'
}

/** 漸層背景的第一個色標：作者的頂欄常是 linear-gradient，background-color 是透明的，顏色在這裡。 */
const GRADIENT_COLOR = /(rgba?\([^)]*\)|color\(srgb[^)]*\)|#[0-9a-f]{3,8}\b|transparent)/i
export function firstGradientColor(backgroundImage: string | null | undefined): RGBA | null {
  const v = String(backgroundImage || '')
  if (!/gradient\(/i.test(v)) return null
  const m = v.match(GRADIENT_COLOR)
  return m ? parseComputedColor(m[1]) : null
}

/** Split background-image layers without splitting commas inside color functions. */
function backgroundLayers(value: string): string[] {
  const layers: string[] = []
  let depth = 0, start = 0
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '(') depth += 1
    else if (value[i] === ')') depth -= 1
    else if (value[i] === ',' && depth === 0) { layers.push(value.slice(start, i)); start = i + 1 }
  }
  layers.push(value.slice(start))
  return layers
}

/** Each gradient paints above the base color; the first image is the topmost. */
function layerBackground(view: Window, el: Element, pseudo?: string): RGBA | null {
  const cs = view.getComputedStyle(el, pseudo)
  if (pseudo && (!cs.content || cs.content === 'none' || cs.content === 'normal')) return null
  const bg = parseComputedColor(cs.backgroundColor)
  let acc: RGBA | null = bg && bg.a > 0 ? bg : null
  const layers = backgroundLayers(cs.backgroundImage || '')
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const color = firstGradientColor(layers[i])
    if (color && color.a > 0) acc = acc ? blendOver(color, acc) : color
  }
  return acc
}

/**
 * 這個節點實際看到的底色：從最外層往內，每一層的底色照 alpha 疊上去（含漸層的第一個色標）；
 * 節點自己的 ::before／::after 有底的話也疊上去（作者常拿偽元素當頂欄的底）。全透明就是頁面預設底。
 */
export function effectiveBackground(el: Element, fallback: RGBA = DEFAULT_PAGE_BG): RGBA {
  const chain: Element[] = []
  for (let node: Element | null = el; node; node = node.parentElement) chain.push(node)
  let acc: RGBA = { ...fallback }
  const view = el.ownerDocument?.defaultView
  if (!view) return acc
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const layer = layerBackground(view, chain[i])
    if (layer) acc = blendOver(layer, acc)
  }
  for (const pseudo of ['::before', '::after']) {
    const layer = layerBackground(view, el, pseudo)
    if (layer) acc = blendOver(layer, acc)
  }
  // 平台彈層的實底位於背景與內容之間，作者將殼設透明時仍以這層判斷字色。
  const surface = el.querySelector(':scope > .lt-dialog-backplate')
  if (surface) {
    const layer = layerBackground(view, surface)
    if (layer) acc = blendOver(layer, acc)
  }
  return acc
}

/**
 * 頂欄實際看到的底色，給宿主塗到系統狀態列（theme-color）——狀態列跟頁首同色，
 * 手機上看起來就是一整片，而不是頂著一條站台底色。沒有頂欄（還沒掛）就 null。
 */
export function chromeTopColor(scope: ParentNode | null | undefined = typeof document === 'undefined' ? null : document, fallbackEl?: Element | null): string | null {
  const el = (scope && scope.querySelector('.topTabbar')) || fallbackEl || null
  if (!el) return null
  const c = effectiveBackground(el)
  return `rgb(${c.r}, ${c.g}, ${c.b})`
}


/** 保留作者配色，將半透明底疊在平台表面上；面板後方不能透出對話正文。 */
export function solidPopupBackground(panel: HTMLElement): string {
  const view = panel.ownerDocument.defaultView
  if (!view) return 'rgb(24, 27, 33)'
  const cs = view.getComputedStyle(panel)
  const mode = panel.closest('[data-mode], [data-theme="light"], [data-theme="dark"], .lt-theme-dark')
  const light = !mode?.classList.contains('lt-theme-dark') && (mode?.getAttribute('data-mode') === 'light' || mode?.getAttribute('data-theme') === 'light')
  const fallback: RGBA = light ? { r: 255, g: 255, b: 255, a: 1 } : { r: 24, g: 27, b: 33, a: 1 }
  const sheet = parseComputedColor(cs.getPropertyValue('--lt-canvas-sheet-bg'))
    || parseComputedColor(cs.getPropertyValue('--chat-modal-bg'))
  const base = sheet ? blendOver(sheet, fallback) : fallback
  const color = parseComputedColor(cs.backgroundColor)
  const solid = color ? blendOver(color, base) : base
  return `rgb(${solid.r}, ${solid.g}, ${solid.b})`
}

/** 量所有殼，把色調寫在 data-lt-tone 上。沒有那個節點就略過。 */
export function syncChromeTone(scope: ParentNode | null | undefined = typeof document === 'undefined' ? null : document): void {
  if (!scope) return
  for (const selector of CHROME_TONE_SELECTORS) {
    for (const el of scope.querySelectorAll(selector)) {
      const surface = el.querySelector<HTMLElement>(':scope > .lt-dialog-backplate')
      if (surface) {
        const solid = solidPopupBackground(el as HTMLElement)
        if (surface.style.backgroundColor !== solid) surface.style.backgroundColor = solid
      }
      const bg = effectiveBackground(el)
      let tone = toneForBackground(bg)
      // Platform panels need readable text even when only an author panel color changes.
      if (el.matches('.sys-msg-card, .agent-resume-card, .sys-link, .sys-cta-primary, .agent-resume-card__btn, .chat-balance-hint') || el.matches(POPUP_PRIMARY_ACTIONS)) {
        const light = {r:23,g:23,b:28,a:1}, dark = {r:232,g:234,b:237,a:1}
        const contrast = (fg: RGBA) => { const a = relativeLuminance(fg), b = relativeLuminance(bg); return (Math.max(a,b)+.05)/(Math.min(a,b)+.05) }
        const lightRatio = contrast(light), darkRatio = contrast(dark)
        tone = lightRatio >= darkRatio ? 'light' : 'dark'
        const chosen = tone === 'light' ? light : dark
        const high = contrast(blendOver({...chosen, a:.78}, bg)) < 4.5
        if (high) tone = relativeLuminance(bg) >= .179 ? 'light' : 'dark'
        const mode = high ? 'high' : 'normal'
        if (el.getAttribute('data-lt-contrast') !== mode) el.setAttribute('data-lt-contrast', mode)
      }
      if (el.getAttribute('data-lt-tone') !== tone) el.setAttribute('data-lt-tone', tone)
    }
  }
}
