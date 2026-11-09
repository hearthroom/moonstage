/**
 * 變數面板皮膚的 Handlebars 子集渲染器。
 *
 * 風月匯入的卡帶一份「面板皮膚」（Handlebars 模板＋CSS），用來畫卡片的變數。一般頁面與沙箱殼都要畫
 * 同一份皮膚，所以兩邊打包同一個模組：同一份模板＋資料，輸出的 HTML 逐字相同。面板不執行 JS（與風月
 * 一致），輸出一律經過 sanitizePanelHtml。
 *
 * 放在 src/common/：殼（src/sandbox/shell.ts）與宿主畫布（src/pages/canvas/）都已從這裡引入共用碼；
 * 殼的邊界檢查量的是 build 產物裡有沒有宿主請求層的字樣，所以這個模組不 import 任何東西。
 * 不用 new Function／eval（殼與站台的 CSP 都不允許），也不加任何 npm 依賴。
 *
 * 支援的子集與刻意的差異（相對 handlebars.js 4.x）：
 * - `{{path}}` 轉義輸出、`{{{path}}}` 與 `{{& path}}` 原樣輸出、`{{! }}`／`{{!-- --}}` 註解、`\{{` 跳脫。
 * - 路徑：`a.b`、`a/b`、`a.[任意 鍵]`、`this`、`.`、`../x`、`@index`／`@key`／`@first`／`@last`、
 *   `@root.x`、`@../index`、`@changes`（opts.changes）、`@audience`（opts.audience）。中日韓鍵名照常可用。
 *   只讀自有屬性：`constructor`、`__proto__` 之類原型上的東西一律讀不到。
 * - 區塊：`#if`、`#unless`、`#each`（陣列與物件；`as |item i|` 區塊參數）、`#with`（`as |x|`）、
 *   `{{else}}`／`{{^}}`、`{{else if …}}` 之類的串接、`{{^x}}…{{/x}}` 反向區段。
 *   `{{#x}}…{{/x}}` 的 x 不是 helper 時照 Handlebars 的 blockHelperMissing：陣列逐項、物件換上下文、
 *   其餘真值照原上下文畫一次、假值畫 else。內建 helper 也可當區塊用（`{{#eq a b}}…{{/eq}}`），
 *   回傳值同樣套這個規則。
 * - helper：eq、ne（嚴格相等，唯一的例外是數字與數字字串：50 與 "50" 視為相等——模型寫的 JSON 常把數字寫成字串）、
 *   gt、gte、lt、lte（JS 比較運算）、and、or（可多參數）、not、lookup。
 *   可寫成子運算式 `(gt 好感度 50)`。字面值：數字、單雙引號字串、true／false／null／undefined。
 *   `key=value` 雜湊參數會解析，只有 `#if`／`#unless` 的 `includeZero` 有作用，其餘忽略。
 * - 真假：`!v` 或空陣列為假（0 為假，除非 includeZero=true）；`{}` 為真。and／or／not 用同一套。
 * - `{{x}}` 的值：null／undefined／函式 → ''；false → 'false'；陣列以 ',' 串接；物件 → '[object Object]'。
 * - `{{~ … ~}}` 會吃掉相鄰的空白；Handlebars 對「單獨成行」的區塊標籤自動去行的規則沒有實作。
 * - 不支援：partials（`{{> x}}`）、inline partials、decorators、自訂 helper。遇到時回報錯誤。
 * - 有參數的未知 helper（`{{foo x}}`、`{{#foo x}}`、`(foo x)`）在解析階段就報錯，即使所在分支
 *   不會被畫到；這樣作者預覽一定看得到錯，不必剛好命中那條分支。
 */

export interface PanelRenderResult {
  html: string
  error?: { message: string; line: number; helper?: string }
}

export interface PanelRenderOptions {
  /** 這一輪的變動清單，模板用 `@changes` 讀（例如畫出 舊值 → 新值）。 */
  changes?: unknown[]
  /** 呼叫端保留用：不影響輸出，只以 `@audience` 提供給模板。錯誤一律完整回傳，由呼叫端決定給誰看。 */
  audience?: 'author' | 'player'
}

class PanelTemplateError extends Error {
  line: number
  helper?: string
  constructor(message: string, line: number, helper?: string) {
    super(message)
    this.line = line
    this.helper = helper
  }
}

// ---------------------------------------------------------------------------
// AST

interface PathExpr {
  type: 'path'
  /** `@` 開頭的資料變數（@index、@root…）。 */
  data: boolean
  /** `../` 的層數。 */
  depth: number
  /** 以 this／. 開頭：只在目前上下文找，不看區塊參數。 */
  explicitThis: boolean
  parts: string[]
  original: string
}
interface LiteralExpr { type: 'literal'; value: unknown }
interface CallExpr { type: 'call'; name: string; params: Expr[]; hash: Record<string, Expr>; line: number }
type Expr = PathExpr | LiteralExpr | CallExpr

interface TextNode { type: 'text'; value: string }
interface MustacheNode { type: 'mustache'; expr: Expr; escape: boolean; line: number }
interface BlockNode {
  type: 'block'
  /** 區塊名：內建區塊、inline helper 名，或區段（section）的路徑原文。 */
  name: string
  /** 名稱是路徑（沒有參數的區段）時，它的路徑。 */
  path?: PathExpr
  params: Expr[]
  hash: Record<string, Expr>
  blockParams: string[]
  /** `{{^x}}` 反向區段。 */
  inverted: boolean
  program: Node[]
  inverse: Node[] | null
  line: number
}
type Node = TextNode | MustacheNode | BlockNode

const BLOCK_HELPERS = new Set(['if', 'unless', 'each', 'with'])

type InlineHelper = (args: unknown[]) => unknown
const INLINE_HELPERS: Record<string, InlineHelper> = {
  eq: (a) => sameValue(a[0], a[1]),
  ne: (a) => !sameValue(a[0], a[1]),
  gt: (a) => (a[0] as number) > (a[1] as number),
  gte: (a) => (a[0] as number) >= (a[1] as number),
  lt: (a) => (a[0] as number) < (a[1] as number),
  lte: (a) => (a[0] as number) <= (a[1] as number),
  and: (a) => a.length > 0 && a.every(isTruthy),
  or: (a) => a.some(isTruthy),
  not: (a) => !isTruthy(a[0]),
  lookup: (a) => readProp(a[0], a[1]),
}

/** 嚴格相等；一邊是數字、另一邊是寫成同一個數的字串時也算相等（`50` 與 `"50"`、`1.5` 與 `" 1.5 "`）。 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'string') return numericString(b) === a
  if (typeof a === 'string' && typeof b === 'number') return numericString(a) === b
  return false
}

function numericString(s: string): number | null {
  const t = s.trim()
  if (!t || !/^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null
  return Number(t)
}

function isKnownHelper(name: string): boolean {
  return BLOCK_HELPERS.has(name) || Object.prototype.hasOwnProperty.call(INLINE_HELPERS, name)
}

// ---------------------------------------------------------------------------
// 標籤切分

type TagKind = 'comment' | 'mustache' | 'raw' | 'open' | 'inverse-open' | 'close' | 'else'
interface TextToken { kind: 'text'; value: string; line: number }
interface TagToken { kind: TagKind; body: string; line: number; stripBefore: boolean; stripAfter: boolean }
type Token = TextToken | TagToken

/** 從 from 起找標籤的結尾 close，略過引號字串與 [ ] 路徑段裡的同名字元。 */
function findTagEnd(src: string, from: number, close: string): number {
  let quote = ''
  let bracket = false
  for (let i = from; i < src.length; i++) {
    const ch = src[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
      continue
    }
    if (bracket) {
      if (ch === ']') bracket = false
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '[') bracket = true
    else if (src.startsWith(close, i)) return i
  }
  return -1
}

function countLines(text: string): number {
  let n = 0
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++
  return n
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let pos = 0
  let line = 1
  const pushText = (value: string) => {
    if (value) tokens.push({ kind: 'text', value, line })
    line += countLines(value)
  }
  while (pos < src.length) {
    const open = src.indexOf('{{', pos)
    if (open === -1) {
      pushText(src.slice(pos))
      break
    }
    // `\{{x}}` 原樣輸出 `{{x}}`
    if (open > 0 && src[open - 1] === '\\' && !(open > 1 && src[open - 2] === '\\')) {
      pushText(src.slice(pos, open - 1))
      const end = src.indexOf('}}', open + 2)
      const stop = end === -1 ? src.length : end + 2
      pushText(src.slice(open, stop))
      pos = stop
      continue
    }
    pushText(src.slice(pos, open))
    const tagLine = line
    let i = open + 2
    // 三括號的空白控制兩種寫法都收：`{{{~x~}}}` 與 Handlebars 正式的 `{{~{x}~}}`。
    const tildeFirst = src[i] === '~' && src[i + 1] === '{'
    if (tildeFirst) i++
    const triple = src[i] === '{'
    if (triple) i++
    const stripBefore = tildeFirst || src[i] === '~'
    if (src[i] === '~') i++

    // 註解：{{!-- … --}} 可含 }}；{{! … }} 到第一個 }} 為止。
    if (!triple && src[i] === '!') {
      const long = src.startsWith('!--', i)
      const endMark = long ? src.indexOf('--', i + 3) : -1
      let end = -1
      if (long) {
        let k = endMark
        while (k !== -1) {
          const after = src[k + 2] === '~' ? k + 3 : k + 2
          if (src.startsWith('}}', after)) { end = k; break }
          k = src.indexOf('--', k + 1)
        }
      } else {
        end = src.indexOf('}}', i)
      }
      if (end === -1) throw new PanelTemplateError('Unclosed comment: missing "}}"', tagLine)
      let closeAt = long ? end + 2 : end
      let stripAfter = false
      if (long && src[closeAt] === '~') { stripAfter = true; closeAt++ }
      if (!long && src[end - 1] === '~') stripAfter = true
      const stop = closeAt + 2
      tokens.push({ kind: 'comment', body: '', line: tagLine, stripBefore, stripAfter })
      line += countLines(src.slice(open, stop))
      pos = stop
      continue
    }

    let closeMark = triple ? '}}}' : '}}'
    let end = findTagEnd(src, i, closeMark)
    let stripAfter = false
    if (triple) {
      const alt = findTagEnd(src, i, '}~}}')
      if (alt !== -1 && (end === -1 || alt < end)) { end = alt; closeMark = '}~}}'; stripAfter = true }
    }
    if (end === -1) throw new PanelTemplateError(`Unclosed tag: missing "${closeMark}"`, tagLine)
    let body = src.slice(i, end)
    if (body.endsWith('~')) { stripAfter = true; body = body.slice(0, -1) }
    body = body.trim()
    const stop = end + closeMark.length
    line += countLines(src.slice(open, stop))
    pos = stop

    let kind: TagKind
    if (triple) kind = 'raw'
    else if (body[0] === '#') {
      if (body[1] === '>' || body[1] === '*') throw new PanelTemplateError('Partials and decorators are not supported', tagLine)
      kind = 'open'; body = body.slice(1).trim()
    } else if (body[0] === '^') {
      body = body.slice(1).trim()
      kind = body ? 'inverse-open' : 'else'
    } else if (body[0] === '/') { kind = 'close'; body = body.slice(1).trim() }
    else if (body === 'else' || /^else\s/.test(body)) { kind = 'else'; body = body.slice(4).trim() }
    else if (body[0] === '>') throw new PanelTemplateError('Partials are not supported', tagLine)
    else if (body[0] === '&') { kind = 'raw'; body = body.slice(1).trim() }
    else kind = 'mustache'
    if (kind !== 'else' && kind !== 'close' && !body) throw new PanelTemplateError('Empty tag', tagLine)
    tokens.push({ kind, body, line: tagLine, stripBefore, stripAfter })
  }

  // 空白控制：{{~ 吃掉前一段文字結尾的空白，~}} 吃掉下一段文字開頭的空白。
  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t]
    if (tok.kind === 'text') continue
    const prev = tokens[t - 1]
    const next = tokens[t + 1]
    if (tok.stripBefore && prev && prev.kind === 'text') prev.value = prev.value.replace(/\s+$/, '')
    if (tok.stripAfter && next && next.kind === 'text') next.value = next.value.replace(/^\s+/, '')
  }
  return tokens
}

// ---------------------------------------------------------------------------
// 標籤內的運算式

type ExprToken =
  | { t: '(' } | { t: ')' }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'hash'; key: string }
  | { t: 'bp'; names: string[] }

const ID_STOP = /[\s()=|"'[\]]/

function lexExpr(src: string, line: number): ExprToken[] {
  const out: ExprToken[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === '(' || ch === ')') { out.push({ t: ch }); i++; continue }
    if (ch === '"' || ch === "'") {
      let v = ''
      let k = i + 1
      for (; k < src.length && src[k] !== ch; k++) {
        if (src[k] === '\\' && src[k + 1] === ch) { v += ch; k++ } else v += src[k]
      }
      if (k >= src.length) throw new PanelTemplateError('Unclosed string literal', line)
      out.push({ t: 'str', v })
      i = k + 1
      continue
    }
    // 區塊參數 `as |a b|`
    if (src.startsWith('as', i) && /^as\s*\|/.test(src.slice(i)) && (i === 0 || /\s/.test(src[i - 1]))) {
      const bar = src.indexOf('|', i)
      const endBar = src.indexOf('|', bar + 1)
      if (endBar === -1) throw new PanelTemplateError('Unclosed block parameters "as |…|"', line)
      out.push({ t: 'bp', names: src.slice(bar + 1, endBar).trim().split(/\s+/).filter(Boolean) })
      i = endBar + 1
      continue
    }
    // 路徑或字面值：讀到分隔字元為止，[ ] 內整段照收。
    let k = i
    while (k < src.length) {
      if (src[k] === '[') {
        const close = src.indexOf(']', k)
        if (close === -1) throw new PanelTemplateError('Unclosed "[" in path', line)
        k = close + 1
        continue
      }
      if (ID_STOP.test(src[k])) break
      k++
    }
    if (k === i) throw new PanelTemplateError(`Unexpected "${ch}"`, line)
    const word = src.slice(i, k)
    i = k
    if (src[i] === '=') { out.push({ t: 'hash', key: word }); i++; continue }
    out.push({ t: 'id', v: word })
  }
  return out
}

function parsePath(raw: string, line: number): PathExpr {
  let rest = raw
  const data = rest[0] === '@'
  if (data) rest = rest.slice(1)
  const parts: string[] = []
  let seg = ''
  let haveSeg = false
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i]
    if (ch === '[') {
      const close = rest.indexOf(']', i)
      seg += rest.slice(i + 1, close)
      haveSeg = true
      i = close
    } else if (ch === '.' || ch === '/') {
      // `..` 是一個段（上一層）；單獨的 `.` 是 this。
      if (ch === '.' && rest[i + 1] === '.' && !haveSeg) { parts.push('..'); i++; continue }
      if (haveSeg) parts.push(seg)
      else if (ch === '.' && parts.length === 0) parts.push('this')
      seg = ''
      haveSeg = false
    } else {
      seg += ch
      haveSeg = true
    }
  }
  if (haveSeg) parts.push(seg)
  let depth = 0
  let explicitThis = false
  while (parts[0] === '..') { depth++; parts.shift() }
  if (parts[0] === 'this' && !data) { explicitThis = true; parts.shift() }
  if (data && parts.length === 0) throw new PanelTemplateError(`Invalid data variable "${raw}"`, line)
  return { type: 'path', data, depth, explicitThis: explicitThis || depth > 0, parts, original: raw }
}

function idToExpr(raw: string, line: number): Expr {
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return { type: 'literal', value: Number(raw) }
  if (raw === 'true') return { type: 'literal', value: true }
  if (raw === 'false') return { type: 'literal', value: false }
  if (raw === 'null') return { type: 'literal', value: null }
  if (raw === 'undefined') return { type: 'literal', value: undefined }
  return parsePath(raw, line)
}

interface TagExpr {
  head: ExprToken | null
  params: Expr[]
  hash: Record<string, Expr>
  blockParams: string[]
}

function parseTagExpr(src: string, line: number): TagExpr {
  const toks = lexExpr(src, line)
  let p = 0
  const parseOne = (): Expr => {
    const tok = toks[p++]
    if (!tok) throw new PanelTemplateError('Missing argument', line)
    if (tok.t === 'str') return { type: 'literal', value: tok.v }
    if (tok.t === 'id') return idToExpr(tok.v, line)
    if (tok.t === '(') {
      const head = toks[p++]
      if (!head || head.t !== 'id') throw new PanelTemplateError('A sub-expression must start with a helper name', line)
      const params: Expr[] = []
      const hash: Record<string, Expr> = {}
      while (p < toks.length && toks[p].t !== ')') {
        const cur = toks[p]
        if (cur.t === 'hash') { p++; hash[cur.key] = parseOne() } else params.push(parseOne())
      }
      if (toks[p]?.t !== ')') throw new PanelTemplateError('Unclosed "(" in sub-expression', line)
      p++
      if (BLOCK_HELPERS.has(head.v)) throw new PanelTemplateError(`"${head.v}" must be used as a block: {{#${head.v} …}}`, line, head.v)
      checkHelper(head.v, line)
      return { type: 'call', name: head.v, params, hash, line }
    }
    throw new PanelTemplateError(`Unexpected "${tok.t === ')' ? ')' : tok.t === 'bp' ? 'as |' : '='}"`, line)
  }
  const head = toks[0] ?? null
  p = head && head.t === 'id' ? 1 : 0
  const out: TagExpr = { head: p === 1 ? head : null, params: [], hash: {}, blockParams: [] }
  while (p < toks.length) {
    const tok = toks[p]
    if (tok.t === 'hash') { p++; out.hash[tok.key] = parseOne() }
    else if (tok.t === 'bp') { p++; out.blockParams = tok.names }
    else out.params.push(parseOne())
  }
  return out
}

function checkHelper(name: string, line: number): void {
  if (!isKnownHelper(name)) throw new PanelTemplateError(`Unknown helper "${name}"`, line, name)
}

// ---------------------------------------------------------------------------
// 解析

function parseMustache(tok: TagToken, escape: boolean): MustacheNode {
  const tag = parseTagExpr(tok.body, tok.line)
  if (!tag.head) {
    // `{{"文字"}}`、`{{(eq a b)}}` 這類只有一個運算式的標籤
    if (tag.params.length !== 1) throw new PanelTemplateError('Invalid expression', tok.line)
    return { type: 'mustache', expr: tag.params[0], escape, line: tok.line }
  }
  const name = (tag.head as { v: string }).v
  if (tag.params.length || Object.keys(tag.hash).length) {
    if (BLOCK_HELPERS.has(name)) throw new PanelTemplateError(`"${name}" must be used as a block: {{#${name} …}}`, tok.line, name)
    checkHelper(name, tok.line)
    return { type: 'mustache', expr: { type: 'call', name, params: tag.params, hash: tag.hash, line: tok.line }, escape, line: tok.line }
  }
  return { type: 'mustache', expr: idToExpr(name, tok.line), escape, line: tok.line }
}

function blockFromTag(body: string, line: number, inverted: boolean): BlockNode {
  const tag = parseTagExpr(body, line)
  if (!tag.head) throw new PanelTemplateError('A block must start with a helper name or a path', line)
  const name = (tag.head as { v: string }).v
  const node: BlockNode = {
    type: 'block', name, params: tag.params, hash: tag.hash, blockParams: tag.blockParams,
    inverted, program: [], inverse: null, line,
  }
  const hasArgs = tag.params.length > 0 || Object.keys(tag.hash).length > 0
  if (BLOCK_HELPERS.has(name)) {
    if (tag.params.length !== 1) throw new PanelTemplateError(`{{#${name}}} needs exactly one argument`, line, name)
  } else if (hasArgs) {
    checkHelper(name, line)
  } else {
    const expr = idToExpr(name, line)
    if (expr.type !== 'path') throw new PanelTemplateError(`A block cannot start with a literal: ${name}`, line)
    node.path = expr
  }
  if (inverted && !node.path && !Object.prototype.hasOwnProperty.call(INLINE_HELPERS, name)) {
    throw new PanelTemplateError(`{{^${name}}} cannot be used with a block helper`, line, name)
  }
  return node
}

function parse(src: string): Node[] {
  const tokens = tokenize(src)
  let p = 0

  /** 讀到 else／close／結尾為止。 */
  const parseProgram = (): Node[] => {
    const nodes: Node[] = []
    while (p < tokens.length) {
      const tok = tokens[p]
      if (tok.kind === 'text') { nodes.push({ type: 'text', value: tok.value }); p++; continue }
      if (tok.kind === 'else' || tok.kind === 'close') break
      p++
      if (tok.kind === 'comment') continue
      if (tok.kind === 'mustache') nodes.push(parseMustache(tok, true))
      else if (tok.kind === 'raw') nodes.push(parseMustache(tok, false))
      else {
        const block = blockFromTag(tok.body, tok.line, tok.kind === 'inverse-open')
        parseBlockBody(block)
        const close = tokens[p]
        if (!close) throw new PanelTemplateError(`Unclosed block {{#${block.name}}} (opened on line ${block.line})`, block.line, undefined)
        const closeName = (close as TagToken).body
        if (closeName !== block.name) {
          throw new PanelTemplateError(`{{/${closeName}}} does not match {{#${block.name}}} opened on line ${block.line}`, close.line)
        }
        p++
        nodes.push(block)
      }
    }
    return nodes
  }

  /** 填 program 與 else 鏈；停在 close 前（由最外層的開標籤核對名稱）。 */
  const parseBlockBody = (block: BlockNode): void => {
    block.program = parseProgram()
    const tok = tokens[p]
    if (!tok || tok.kind !== 'else') return
    p++
    const body = (tok as TagToken).body
    if (!body) {
      block.inverse = parseProgram()
      if (tokens[p]?.kind === 'else') throw new PanelTemplateError(`Unexpected {{else}} after {{else}} in {{#${block.name}}}`, tokens[p].line)
      return
    }
    // `{{else if x}}`：串成 inverse 裡的巢狀區塊，跟 Handlebars 一樣共用外層的關閉標籤。
    const chained = blockFromTag(body, tok.line, false)
    parseBlockBody(chained)
    block.inverse = [chained]
  }

  const nodes = parseProgram()
  if (p < tokens.length) {
    const tok = tokens[p] as TagToken
    if (tok.kind === 'else') throw new PanelTemplateError('{{else}} outside of a block', tok.line)
    throw new PanelTemplateError(`{{/${tok.body}}} has no matching opening block`, tok.line)
  }
  return nodes
}

// ---------------------------------------------------------------------------
// 渲染

function readProp(obj: unknown, key: unknown): unknown {
  if (obj === null || obj === undefined) return undefined
  if (typeof key !== 'string' && typeof key !== 'number') return undefined
  return Object.prototype.hasOwnProperty.call(obj, key) ? (obj as Record<string, unknown>)[key as string] : undefined
}

function isTruthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0
  return !!v
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '`': '&#x60;', '=': '&#x3D;',
}

function toText(v: unknown): string {
  if (v === null || v === undefined || typeof v === 'function') return ''
  return String(v)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"'`=]/g, (c) => ESCAPES[c])
}

interface DataFrame { [key: string]: unknown; _parent?: DataFrame }

interface Scope {
  /** 上下文堆疊：只有 each／with／物件區段會推一層，if／unless 不推（../ 因此跳過它們）。 */
  contexts: unknown[]
  data: DataFrame
  /** 區塊參數，內層在後。 */
  blockParams: Array<Record<string, unknown>>
}

function childScope(scope: Scope, context: unknown, data: DataFrame | null, params: Record<string, unknown> | null): Scope {
  return {
    contexts: [...scope.contexts, context],
    data: data ?? scope.data,
    blockParams: params ? [...scope.blockParams, params] : scope.blockParams,
  }
}

function frame(parent: DataFrame, own: Record<string, unknown>): DataFrame {
  const f = Object.create(parent) as DataFrame
  Object.assign(f, own)
  f._parent = parent
  return f
}

function resolvePath(path: PathExpr, scope: Scope): unknown {
  let value: unknown
  let parts = path.parts
  if (path.data) {
    let f: DataFrame | undefined = scope.data
    for (let d = 0; d < path.depth && f; d++) f = f._parent
    if (!f) return undefined
    const [first, ...rest] = parts
    value = first === '_parent' ? undefined : f[first]
    parts = rest
  } else {
    if (!path.explicitThis && parts.length) {
      for (let b = scope.blockParams.length - 1; b >= 0; b--) {
        if (Object.prototype.hasOwnProperty.call(scope.blockParams[b], parts[0])) {
          value = scope.blockParams[b][parts[0]]
          return parts.slice(1).reduce(readProp, value)
        }
      }
    }
    const idx = scope.contexts.length - 1 - path.depth
    if (idx < 0) return undefined
    value = scope.contexts[idx]
  }
  return parts.reduce(readProp, value)
}

function evalExpr(expr: Expr, scope: Scope): unknown {
  if (expr.type === 'literal') return expr.value
  if (expr.type === 'path') return resolvePath(expr, scope)
  return INLINE_HELPERS[expr.name](expr.params.map((e) => evalExpr(e, scope)))
}

function renderNodes(nodes: Node[], scope: Scope, out: string[]): void {
  for (const node of nodes) {
    if (node.type === 'text') out.push(node.value)
    else if (node.type === 'mustache') {
      const text = toText(evalExpr(node.expr, scope))
      out.push(node.escape ? escapeHtml(text) : text)
    } else renderBlock(node, scope, out)
  }
}

function renderInverse(node: BlockNode, scope: Scope, out: string[]): void {
  if (node.inverse) renderNodes(node.inverse, scope, out)
}

function renderEach(node: BlockNode, value: unknown, scope: Scope, out: string[]): void {
  const entries: Array<[string | number, unknown]> = []
  if (Array.isArray(value)) value.forEach((v, i) => entries.push([i, v]))
  else if (value !== null && typeof value === 'object') for (const k of Object.keys(value)) entries.push([k, (value as Record<string, unknown>)[k]])
  if (!entries.length) return renderInverse(node, scope, out)
  const isArray = Array.isArray(value)
  entries.forEach(([key, item], i) => {
    const data = frame(scope.data, { index: i, key, first: i === 0, last: i === entries.length - 1 })
    const params: Record<string, unknown> | null = node.blockParams.length ? {} : null
    if (params) {
      if (node.blockParams[0] !== undefined) params[node.blockParams[0]] = item
      if (node.blockParams[1] !== undefined) params[node.blockParams[1]] = isArray ? i : key
    }
    renderNodes(node.program, childScope(scope, item, data, params), out)
  })
}

/** Handlebars 的 blockHelperMissing：陣列逐項、物件換上下文、其餘真值照原上下文畫一次。 */
function renderSection(node: BlockNode, value: unknown, scope: Scope, out: string[]): void {
  if (node.inverted) {
    if (isTruthy(value)) renderInverse(node, scope, out)
    else renderNodes(node.program, scope, out)
    return
  }
  if (!isTruthy(value)) return renderInverse(node, scope, out)
  if (Array.isArray(value)) return renderEach(node, value, scope, out)
  if (typeof value === 'object') return renderNodes(node.program, childScope(scope, value, null, null), out)
  renderNodes(node.program, scope, out)
}

function renderBlock(node: BlockNode, scope: Scope, out: string[]): void {
  if (node.path) return renderSection(node, resolvePath(node.path, scope), scope, out)
  const args = node.params.map((e) => evalExpr(e, scope))
  switch (node.name) {
    case 'if':
    case 'unless': {
      const includeZero = node.hash.includeZero ? isTruthy(evalExpr(node.hash.includeZero, scope)) : false
      let cond = isTruthy(args[0]) || (includeZero && args[0] === 0)
      if (node.name === 'unless') cond = !cond
      if (cond) renderNodes(node.program, scope, out)
      else renderInverse(node, scope, out)
      return
    }
    case 'each':
      return renderEach(node, args[0], scope, out)
    case 'with': {
      if (!isTruthy(args[0])) return renderInverse(node, scope, out)
      const params = node.blockParams[0] !== undefined ? { [node.blockParams[0]]: args[0] } : null
      return renderNodes(node.program, childScope(scope, args[0], null, params), out)
    }
    default:
      return renderSection(node, INLINE_HELPERS[node.name](args), scope, out)
  }
}

// ---------------------------------------------------------------------------
// 公開介面

/**
 * 把皮膚模板畫成 HTML（已過 sanitizePanelHtml）。解析或渲染出錯時 html 為 ''、error 帶訊息與行號
 * （從 1 起算；未知 helper 時帶 helper 名）。畫不畫錯誤、給誰看由呼叫端決定。
 */
export function renderPanel(template: string, data: unknown, opts: PanelRenderOptions = {}): PanelRenderResult {
  try {
    const ast = parse(typeof template === 'string' ? template : '')
    const root: DataFrame = Object.create(null)
    root.root = data
    root.changes = Array.isArray(opts.changes) ? opts.changes : []
    root.audience = opts.audience
    const out: string[] = []
    renderNodes(ast, { contexts: [data], data: root, blockParams: [] }, out)
    return { html: sanitizePanelHtml(out.join('')) }
  } catch (e) {
    if (e instanceof PanelTemplateError) {
      const error: PanelRenderResult['error'] = { message: e.message, line: e.line }
      if (e.helper) error.helper = e.helper
      return { html: '', error }
    }
    return { html: '', error: { message: e instanceof Error ? e.message : String(e), line: 1 } }
  }
}

// ---------------------------------------------------------------------------
// 清理：面板不執行 JS

/** 連同內容整個移除的元素。 */
const DROP_ELEMENTS = new Set(['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'base', 'meta', 'link'])
const VOID_DROP_ELEMENTS = new Set(['frame', 'embed', 'base', 'meta', 'link'])
/** 值會被當成網址（或 SVG 動畫寫進網址）的屬性。 */
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'data', 'poster', 'background', 'srcset', 'to', 'from', 'values', 'by'])

function isDangerousUrl(value: string): boolean {
  // 瀏覽器解析網址時會忽略控制字元與空白，`java\tscript:` 也算。
  const v = value.replace(/[\u0000- \u007f]+/g, '').toLowerCase()
  return v.includes('javascript:') || v.includes('vbscript:') || v.includes('data:text/html')
}

function isDangerousAttr(name: string, value: string): boolean {
  const n = name.toLowerCase()
  if (n.startsWith('on') || n === 'srcdoc') return true
  return URL_ATTRS.has(n) && isDangerousUrl(value)
}

function sanitizeFragment(root: DocumentFragment | Element): void {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (DROP_ELEMENTS.has(el.localName.toLowerCase())) { el.remove(); continue }
    for (const attr of Array.from(el.attributes)) {
      if (isDangerousAttr(attr.name, attr.value)) el.removeAttribute(attr.name)
    }
    if (el instanceof HTMLTemplateElement) sanitizeFragment(el.content)
  }
}

/**
 * 移除 <script>（連內容）、可嵌入外部程式的元素（iframe、object、embed…）、所有 on* 屬性、srcdoc，
 * 以及網址屬性裡的 javascript:／vbscript:／data:text/html。<style> 保留。
 * 有 document 時用 <template> 解析再序列化（輸出是瀏覽器正規化後的 HTML，例如 `data-x` → `data-x=""`）；
 * 沒有 DOM 時退回逐標籤的字串清理。
 */
export function sanitizePanelHtml(html: string): string {
  if (typeof document !== 'undefined' && document.implementation && typeof document.implementation.createHTMLDocument === 'function') {
    // 呼叫端把結果以 innerHTML 放進一個 <div>：在同樣的情境（惰性文件裡的 <div>，不載圖、不跑腳本）
    // 解析、清理、序列化，再重新解析一次直到結果不再變。有些標記（MathML／SVG 裡的 <style>、
    // 表格重排）序列化後再解析會變成別的樹，只清一次會讓清掉的東西在畫面上復活。
    const inert = document.implementation.createHTMLDocument('')
    const box = inert.createElement('div')
    let current = html
    for (let pass = 0; pass < 4; pass++) {
      box.innerHTML = current
      sanitizeFragment(box)
      const next = box.innerHTML
      if (next === current) return next
      current = next
    }
    return ''
  }
  return sanitizeHtmlString(html)
}

/** 沒有 DOM 時的退路：逐一讀標籤與屬性（處理引號裡的 >、`<img/onerror=…>`），不靠單一正規式。 */
function sanitizeHtmlString(html: string): string {
  const out: string[] = []
  const len = html.length
  let i = 0
  while (i < len) {
    const lt = html.indexOf('<', i)
    if (lt === -1) { out.push(html.slice(i)); break }
    out.push(html.slice(i, lt))
    i = lt
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4)
      const stop = end === -1 ? len : end + 3
      out.push(html.slice(i, stop))
      i = stop
      continue
    }
    const m = /^<(\/?)([a-zA-Z][^\s/>]*)/.exec(html.slice(i, i + 64))
    if (!m) {
      out.push('&lt;')
      i++
      continue
    }
    const closing = m[1] === '/'
    const name = m[2].toLowerCase()
    // 讀到標籤結尾，略過引號內的 >
    let k = i + m[0].length
    const attrs: Array<{ name: string; raw: string; value: string }> = []
    while (k < len) {
      while (k < len && (/\s/.test(html[k]) || html[k] === '/')) k++
      if (k >= len || html[k] === '>') break
      const nameMatch = /^[^\s/>=]+/.exec(html.slice(k))
      const attrName = nameMatch ? nameMatch[0] : html[k]
      const start = k
      k += attrName.length
      let value = ''
      let j = k
      while (j < len && /\s/.test(html[j])) j++
      if (html[j] === '=') {
        j++
        while (j < len && /\s/.test(html[j])) j++
        const q = html[j]
        if (q === '"' || q === "'") {
          const end = html.indexOf(q, j + 1)
          const stop = end === -1 ? len : end
          value = html.slice(j + 1, stop)
          k = stop + 1
        } else {
          const um = /^[^\s>]*/.exec(html.slice(j))
          value = um ? um[0] : ''
          k = j + value.length
        }
      }
      attrs.push({ name: attrName, raw: html.slice(start, k), value: decodeEntities(value) })
    }
    const tagEnd = k < len ? k + 1 : len
    const selfClosing = html[k - 1] === '/'
    i = tagEnd
    if (DROP_ELEMENTS.has(name)) {
      // 丟棄的元素連內容一起跳過；內容當純文字找結束標籤（script 內容裡的 `<`、引號不能當標籤解析）。
      if (!closing && !selfClosing && !VOID_DROP_ELEMENTS.has(name)) {
        const em = new RegExp(`</${name}\\s*>`, 'i').exec(html.slice(i))
        i = em ? i + em.index + em[0].length : len
      }
      continue
    }
    if (closing) { out.push(`</${m[2]}>`); continue }
    const kept = attrs.filter((a) => !isDangerousAttr(a.name, a.value)).map((a) => ' ' + a.raw)
    out.push(`<${m[2]}${kept.join('')}${selfClosing ? ' /' : ''}>`)
    // <style>／<textarea>／<title> 的內容不是標籤，原樣搬過去。
    if (name === 'style' || name === 'textarea' || name === 'title') {
      const endRe = new RegExp(`</${name}\\s*>`, 'i')
      const rest = html.slice(i)
      const em = endRe.exec(rest)
      const stop = em ? i + em.index : len
      out.push(html.slice(i, stop))
      i = stop
    }
  }
  return out.join('')
}

/** 只解屬性值常見的實體，供判斷網址用（瀏覽器會先解實體再解析網址）。 */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n')
    .replace(/&amp;/gi, '&')
}

// ---------------------------------------------------------------------------
// 一鍵複製

function copyWithSelection(text: string, doc: Document): boolean {
  try {
    const area = doc.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    doc.body.appendChild(area)
    area.select()
    const ok = typeof doc.execCommand === 'function' && doc.execCommand('copy')
    area.remove()
    return !!ok
  } catch {
    return false
  }
}

/**
 * 面板裡帶 `data-panel-copy` 的元素（或它的子孫）被點時，把屬性值複製到剪貼簿；屬性為空就複製元素的文字。
 * 先用 navigator.clipboard，不能用（例如 iframe 沒有剪貼簿權限）就退回選取複製；成功才呼叫 notify(text)。
 * 回傳解除綁定的函式。
 */
export function bindPanelCopy(root: HTMLElement, notify: (text: string) => void): () => void {
  const onClick = (event: Event) => {
    const target = event.target as { closest?: unknown } | null
    if (!target || typeof target.closest !== 'function') return
    const el = (target as Element).closest('[data-panel-copy]')
    if (!el || !root.contains(el)) return
    const attr = el.getAttribute('data-panel-copy') ?? ''
    const text = attr || (el.textContent ?? '').trim()
    if (!text) return
    const doc = root.ownerDocument
    const fallback = () => { if (copyWithSelection(text, doc)) notify(text) }
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (clip && typeof clip.writeText === 'function') {
      try {
        Promise.resolve(clip.writeText(text)).then(() => notify(text), fallback)
      } catch {
        fallback()
      }
    } else {
      fallback()
    }
  }
  root.addEventListener('click', onClick)
  return () => root.removeEventListener('click', onClick)
}
