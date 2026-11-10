/**
 * 每條顯示規則自己的 CSS 寫法（cssDialect）。
 *
 * 美化能力不按卡片格式開關（owner 2026-11-10）：一張風月匯入的卡之後可以再加 MMD 寫法的規則，
 * 一張 MMD 卡也可以貼一段風月寫法的 CSS。所以「這段 <style> 照哪一邊的規矩解讀」跟著規則走：
 *   - fengyue：風月寫法，轉到我們的節點、放進 @layer lt-author-fengyue（見 fengyue-css）；
 *   - tavern：酒館寫法，每條選擇器接上訊息層前綴（同卡片格式 tavern）；
 *   - mmd：MMD／本站寫法，原樣生效；
 *   - 沒填：照卡片格式（author-style-policy），跟以前一樣。
 * 風月匯入器在這個欄位出現前產生的內置 CSS 規則（固定 id）沒有標記，當成風月寫法。
 *
 * 做法：規則進畫布時先把它 replace 裡的 <style> 照寫法轉好，標上 data-lt-css；
 * 之後卡片格式那一層（沙箱的 installCard、一般頁的 scopeCardHtml）看到標記就不再處理，
 * 兩個頁面共用同一份結果。
 */
import { CSS_DIALECT_ATTR, MESSAGE_SCOPE, hasCompiledDialect } from './author-style-policy'
import { scopeCss } from './author-style-scope'
import { translateFengyueCss } from './fengyue-css'
import { withFencesProtected } from './markdown-fences'

export type CssDialect = 'fengyue' | 'tavern' | 'mmd'

export { CSS_DIALECT_ATTR, hasCompiledDialect }

/** 風月匯入器產生的內置 CSS 規則 id（hearthroom web 的 FENGYUE_CSS_RULE_ID）。 */
export const LEGACY_FENGYUE_CSS_RULE_ID = 'hearthroom-fengyue-inner-css'

export function normalizeCssDialect(raw: unknown): CssDialect | null {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return value === 'fengyue' || value === 'tavern' || value === 'mmd' ? value : null
}

export function ruleCssDialect(rule: { cssDialect?: unknown; id?: unknown } | null | undefined): CssDialect | null {
  if (!rule) return null
  const own = normalizeCssDialect(rule.cssDialect)
  if (own) return own
  return String(rule.id ?? '') === LEGACY_FENGYUE_CSS_RULE_ID ? 'fengyue' : null
}

export function compileDialectCss(css: string, dialect: CssDialect): string {
  if (dialect === 'fengyue') return translateFengyueCss(css)
  if (dialect === 'tavern') return scopeCss(css, MESSAGE_SCOPE)
  return String(css == null ? '' : css)
}

const STYLE_TAG = /<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi

/** 一段替換內容裡的 <style> 照寫法轉好並標記；程式碼圍欄裡的是字面文字，不碰。 */
export function compileReplaceStyles(replace: string, dialect: CssDialect): string {
  const text = String(replace == null ? '' : replace)
  if (text.indexOf('<style') < 0 && text.indexOf('<STYLE') < 0) return text
  return withFencesProtected(text, (outside) => outside.replace(STYLE_TAG, (whole, attrs: string, css: string) => {
    if (hasCompiledDialect(attrs)) return whole
    return `<style${attrs} ${CSS_DIALECT_ATTR}="${dialect}">${compileDialectCss(css, dialect)}</style>`
  }))
}

/** 規則清單進畫布前呼叫一次：有寫法的規則換成轉好的版本，其餘原樣（同一個物件）。 */
export function compileRuleCssDialects<T extends { replace?: unknown; cssDialect?: unknown; id?: unknown }>(rules: T[]): T[] {
  if (!Array.isArray(rules)) return []
  return rules.map((rule) => {
    const dialect = ruleCssDialect(rule)
    if (!dialect || !rule) return rule
    const replace = String(rule.replace == null ? '' : rule.replace)
    const compiled = compileReplaceStyles(replace, dialect)
    return compiled === replace ? rule : { ...rule, replace: compiled }
  })
}
