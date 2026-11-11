/**
 * 作者樣式政策：卡片格式 → 它的 <style> 該怎麼落地。
 *
 * 這是唯一知道「某種格式意味著什麼」的地方。宿主頁（舊聊天頁）與沙箱殼都只拿政策來套，
 * 自己不判斷格式；之後要支援新的卡片平台，在這張表加一列就好，消費端不用改。
 *
 * ── 表 ──
 * - tavern：原平台會替訊息裡的 <style> 逐字接上訊息層前綴（`.mes_text `），作者寫
 *   `p{}`、`.title{}` 是安全的，寫 `body{}` 則從來沒生效過。這裡照做，卡在兩邊長得一樣。
 *   圍欄裡的整份 HTML 文件掛成各自的 iframe（酒館助手的渲染器慣例）。
 * - mmd：沒有這層改寫，卡片的 <style> 原樣生效——作者就是靠它換掉整頁的背景與輸入框。
 *   加前綴等於把那張卡的美化整套關掉。圍欄裡的整份文件拆開直接畫進氣泡（既有行為，
 *   卡片元件庫與 SDK 都在氣泡那一層，放進 iframe 會斷掉）。畫布鎖定暗色：MMD 只有暗色。
 *
 * 格式不明時當 MMD（見 card-format）：猜錯的代價不對稱，猜成酒館會讓能用的卡變成不能用。
 */
import { type CardFormat, normalizeCardFormat } from './card-format'
import { scopeCss } from './author-style-scope'
import { withFencesProtected } from './markdown-fences'
import { adaptFengyueSelectors } from './fengyue-css'

export interface AuthorStylePolicy {
  /** 每條選擇器前面要接的作用域；null＝原樣生效。 */
  scope: string | null
  /**
   * 程式碼圍欄裡裝著整份 HTML 文件時怎麼畫（common/frontend-block）：
   * - iframe：各自掛成獨立的 iframe——酒館助手的慣例，作者的 body 樣式只影響那個區塊自己的視窗。
   * - inline：拆掉圍欄直接畫進氣泡——MMD／本站 HTML 卡的既有行為，卡片元件庫（hc-*）與 SDK 都在氣泡這一層。
   */
  fencedDocument: 'iframe' | 'inline'
  /**
   * 畫布的深淺：
   * - dark：鎖定暗色——MMD 的聊天頁只有暗色，作者畫深色背景時理所當然把正文留給平台的白字；
   *   跟著宿主切成亮色，正文就變黑字壓在他的深色底上（2026-09-15 社群回報：有人白字有人黑字）。
   * - host：跟著宿主的深淺走——酒館的卡不假設主題，宿主是什麼紙就用什麼紙。
   */
  theme: 'dark' | 'host'
}

/** 訊息層前綴。酒館用 `.mes_text `，我們兩個聊天頁的氣泡都掛著這個 class。 */
export const MESSAGE_SCOPE = '.mes_text'

/**
 * 規則自己標了 CSS 寫法（rule-css-dialect）時，它的 <style> 在進畫布前就照那個寫法轉好並帶上這個屬性；
 * 卡片格式這一層看到它就不再處理。
 */
export const CSS_DIALECT_ATTR = 'data-lt-css'
const DIALECT_ATTR_RE = /(?:^|\s)data-lt-css(?=[\s=>]|$)/i

export function hasCompiledDialect(attrs: string): boolean {
  return DIALECT_ATTR_RE.test(String(attrs || ''))
}

const POLICIES: Record<CardFormat, AuthorStylePolicy> = {
  tavern: { scope: MESSAGE_SCOPE, fencedDocument: 'iframe', theme: 'host' },
  mmd: { scope: null, fencedDocument: 'inline', theme: 'dark' },
  // 風月的聊天頁是淺色，內置 CSS 整頁生效：不加前綴，也不像 MMD 那樣鎖深色。
  fengyue: { scope: null, fencedDocument: 'inline', theme: 'host' },
}

/** 接受原始字串（伺服器欄位）或已正規化的格式；不認得的當 MMD。 */
export function stylePolicyFor(format: CardFormat | string | null | undefined): AuthorStylePolicy {
  return POLICIES[normalizeCardFormat(format)]
}

/** 一段 CSS 依政策落地。 */
export function applyStylePolicy(css: string, policy: AuthorStylePolicy): string {
  const text = String(css == null ? '' : css)
  return adaptFengyueSelectors(text, (native) => applyNativeStylePolicy(native, policy))
}

/** 既有作用域政策，不作新增的選擇器自動對應。 */
export function applyNativeStylePolicy(css: string, policy: AuthorStylePolicy): string {
  return policy.scope ? scopeCss(css, policy.scope) : css
}

// script／textarea 是 HTML raw text；裡面的標籤字串與註解都不是可套用的樣式。
const STYLE_TAG = /<!--[\s\S]*?(?:-->|$)|<(script|textarea)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)|<style\b([^>]*)>([\s\S]*?)<\/style>/gi
const NATIVE_STYLE_TAG = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi

/** 真 style 會整塊越過，避免把 CSS 值裡的 script 字串誤認為 HTML raw text。 */
export function rawTextHtmlRanges(html: string): Array<{ start: number; end: number }> {
  return [...html.matchAll(STYLE_TAG)].filter(match => match[3] === undefined).map(match => ({ start: match.index!, end: match.index! + match[0].length }))
}

/** 一段訊息 HTML 裡的每個 <style> 依政策落地；不需改寫的政策連掃描都不做。 */
export function applyStylePolicyToHtml(html: string, policy: AuthorStylePolicy): string {
  const text = String(html == null ? '' : html)
  if (!/<style\b/i.test(text)) return text
  const nativeRawScan = !!policy.scope && text.indexOf('<style') >= 0
  // 程式碼圍欄裡的 <style> 是字面文字（前端區塊協議會把整份文件放進自己的 iframe），不加前綴。
  return withFencesProtected(text, (outside) => outside.replace(STYLE_TAG, (whole, _rawTag: string | undefined, attrs: string | undefined, css: string | undefined) => {
    if (css === undefined || attrs === undefined) {
      // 只禁新增 auto；酒館既有的字面前綴處理保留，避免修成另一個舊行為。
      return nativeRawScan ? whole.replace(NATIVE_STYLE_TAG, (tag, rawAttrs: string, rawCss: string) => hasCompiledDialect(rawAttrs) ? tag : `<style${rawAttrs}>${applyNativeStylePolicy(rawCss, policy)}</style>`) : whole
    }
    if (hasCompiledDialect(attrs)) return whole
    const compiled = applyStylePolicy(css, policy)
    const native = policy.scope ? scopeCss(css, policy.scope) : css
    // 舊酒館只在有小寫 <style 時掃描；沒有新增映射時維持那個早退與原tag位元組。
    if (compiled === native && !nativeRawScan) return whole
    const marker = compiled === native ? '' : ` ${CSS_DIALECT_ATTR}="auto"`
    return `<style${attrs}${marker}>${compiled}</style>`
  }))
}
