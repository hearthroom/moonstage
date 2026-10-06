/**
 * 原生區塊：模型在回覆末尾寫的 `[status]…[/status]` 與 `[choices]…[/choices]`，卡片沒有用自己的規則吃掉時，
 * 由平台畫成面板與按鈕——零卡片腳本。作者把力氣花在劇情上，通用的那一層由平台扛（hearthroom/skills 的
 * sandbox kit 是這裡的原型；它的規則先吃掉標記，所以帶 kit 的卡不會被這一層重畫）。
 *
 * 位置：顯示規則之後、Markdown 之前，兩條渲染路徑（殼自畫、宿主畫布）同一個函式。只對 AI 訊息。
 *
 * 容錯：閉合標記可缺（吃到正文結尾或下一個區塊為止）；全形標點折半形；`;;` 也當換行；沒冒號的行當文字；
 * 值的形狀決定畫法（數字／百分比與 a/b 進度條／`名|a/b` 等級／`k:v|k:v` 列表／`k:v k:v` 屬性／`名=數` 實體／
 * 逗號標籤／`a > b` 路徑／其餘文字），形狀不完整一律退回文字——畫錯一行字比畫壞一個控件好。
 * 產物只有標準標籤與 class：作者 CSS（不分層）可以整個蓋掉；按鈕沒有 inline handler，點擊由宿主委派處理，
 * 而且只是填進輸入框（選項是草稿不是鐵軌）。
 */

const MAX_VALUE = 200
const MAX_ITEMS = 24
const MAX_CHOICES = 8

const FULL_WIDTH: Record<string, string> = { '：': ':', '，': ',', '、': ',', '＝': '=', '／': '/', '％': '%', '－': '-', '｜': '|', '＞': '>', '　': ' ' }

function norm(s: string): string {
  return String(s)
    .replace(/[：，、＝／％－｜＞　]/g, (c) => FULL_WIDTH[c])
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
}
function num(s: string): number | null {
  const t = String(s).trim()
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null
  const v = parseFloat(t)
  return Number.isFinite(v) ? v : null
}
function cut(s: string): string { const t = String(s).trim(); return t.length > MAX_VALUE ? t.slice(0, MAX_VALUE) : t }
function splitList(s: string): string[] {
  const out: string[] = []
  for (const part of String(s).split(',')) { const t = part.trim(); if (t) out.push(t) }
  return out.length > MAX_ITEMS ? out.slice(0, MAX_ITEMS) : out
}
function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

type Pair = { value: number; max: number }
type Item = { name: string; value: string; note: string }

function pair(s: string): Pair | null {
  const a = String(s).split('/')
  if (a.length !== 2) return null
  const x = num(a[0]), y = num(a[1])
  return x === null || y === null ? null : { value: x, max: y }
}
function pairs(items: string[], min = 2): Item[] | null {
  if (items.length < min) return null
  const out: Item[] = []
  for (const raw of items) {
    const t = raw.trim()
    if (!t) return null
    const ci = t.indexOf(':')
    if (ci <= 0 || ci === t.length - 1) return null
    const name = t.slice(0, ci).trim()
    const rest = t.slice(ci + 1)
    const ni = rest.indexOf(':')
    const value = (ni >= 0 ? rest.slice(0, ni) : rest).trim()
    const note = ni >= 0 ? rest.slice(ni + 1).trim() : ''
    if (!name || !value) return null
    out.push({ name, value, note })
    if (out.length >= MAX_ITEMS) break
  }
  return out.length ? out : null
}
function toLevel(t: string): { name: string; value: number; max: number } | null {
  const i = t.indexOf('|')
  if (i < 0) return null
  const name = t.slice(0, i).trim(), b = pair(t.slice(i + 1).trim())
  return name && b ? { name, value: b.value, max: b.max } : null
}
function toStats(t: string): Item[] | null {
  if (t.includes('|')) return null
  let a = splitList(t)
  if (a.length < 2) a = t.split(/\s+/)
  return pairs(a)
}
function toKvlist(t: string): Item[] | null {
  if (!t.includes('|')) return null
  return pairs(t.split('|'))
}
function toPath(t: string): string[] | null {
  if (!/[>›→]/.test(t)) return null
  const a = t.split(/\s*[>›→]\s*/)
  if (a.length < 2 || a.some((s) => !s.trim())) return null
  return a.map((s) => s.trim()).slice(0, MAX_ITEMS)
}

function pct(v: number, max: number): string {
  if (!max || !Number.isFinite(v)) return '0'
  return Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1)
}
const bar = (v: number, max: number) => `<span class="lt-bar"><span class="lt-bar__fill" style="width:${pct(v, max)}%"></span></span>`
const chips = (list: string[]) => `<span class="lt-chips">${list.map((x) => `<span class="lt-chip">${esc(x)}</span>`).join('')}</span>`

/** 一個值 → 顯示用的 HTML。判定順序即優先級；每一檔都要整個值合形，否則退回文字。 */
export function drawValue(raw: string): string {
  const t = cut(norm(raw))
  if (!t) return ''
  const n = num(t)
  if (n !== null) return `<span class="lt-num">${esc(t)}</span>`
  const pc = /^([+-]?[\d.]+)\s*%$/.exec(t)
  if (pc && num(pc[1]) !== null) return `${bar(num(pc[1]) as number, 100)}<span class="lt-num">${esc(t)}</span>`
  const ab = pair(t)
  if (ab) return `${bar(ab.value, ab.max)}<span class="lt-num">${esc(t)}</span>`
  const lv = toLevel(t)
  if (lv) return `<b class="lt-level">${esc(lv.name)}</b>${bar(lv.value, lv.max)}<span class="lt-num">${esc(`${lv.value}/${lv.max}`)}</span>`
  const kv = toKvlist(t)
  if (kv) return `<span class="lt-kvlist">${kv.map((i) => `<span class="lt-kv"><span class="lt-kv__k">${esc(i.name)}</span><span class="lt-kv__v">${esc(i.value)}</span>${i.note ? `<span class="lt-note">${esc(i.note)}</span>` : ''}</span>`).join('')}</span>`
  const st = toStats(t)
  if (st) return `<span class="lt-stats">${st.map((i) => `<span class="lt-stat"><span class="lt-stat__k">${esc(i.name)}</span><span class="lt-stat__v">${esc(i.value)}</span>${i.note ? `<span class="lt-note">${esc(i.note)}</span>` : ''}</span>`).join('')}</span>`
  const items = splitList(t)
  const ents: Array<{ name: string; value: number }> = []
  let plain = 0
  for (const item of items) {
    const m = /^([\s\S]+?)\s*=\s*([\s\S]+)$/.exec(item)
    const v = m ? num(m[2]) : null
    if (m && v !== null) ents.push({ name: m[1].trim(), value: v }); else plain++
  }
  if (ents.length && ents.length >= plain) return `<span class="lt-chips">${ents.map((e) => `<span class="lt-chip lt-chip--kv"><span class="lt-chip__k">${esc(e.name)}</span><span class="lt-chip__v">${esc(String(e.value))}</span></span>`).join('')}</span>`
  if (items.length > 1) return chips(items)
  const ph = toPath(t)
  if (ph) return `<span class="lt-path">${ph.map((s) => esc(s)).join('<span class="lt-path__sep">›</span>')}</span>`
  return `<span class="lt-text">${esc(t)}</span>`
}

/** 區塊體 → 狀態面板。一行一個 `key: value`（`;;` 也當分隔）；沒冒號的行照文字留著。 */
export function drawStatusBody(body: string): string {
  const rows: string[] = []
  for (const line of String(body).split(/\r?\n|;;/)) {
    let t = norm(line).trim()
    if (!t) continue
    t = t.replace(/^[-*+•]\s+/, '')
    const ci = t.indexOf(':')
    if (ci <= 0) { rows.push(`<div class="lt-status__row lt-status__row--text">${esc(t)}</div>`); continue }
    const key = t.slice(0, ci).trim().replace(/^[*_`#]+|[*_`#]+$/g, '').trim().slice(0, 40)
    let rest = t.slice(ci + 1)
    if (rest.charAt(0) === ':') rest = rest.slice(1)
    if (!key) { rows.push(`<div class="lt-status__row lt-status__row--text">${esc(t)}</div>`); continue }
    rows.push(`<div class="lt-status__row"><span class="lt-status__k">${esc(key)}</span><span class="lt-status__v">${drawValue(rest)}</span></div>`)
  }
  return rows.length ? `<div class="lt-status">${rows.join('')}</div>` : ''
}

/** 選項體 → 按鈕；條列符號與編號剝掉，最多八個，末尾一顆「✎ 自己寫」。 */
export function drawChoicesBody(body: string): string {
  const out: string[] = []
  for (const line of String(body).split(/\r?\n/)) {
    const t = norm(line).trim().replace(/^(?:[-*+•]|\d+[.)]|[①-⑳])\s*/, '').trim()
    if (t) out.push(cut(t))
    if (out.length >= MAX_CHOICES) break
  }
  if (!out.length) return ''
  return `<div class="lt-choices">${out.map((o) => `<button type="button" class="lt-choice">${esc(o)}</button>`).join('')}<button type="button" class="lt-choice lt-choice--own">✎</button></div>`
}

// 閉合可缺：吃到另一個區塊的開頭或正文結尾。開標記必填，所以永遠不會匹配空字串。
const STATUS_RE = /\[status\]([\s\S]*?)(?:\[\/status\]|(?=\[choices\])|$)/gi
const CHOICES_RE = /\[choices\]([\s\S]*?)(?:\[\/choices\]|(?=\[status\]|<div class="lt-status")|$)/gi

/** 畫出內容裡還留著的原生區塊；沒有區塊就原樣回傳（最常見的路徑，零成本）。 */
export function drawNativeBlocks(text: string): string {
  const s = String(text == null ? '' : text)
  if (s.indexOf('[status]') < 0 && s.indexOf('[choices]') < 0) return s
  return s.replace(STATUS_RE, (_m, body: string) => drawStatusBody(body)).replace(CHOICES_RE, (_m, body: string) => drawChoicesBody(body))
}

export const NATIVE_BLOCKS = { status: 'status', choices: 'choices', classes: ['lt-status', 'lt-status__row', 'lt-status__k', 'lt-status__v', 'lt-bar', 'lt-bar__fill', 'lt-chips', 'lt-chip', 'lt-kvlist', 'lt-stats', 'lt-path', 'lt-level', 'lt-choices', 'lt-choice', 'lt-choice--own'] } as const
