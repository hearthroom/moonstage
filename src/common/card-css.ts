/** 作者資產中的整卡樣式：原文保留，畫面只掛一份，不進訊息或模型。 */
import { compileDialectCss, LEGACY_FENGYUE_CSS_RULE_ID, normalizeCssDialect } from './rule-css-dialect'
import { adaptFengyueSelectors, splitCssImports } from './fengyue-css'
import { nativeCardRootVariables, splitCardAppearanceCss } from './card-appearance'
import { compileFengyueV2Css } from './fengyue-v2'

export const CARD_CSS_LAYER = 'lt-card-css'

interface CssRule { id?: unknown; find?: unknown; replace?: unknown; enabled?: unknown; cssDialect?: unknown }
export interface CardCssAsset { cardCss?: unknown; cardCssDialect?: unknown; rules?: CssRule[] }

/**
 * 只搬匯入器原封產生的單一啟用假規則；作者改過或停用的內容留在原處。
 * 有其他啟用樣式或腳本時不猜層級：保留原位置，避免搬到 head 前方改變同層先後。
 */
export function resolveCardCssAsset<T extends CardCssAsset>(asset: T): T & { cardCss?: string; cardCssDialect?: string; rules: NonNullable<T['rules']> } {
  const rules = Array.isArray(asset.rules) ? asset.rules : []
  const candidates = rules.filter((rule) => String(rule?.id ?? '') === LEGACY_FENGYUE_CSS_RULE_ID)
  const legacy = candidates.length === 1 ? candidates[0] : null
  const replace = String(legacy?.replace ?? '')
  const match = /^\$1<style>([\s\S]*)<\/style>$/.exec(replace)
  const unchanged = legacy?.enabled !== false && legacy?.find === '/([\\s\\S])$/' && match && !/<\/?style\b/i.test(match[1])
  const explicit = Object.prototype.hasOwnProperty.call(asset, 'cardCss')
  const hasCssOrderPeers = rules.some(rule => rule !== legacy && rule?.enabled !== false && /<(?:style|script)\b/i.test(String(rule?.replace ?? '')))
  // 明確的空欄位是作者清除意圖，仍抑制未修改 carrier；這不是自動搬遷。
  const migrates = unchanged && (explicit || !hasCssOrderPeers)
  return {
    ...asset,
    ...(explicit ? { cardCss: String(asset.cardCss ?? ''), cardCssDialect: asset.cardCssDialect === 'fengyue-v2' ? 'fengyue-v2' : normalizeCssDialect(asset.cardCssDialect) ?? '' }
      : migrates ? { cardCss: match[1], cardCssDialect: normalizeCssDialect(legacy?.cssDialect) ?? 'fengyue' } : {}),
    rules: (migrates ? rules.filter((rule) => rule !== legacy) : rules) as NonNullable<T['rules']>,
  }
}

/** 去掉宣告上的 important，保留引號與註解裡的原文字。 */
function withoutImportant(css: string): string {
  return css.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\*[\s\S]*?(?:\*\/|$)|!\s*important\b/gi, (part) => part[0] === '!' ? '' : part)
}

/** @import 的 URL 後面接 layer，外部樣式也遵守卡片樣式的優先序。 */
function layeredImport(entry: string): string {
  const start = /^@import\s+/i.exec(entry)?.[0].length ?? 0
  let cursor = start
  let quote = ''
  let parentheses = 0
  for (; cursor < entry.length; cursor++) {
    const ch = entry[cursor]
    if (ch === '\\') { cursor++; continue }
    if (quote) { if (ch === quote) { quote = ''; if (!parentheses) { cursor++; break } } continue }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '(') { parentheses++; continue }
    if (ch === ')' && --parentheses === 0) { cursor++; break }
    if (!parentheses && /\s/.test(ch)) break
  }
  const uri = entry.slice(0, cursor)
  const rest = entry.slice(cursor).trim()
  const layer = /^layer(?:\(\s*([^)]*)\s*\))?(?=\s|$)/i.exec(rest)
  const qualifier = layer ? rest.slice(layer[0].length).trim() : rest
  const name = layer?.[1]?.trim()
  return `${uri} layer(${CARD_CSS_LAYER}${name ? '.' + name : ''})${qualifier ? ' ' + qualifier : ''};`
}

export function compileCardCss(asset: CardCssAsset): string {
  const source = String(asset.cardCss ?? '')
  if (!source.trim()) return ''
  const { css, appearance } = splitCardAppearanceCss(source)
  if (asset.cardCssDialect === 'fengyue-v2') {
    const current = compileFengyueV2Css(css)
    return appearance ? `${current}\n@layer ${CARD_CSS_LAYER} {\n${withoutImportant(appearance)}\n}` : current
  }
  const dialect = normalizeCssDialect(asset.cardCssDialect)
  // 舊資料提示優先：既有風月／酒館／MMD 轉譯與權重不得因搬欄位改變。
  if (dialect) {
    const legacy = compileDialectCss(css, dialect)
    return appearance ? `@layer lt-base, ${CARD_CSS_LAYER}, lt-author-fengyue;\n${legacy}\n@layer ${CARD_CSS_LAYER} {\n${withoutImportant(appearance)}\n}` : legacy
  }
  const adapted = adaptFengyueSelectors(withoutImportant(css), native => native)
  // 卡片樣式在平台之上、顯示規則之下；來源原文不動。import 必須留在 layer 外。
  const { imports, body } = splitCssImports(adapted)
  return `@layer lt-base, ${CARD_CSS_LAYER}, lt-author-fengyue;\n${imports.map(layeredImport).join('\n')}${imports.length ? '\n' : ''}@layer ${CARD_CSS_LAYER} {\n${body}\n${withoutImportant(appearance)}\n}`
}

/** 一般頁與殼都擁有自己的實例；換卡、清空與離場不留下樣式。 */
export function createCardCssMount(doc: Document) {
  let node: HTMLStyleElement | null = null
  const before = new Map<HTMLElement, Map<string, [string, string]>>()
  const mark = (css: string, native = false) => {
    const variables = [...new Set([...splitCardAppearanceCss(css).variables, ...(native ? nativeCardRootVariables(css) : [])])]
    const names = variables.join(' ')
    const roots = new Set([...doc.querySelectorAll<HTMLElement>('.canvas-root'), ...before.keys()])
    for (const root of roots) {
      const saved = before.get(root) ?? new Map<string, [string, string]>()
      for (const [name, [value, priority]] of saved) {
        if (variables.includes(name)) continue
        if (value) root.style.setProperty(name, value, priority); else root.style.removeProperty(name)
        saved.delete(name)
      }
      for (const name of variables) {
        if (!saved.has(name)) saved.set(name, [root.style.getPropertyValue(name), root.style.getPropertyPriority(name)])
        root.style.removeProperty(name)
      }
      if (saved.size) before.set(root, saved); else before.delete(root)
      if (names) { if (root.getAttribute('data-lt-card-vars') !== names) root.setAttribute('data-lt-card-vars', names) }
      else root.removeAttribute('data-lt-card-vars')
    }
  }
  return {
    set(css: string, options: { nativeRootVariables?: boolean } = {}) {
      mark(css, options.nativeRootVariables)
      if (!css) { node?.remove(); node = null; return }
      if (!node) { node = doc.createElement('style'); node.setAttribute('data-lt', 'card-css'); doc.head.insertBefore(node, doc.head.querySelector('style[data-chat="author-css"]')) }
      node.textContent = css
    },
    dispose() { mark(''); node?.remove(); node = null },
  }
}
