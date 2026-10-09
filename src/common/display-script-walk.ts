/**
 * 顯示字形轉換（簡↔繁）的「走訪」這一半：決定方向、挑出要轉的文字節點。
 * 不含字典——字典很大（約 1 MB），沙箱殼只在玩家的介面語言真的需要轉時才另外載入
 * （sandbox-zh.js），所以這一半必須能單獨 import 而不把字典帶進 sandbox.js。
 * 轉換器本身在 pages/canvas/canvas-display-script.ts（createDisplayScriptConverter）。
 */
export type ScriptDirection = 'none' | 's2t' | 't2s'

/** 只看玩家介面語言：正體→轉繁；簡體→轉簡；其他語言不動。卡片字形不明時的退路。 */
export function directionForLocale(locale: string | null | undefined): ScriptDirection {
  const l = String(locale || '').toLowerCase()
  if (l === 'zh-hant' || l.startsWith('zh-tw') || l.startsWith('zh-hk')) return 's2t'
  if (l === 'zh-hans' || l === 'zh-cn' || l === 'zh') return 't2s'
  return 'none'
}

/** 卡片語言標明的字形；只寫 zh、空的、其他語言都是 null（看不出來）。 */
function cardScript(language: string | null | undefined): 'hant' | 'hans' | null {
  const l = String(language || '').toLowerCase().replace(/_/g, '-')
  if (l === 'zh-hant' || l.startsWith('zh-hant-') || l.startsWith('zh-tw') || l.startsWith('zh-hk') || l.startsWith('zh-mo')) return 'hant'
  if (l === 'zh-hans' || l.startsWith('zh-hans-') || l.startsWith('zh-cn') || l.startsWith('zh-sg')) return 'hans'
  return null
}

/**
 * 卡片字形 → 玩家字形。卡片和玩家同一種字形就不轉：已經是玩家的字，再轉只會改壞
 * （簡轉繁一對多，制→製、面→麵）。卡片字形看不出來才退回只看玩家介面語言、逐段判斷。
 */
export function directionFor(cardLanguage: string | null | undefined, locale: string | null | undefined): ScriptDirection {
  const player = directionForLocale(locale)
  const card = cardScript(cardLanguage)
  if (player === 'none' || !card) return player
  if (card === 'hant') return player === 's2t' ? 'none' : 't2s'
  return player === 't2s' ? 'none' : 's2t'
}

export const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'TEMPLATE', 'KBD', 'SAMP'])
export const HAS_CJK = /[㐀-䶿一-鿿豈-﫿]/

/** 作者標了 translate="no"、class="notranslate" 或 data-lt-verbatim 的子樹不轉：作者的腳本會回頭讀那段字。 */
export function isVerbatimElement(el: Element): boolean {
  const translate = (el.getAttribute('translate') || '').toLowerCase()
  if (translate === 'no') return true
  if (el.hasAttribute('data-lt-verbatim')) return true
  if (el.classList && el.classList.contains('notranslate')) return true
  return false
}

/** 就地轉換一棵 DOM 的文字節點；屬性、class、id 永遠不碰（卡片 CSS／JS 靠它們）。 */
export function convertTextNodes(root: Node, convert: (text: string) => string): void {
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const text = node.nodeValue || ''
      if (HAS_CJK.test(text)) node.nodeValue = convert(text)
      return
    }
    if (node.nodeType !== 1 && node.nodeType !== 11) return
    if (node.nodeType === 1) {
      const el = node as Element
      if (SKIP_TAGS.has(el.tagName) || isVerbatimElement(el)) return
    }
    for (let child = node.firstChild; child; child = child.nextSibling) walk(child)
  }
  walk(root)
}
