/**
 * 風月寫法的 CSS → 我們畫布的 CSS。
 *
 * ── 風月怎麼套作者的 CSS（2026-11-10 讀它前端與量執行中的頁面）──
 * 聊天欄包在一個容器 div#installedBuiltInCss 裡（頁首、訊息、輸入區都在內），深色時容器帶 .dark。
 * 作者的每條規則都被接上容器前綴（postcss-prefix-selector＋它自訂的轉換）：
 *   - `.x`、`#ai-chat-input`、`*` → `#installedBuiltInCss .x`：只管聊天欄；
 *   - `body`／`html`／`:root`（含 `body .x`）→ `#installedBuiltInCss body`…：永遠不生效；
 *   - `.dark .x` → `#installedBuiltInCss.dark .x`；`html.dark .x` → `html.dark #installedBuiltInCss .x`；
 *   - `#customized-variable-panel…` 原樣（變數面板在容器外）。
 * 介面美化寫給它聊天頁固定的元素 id（每則訊息都重複同一組 id），例如 #customized-answer-content（AI 氣泡）、
 * #ai-chat-input（輸入框）、#ai-send-button（送出鍵）。這些 id 在我們的 DOM 裡不存在，原樣套用一條都對不到。
 *
 * ── 這裡做的事 ──
 * 1. 照上面的前綴規則重現作用範圍：死規則丟掉，其餘接上我們的畫布根。
 * 2. 風月元素 id 換成我們的節點（ID_MAP）。沒有對應的風月 id 整條選擇器丟掉；作者自己內容裡的 id 不動。
 * 3. 權重照風月：容器與每個風月 id 都換成 `:where(我們的節點):not(#lt-fy)`——`:where` 本身不算權重，
 *    `:not(#…)` 剛好補一個 id 的權重——所以同一份 CSS 內部誰蓋誰跟在風月上一樣。
 * 4. 按鈕這類節點我們的內部結構和尺寸跟風月不同：位置、尺寸、顯示方式、變形與外距丟掉，
 *    顏色、邊框、圓角、陰影、字型與內距留著（例：每套官方主題都對送出鍵寫 position:relative; top:-4px; width:32px）。
 * 5. 去掉 !important，整份包進 @layer lt-author-fengyue。層的順序在平台層 lt-base 之後，所以蓋過平台預設；
 *    作者其他寫法的 <style> 不分層，永遠蓋過這一層，不論選擇器權重——「顯示規則最高」的水位線。
 *    !important 一定要去：分層裡的 !important 會反過來贏過不分層的 !important，正則就壓不住了；
 *    平台在更低的層，本來就不必靠 !important 贏。
 *
 * 純字串處理（沒有 DOM），宿主頁與沙箱殼共用。手寫掃描的理由同 author-style-scope：CSSOM 會吞掉它看不懂的規則。
 */

export const FENGYUE_LAYER = 'lt-author-fengyue'

/** 風月元素 id 的「像 id 一樣重」的替身：`:where()` 不算權重，`:not(#lt-fy)` 補一個 id。 */
const ID_WEIGHT = ':not(#lt-fy)'
const like = (sel: string) => `:where(${sel})${ID_WEIGHT}`

const ROOT = '.canvas-root'
const DARK = '[data-lt-theme="dark"]'
const AI = '.mes[data-lt-role="ai"]'
const ME = '.mes[data-lt-role="user"]'

type Tier = 'full' | 'paint'

/**
 * 風月 id → 我們的節點。full：照搬所有宣告；paint：只留上色（見 LAYOUT_PROP）。
 * 兩頁（一般頁與沙箱頁）共用同一批元件，所以用 class 對應，不用只有沙箱才有的 data-chat。
 */
const ID_MAP: Record<string, [string, Tier]> = {
  installedBuiltInCss: [ROOT, 'full'],
  'customized-answer': [AI, 'full'],
  'customized-question': [ME, 'full'],
  'customized-answer-container': [`${AI} .mes_turn`, 'paint'],
  'customized-answer-content-container': [`${AI} .mes_turn`, 'paint'],
  'customized-question-content-container': [`${ME} .mes_turn`, 'paint'],
  // 氣泡：也是畫布量主題色的節點（canvas-card-theme），思考過程等區塊會跟著換色。
  'customized-answer-content': [`${AI} .mes_text`, 'full'],
  'customized-question-content': [`${ME} .mes_text`, 'full'],
  'customized-answer-content-markdown': [`${AI} .lt-bubble-body`, 'full'],
  'customized-question-content-markdown': [`${ME} .lt-bubble-body`, 'full'],
  'customized-answer-avatar': [`${AI} .mesAvatarWrapper`, 'paint'],
  'customized-question-avatar': [`${ME} .mesAvatarWrapper`, 'paint'],
  'customized-answer-content-thinking-block-container': ['.mes_reasoning_details', 'paint'],
  // 訊息動作列不對應：風月是一排淺色小按鈕，我們只有一顆「⋯」。漆整列會在「⋯」外多一圈膠囊，
  // 漆在「⋯」上則它的點變得看不見（2026-11-10 離線沙箱實測三套官方主題）。
  'customized-reload-button': ['.lt-msg-regen', 'paint'],
  'customized-opening-statement-selector': ['.swipeRightBlock', 'paint'],
  'customized-model-selector': ['.mind-type', 'paint'],
  // 輸入框：我們的 textarea 本身透明，底色與邊框在外框上。
  'ai-chat-input': ['.composer-field', 'full'],
  'ai-input-content': ['.composer-field', 'full'],
  'ai-send-button': ['.lt-send', 'paint'],
  'ai-send-button-icon': ['.lt-send svg', 'paint'],
  'customized-ai-input-container': ['.composer-scope', 'paint'],
  // 按鈕列與列內按鈕 → 我們的快捷鍵列與快捷鍵（也是畫布量藥丸色的節點）。
  'ai-mod-button2': ['.shortcut-bar', 'paint'],
  'ai-mod-button': ['.shortcut-btn', 'paint'],
  'customized-more-button': ['.shortcut-btn', 'paint'],
  'toggle-sub-buttons': ['.shortcut-btn', 'paint'],
  'chat-input-more-menu': ['.more-scope', 'paint'],
  // 變數面板在風月是容器外的例外；我們的在畫布根裡，照樣接前綴。
  'customized-variable-panel': ['.lt-state-panel', 'full'],
  'customized-variable-panel-floating-button': ['.lt-state-btn', 'paint'],
}
const SHORTCUT_ID = /^customized-shortcut-command-button-\d+$/
const knownHook = (id: string): [string, Tier] | undefined => Object.prototype.hasOwnProperty.call(ID_MAP, id) ? ID_MAP[id] : SHORTCUT_ID.test(id) ? ['.shortcut-btn', 'paint'] : undefined
/** 風月介面的 id 前綴。這些 id 沒對應就整條丟；不是這些前綴的 id 是作者內容自己的，原樣留著。 */
const FENGYUE_ID = /^(customized-|ai-|header-setting-|toggle-sub-buttons$|chat-input-more-menu$|installedBuiltInCss$)/

/** 會移動或改尺寸的宣告：按鈕類（paint）只上色時丟掉。 */
const LAYOUT_PROP = /^(?:-[a-z]+-)?(position|top|left|right|bottom|inset|inset-[a-z-]+|width|height|min-width|min-height|max-width|max-height|inline-size|block-size|aspect-ratio|display|flex|flex-[a-z-]+|grid|grid-[a-z-]+|order|float|margin|margin-[a-z-]+|transform|transform-[a-z-]+|translate|rotate|scale|overflow|overflow-[xy]|visibility|z-index|vertical-align|align-self|justify-self|place-self)$/i

/** 帶文字的節點：設了底色卻沒設字色時要補可讀的字色（見 readableColor）。 */
type TextNode = 'composer' | 'bubble'
const TEXT_NODE: Record<string, TextNode> = {
  'ai-chat-input': 'composer',
  'ai-input-content': 'composer',
  'customized-answer-content': 'bubble',
  'customized-question-content': 'bubble',
  'customized-answer-content-markdown': 'bubble',
  'customized-question-content-markdown': 'bubble',
}

function mapId(id: string): [string, Tier] | null | undefined {
  if (ID_MAP[id]) return ID_MAP[id]
  if (SHORTCUT_ID.test(id)) return ['.shortcut-btn', 'paint']
  return FENGYUE_ID.test(id) ? null : undefined // null＝風月介面但我們沒有；undefined＝不是風月介面的 id
}

/** 一條選擇器 → 我們的選擇器；null＝在風月不生效或我們沒有對應，丟掉。 */
export function translateSelector(raw: string, knownOnly = false): { selector: string; tier: Tier; text?: TextNode } | null {
  let sel = raw.trim()
  if (!sel) return null
  let dark = false
  let attachToRoot = false
  if (/^html\.dark(?![\w-])/.test(sel)) { dark = true; sel = sel.slice(9).trim() }
  else if (/^(html|body|:root)(?![\w-])/.test(sel)) return null // 風月接上容器前綴後永遠不生效
  else if (/^\.dark(?![\w-])/.test(sel)) {
    dark = true
    sel = sel.slice(5)
    // `.dark:hover`、`.dark.x` 黏在容器上，剩下的接在根上；`.dark .x` 的空白留在開頭，是根底下的元素。
    attachToRoot = sel !== '' && !/^\s/.test(sel)
    sel = sel.trim()
  }
  let tier: Tier = 'full'
  let text: TextNode | undefined
  let dropped = false
  // 引號裡的 # 是屬性值（a[href="#ai-x"]），不是 id。
  let mapped = sel.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#([A-Za-z_][\w-]*)/g, (whole, id: string | undefined) => {
    if (!id) return whole
    const hit = knownOnly ? knownHook(id) : mapId(id)
    if (hit === undefined) return whole
    if (hit === null) { dropped = true; return whole }
    if (hit[1] === 'paint') tier = 'paint'
    if (TEXT_NODE[id]) text = TEXT_NODE[id]
    return like(hit[0])
  })
  if (dropped) return null
  // 我們的提示字是一個 div，不是 ::placeholder；輸入框的 :focus 落在外框上要用 :focus-within。
  mapped = mapped
    .replace(/(:where\(\.composer-field\):not\(#lt-fy\))::?placeholder/g, '$1 .uni-textarea-placeholder')
    .replace(/(:where\(\.composer-field\):not\(#lt-fy\)):focus(?![\w-])/g, '$1:focus-within')
  const root = like(ROOT) + (dark ? DARK : '')
  const extra = text ? { text } : {}
  if (attachToRoot) return { selector: root + mapped, tier, ...extra }
  // 作者自己寫了容器 id：已經換成根，不再接一次。
  if (mapped.startsWith(like(ROOT))) return { selector: dark ? mapped.replace(like(ROOT), root) : mapped, tier, ...extra }
  return { selector: mapped ? `${root} ${mapped}` : root, tier, ...extra }
}

// ── 掃描 ──

interface Node { prelude: string; body: string | null; start?: number; end?: number; bodyStart?: number; bodyEnd?: number } // body null＝以分號結尾的 at-rule（@import 等）

function parse(css: string): Node[] {
  const src = String(css == null ? '' : css)
  const out: Node[] = []
  let i = 0
  while (i < src.length) {
    // 跳過空白與註解
    if (/\s/.test(src[i])) { i++; continue }
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue }
    if (src[i] === '}') { i++; continue } // 不成對的右括號：瀏覽器也會略過
    const start = i
    let q: string | null = null
    let paren = 0
    while (i < src.length) {
      const ch = src[i]
      if (q) { if (ch === '\\') i++; else if (ch === q) q = null; i++; continue }
      if (ch === '"' || ch === "'") { q = ch; i++; continue }
      if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue }
      if (ch === '(') paren++
      else if (ch === ')') paren--
      else if (paren <= 0 && (ch === '{' || ch === ';')) break
      i++
    }
    const prelude = src.slice(start, i).trim()
    if (i >= src.length) break
    if (src[i] === ';') { out.push({ prelude, body: null, start, end: i + 1 }); i++; continue }
    // 讀整個區塊
    const bodyStart = ++i
    let depth = 1
    let par = 0
    q = null
    while (i < src.length && depth > 0) {
      const ch = src[i]
      if (q) { if (ch === '\\') i++; else if (ch === q) q = null; i++; continue }
      if (ch === '"' || ch === "'") { q = ch; i++; continue }
      if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue }
      // 沒加引號的 url(…) 裡可能有大括號：括號裡的不算區塊。
      if (ch === '(') par++
      else if (ch === ')') par = Math.max(0, par - 1)
      else if (par === 0 && ch === '{') depth++
      else if (par === 0 && ch === '}') depth--
      i++
    }
    const bodyEnd = depth === 0 ? i - 1 : i
    out.push({ prelude, body: src.slice(bodyStart, bodyEnd), start, end: i, bodyStart, bodyEnd })
  }
  return out
}

/** 以頂層（不在括號、引號內）的分隔字元切開。 */
function splitTop(text: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let q: string | null = null
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue }
    if (ch === '"' || ch === "'") q = ch
    else if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === sep && depth === 0) { out.push(text.slice(start, i)); start = i + 1 }
  }
  out.push(text.slice(start))
  return out
}

function stripComments(text: string): string {
  // 引號裡的 /* 是字串內容，不是註解。
  return text.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\*[\s\S]*?(?:\*\/|$)/g, (m) => (m.startsWith('/*') ? '' : m))
}

/** 宣告區塊拆成一條條：去 !important；paint 時丟掉位置與尺寸類。區塊裡有巢狀規則回 null（只去 !important，原樣留著）。 */
function splitDeclarations(body: string, tier: Tier): string[] | null {
  if (body.includes('{')) return null
  return splitTop(stripComments(body), ';')
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => tier !== 'paint' || !LAYOUT_PROP.test(propOf(d)))
    .map((d) => d.replace(/\s*!\s*important\b/gi, ''))
}

const propOf = (decl: string) => decl.slice(0, Math.max(0, decl.indexOf(':'))).trim().toLowerCase()
const valueOf = (decl: string) => decl.slice(decl.indexOf(':') + 1).trim()
const block = (decls: string[]) => ' ' + decls.join('; ') + '; '

/** 輸入框的字型與字色要落到我們的 textarea 本身（風月的 #ai-chat-input 就是 textarea，我們的對到外框）。 */
const TEXT_PROP = /^(?:-webkit-text-fill-color|color|caret-color|font|font-[a-z-]+|letter-spacing|text-shadow)$/

// ── 讀得到的字色 ──
// 只設底色、沒設字色時，字色會是平台的（深色模式是淺字），淺色底上幾乎看不見（QA 2026-11-11）。
// 風月本身在卡片有 CSS 時把氣泡字固定成深色；這裡改成照底色深淺挑一個讀得到的。
const NAMED: Record<string, [number, number, number, number]> = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] }

function firstColor(value: string): [number, number, number, number] | null {
  const m = /#([0-9a-f]{3,8})\b|rgba?\(([^)]*)\)|hsla?\(([^)]*)\)|\b(white|black|transparent)\b/i.exec(value)
  if (!m) return null
  if (m[1]) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1]
  }
  if (m[2]) {
    const n = m[2].split(/[\s,/]+/).filter(Boolean)
    const alpha = n[3] == null ? 1 : n[3].endsWith('%') ? parseFloat(n[3]) / 100 : parseFloat(n[3])
    return [parseFloat(n[0]), parseFloat(n[1]), parseFloat(n[2]), alpha]
  }
  if (m[3]) {
    const n = m[3].split(/[\s,/]+/).filter(Boolean)
    const l = parseFloat(n[2]) / 100
    const alpha = n[3] == null ? 1 : n[3].endsWith('%') ? parseFloat(n[3]) / 100 : parseFloat(n[3])
    return [l * 255, l * 255, l * 255, alpha] // 只看明度
  }
  return NAMED[m[4].toLowerCase()]
}

const DARK_TEXT = '#1f2328'
const LIGHT_TEXT = '#f2f2f5'

/** 規則設了看得出深淺的底色、卻沒設字色：回一個讀得到的字色；否則 null。 */
function readableColor(decls: string[]): string | null {
  if (decls.some((d) => propOf(d) === 'color')) return null
  const bg = decls.filter((d) => /^background(-color|-image)?$/.test(propOf(d))).pop()
  if (!bg) return null
  const c = firstColor(valueOf(bg))
  if (!c || c[3] < 0.5) return null
  const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255
  return lum > 0.55 ? DARK_TEXT : LIGHT_TEXT
}

function translateNodes(nodes: Node[], imports: string[], knownOnly = false, readableFallback = true): string {
  let out = ''
  for (const node of nodes) {
    const head = node.prelude
    if (node.body === null) {
      // @import 只能在樣式表最前面，不能進 @layer 區塊：拿出來交給呼叫端放在最前。@charset 在 <style> 裡沒有作用。
      if (/^@import\b/i.test(head)) imports.push(head + ';')
      continue
    }
    if (/^@(media|supports|container|layer|scope|document|starting-style)\b/i.test(head)) {
      const inner = translateNodes(parse(node.body), imports, knownOnly, readableFallback)
      if (inner.trim()) out += `${head} {\n${inner}}\n`
      continue
    }
    if (head.startsWith('@')) {
      // @keyframes、@font-face、@property…：內容不是選擇器，原樣保留（!important 在 keyframes 裡本來就無效）。
      out += `${head} {${node.body}}\n`
      continue
    }
    const parts = splitTop(stripComments(head), ',').map((selector) => translateSelector(selector, knownOnly)).filter((p): p is NonNullable<ReturnType<typeof translateSelector>> => !!p)
    if (!parts.length) continue
    // 同一條規則的選擇器裡只要有一個是按鈕類，整條就只上色（寧可少套，不讓版面錯位）。
    const tier: Tier = parts.some((p) => p.tier === 'paint') ? 'paint' : 'full'
    const decls = splitDeclarations(node.body, tier)
    if (decls === null) { out += `${parts.map((p) => p.selector).join(',\n')} {${node.body.replace(/\s*!\s*important\b/gi, '')}}\n`; continue }
    if (!decls.length) continue
    const fallback = readableFallback && parts.some((p) => p.text) ? readableColor(decls) : null
    const own = fallback ? [...decls, `color:${fallback}`] : decls
    out += `${parts.map((p) => p.selector).join(',\n')} {${block(own)}}\n`
    // 輸入框：字色、字型也寫到 textarea 本身（提示字是另一個 div，跟著外框的字色走）。
    const composer = parts.filter((p) => p.text === 'composer' && !p.selector.includes('.uni-textarea-placeholder'))
    const textDecls = own.filter((d) => TEXT_PROP.test(propOf(d)))
    if (composer.length && textDecls.length) out += `${composer.map((p) => `${p.selector} .uni-textarea-textarea`).join(',\n')} {${block(textDecls)}}\n`
    // 輸入列上的燈泡、字數、「＋」用 currentColor，跟著輸入列的字色：給它同一個字色，深底上才看得到（QA 2026-11-11）。
    // 只給沒有狀態的規則（:focus 時改色不該連圖示一起閃）。
    const field = like('.composer-field')
    const rowColor = own.filter((d) => propOf(d) === 'color').pop()
    const rows = composer.filter((p) => p.selector.endsWith(field)).map((p) => p.selector.slice(0, -field.length) + like('.send-msg'))
    if (rowColor && rows.length) out += `${rows.join(',\n')} {${block([rowColor])}}\n`
  }
  return out
}

/** 一段風月寫法的 CSS → 我們畫布用的 CSS（包在 @layer lt-author-fengyue 裡）。 */
export function translateFengyueCss(css: string, options: { readableFallback?: boolean } = {}): string {
  const imports: string[] = []
  const body = translateNodes(parse(css), imports, false, options.readableFallback !== false)
  if (!body.trim() && !imports.length) return ''
  return (imports.length ? imports.join('\n') + '\n' : '') + (body.trim() ? `@layer ${FENGYUE_LAYER} {\n${body}}\n` : '')
}

/** 只認公開對照表內的 ID token，字串／屬性／註解不是來源指紋。 */
function hasKnownHook(selector: string): boolean {
  let found = false
  stripComments(selector).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\[[^\]]*\]|#([A-Za-z_][\w-]*)/g, (whole, id: string | undefined) => {
    if (id && knownHook(id)) found = true
    return whole
  })
  return found
}

/**
 * 沒有來源提示的 CSS：只轉已知風月掛點。其他選擇器交回現有卡片政策，
 * 不猜整段的來源，也不讓逗號同組的本站規則跟著被去 important／限制版面。
 */
export function adaptFengyueSelectors(css: string, native: (css: string) => string): string {
  const source = String(css == null ? '' : css)
  const edits: Array<{ start: number; end: number; text: string }> = []
  for (const node of parse(source)) {
    if (node.body === null || node.start == null || node.end == null) continue
    if (/^@(media|supports|container|layer|scope|document|starting-style)\b/i.test(node.prelude)) {
      const body = adaptFengyueSelectors(node.body, native)
      if (body !== node.body && node.bodyStart != null && node.bodyEnd != null) edits.push({ start: node.start, end: node.end, text: source.slice(node.start, node.bodyStart) + body + source.slice(node.bodyEnd, node.end) })
      continue
    }
    if (node.prelude.startsWith('@')) continue
    const selectors = splitTop(stripComments(node.prelude), ',')
    if (!selectors.some(hasKnownHook)) continue
    const replacement = selectors.map((selector) => {
      if (!hasKnownHook(selector)) return native(`${selector.trim()}{${node.body}}`)
      const translated = translateNodes([{ prelude: selector, body: node.body }], [], true)
      return translated ? `@layer ${FENGYUE_LAYER} {\n${translated}}\n` : ''
    }).join('\n')
    edits.push({ start: node.start, end: node.end, text: replacement })
  }
  if (!edits.length) return native(source)
  let cursor = 0
  let out = ''
  for (const edit of edits) {
    out += native(source.slice(cursor, edit.start)) + edit.text
    cursor = edit.end
  }
  return out + native(source.slice(cursor))
}

/** 根層 @import 與正文分開，不能把宣告字串／註解裡的文字當成匯入。 */
export function splitCssImports(css: string): { imports: string[]; body: string } {
  const imports: string[] = []
  let body = ''
  let cursor = 0
  for (const node of parse(css)) {
    if (node.body !== null || !/^@import\b/i.test(node.prelude) || node.start == null || node.end == null) continue
    body += css.slice(cursor, node.start)
    imports.push(node.prelude)
    cursor = node.end
  }
  return { imports, body: body + css.slice(cursor) }
}

/** @import 的 URL 後面接 layer，保留作者的既有 layer 名稱與 media/supports 條件。 */
export function layeredCssImport(entry: string, targetLayer: string): string {
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
  return `${uri} layer(${targetLayer}${name ? '.' + name : ''})${qualifier ? ' ' + qualifier : ''};`
}

/** 新整卡欄位明寫在無條件 `.canvas-root` 上的 custom properties；不猜條件式規則。 */
export function unconditionalCardRootProperties(css: string): string[] {
  const properties: string[] = []
  for (const node of parse(css)) {
    if (node.body === null) continue
    if (/^@layer\b/i.test(node.prelude)) { properties.push(...unconditionalCardRootProperties(node.body)); continue }
    if (node.prelude.startsWith('@') || !splitTop(stripComments(node.prelude), ',').some(selector => selector.trim() === '.canvas-root')) continue
    for (const declaration of splitTop(stripComments(node.body), ';')) {
      const name = /^\s*(--[\w-]+)\s*:/.exec(declaration)?.[1]
      if (name) properties.push(name)
    }
  }
  return [...new Set(properties)]
}
