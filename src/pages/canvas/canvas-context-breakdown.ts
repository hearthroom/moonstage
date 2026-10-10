import { contextUsageLevel, type ContextUsageLevel } from './canvas-context-usage'

/**
 * 「上下文用量」（舊名「這則回覆的組成」）——把伺服器回的 breakdownVersion=2 報告整理成彈窗要畫的形狀。
 *
 * 這份是 mobile 聊天頁那份（utils/prompt-breakdown.js，11 桶版）的搬運：桶的順序、
 * 顏色、MOD 明細的加總驗證、圓環的幾何都照搬，兩端看到的是同一件事。搬過來時
 * 拿掉了兩樣畫布用不到的：本機估算的退路（畫布沒有整份提示詞可以估，讀不到
 * 就老實說讀不到），以及焦點管理（CanvasPopup 的殼統一處理 ESC 與關閉）。
 *
 * ── 脫敏 ──
 * 伺服器的報告帶著 model／roleId／turnIndex 這些內部欄位；正規化只挑玩家該看的
 * 拿出來（估算 token、字元、百分比、快取命中率、本輪點數、MOD 明細），其餘
 * 一律不進結果，畫面上想露也露不出來。conversationId 留著做「換了對話就作廢」的閘。
 */

export type PromptBreakdownKey =
  | 'system'
  | 'roleCard'
  | 'mod'
  | 'notepad'
  | 'directive'
  | 'userProfile'
  | 'summary'
  | 'history'
  | 'worldbook'
  | 'memory'
  | 'currentInput'

export interface PromptUsageValue {
  charCount: number
  estimatedTokens: number
}

export interface PromptUsagePositions {
  mainPrompt: PromptUsageValue
  prefixRules: PromptUsageValue
  suffixRules: PromptUsageValue
}

export interface PromptModUsageDetail {
  modId: string
  enabledVersion: string
  name: string
  nameEn: string
  nameJa: string
  nameKo: string
  charCount: number
  estimatedTokens: number
  percent: number
  positions: PromptUsagePositions
  runtimeSupport: PromptUsageValue
  sharedOverhead: PromptUsageValue
}

export interface PromptBreakdownItem {
  key: PromptBreakdownKey
  labelKey: string
  color: string
  available: boolean
  sourceCount: number
  charCount: number
  estimatedTokens: number
  percent: number
  detailsAvailable: boolean
  detailsUnavailableReason: string
  totalDetailCount: number
  details: PromptModUsageDetail[]
  positions: PromptUsagePositions
  runtimeSupport: PromptUsageValue
  sharedOverhead: PromptUsageValue
}

export interface PromptBreakdownBilling {
  componentsAvailable?: boolean
  available: boolean
  totalPoints: number
  inputPoints: number
  cacheReadPoints: number
  outputPoints: number
  cacheHitRate: number | null
}

export interface PromptBreakdownCache {
  available: boolean
  hitRate: number | null
  inputTokens: number
  readTokens: number
  writeTokens: number
}

/**
 * 這段對話的上下文用到哪裡了，跟伺服器的記憶整理同一把尺：用量、玩家選的容量、
 * 從哪裡開始把較早的劇情濃縮成摘要，以及照最近幾輪的速度大約還剩幾輪。
 * 沒有容量可比的供應商（LunaTalk、按位元組計的模型、舊回合）available 是 false。
 */
export interface PromptContextWindow {
  available: boolean
  usedTokens: number
  limitTokens: number
  compactAtTokens: number
  percent: number
  /** 只有最新一輪、而且最近至少兩輪在變長時才有 */
  turnsLeft: number | null
}

export interface PromptBreakdownReport {
  chatId?: string
  schemaVersion?: number
  supported: boolean
  /** ok／notReady／unsupportedModel */
  status: string
  conversationId: string
  items: PromptBreakdownItem[]
  total: PromptUsageValue
  cache: PromptBreakdownCache
  billing: PromptBreakdownBilling
  window: PromptContextWindow
}

export const BREAKDOWN_META: Array<Pick<PromptBreakdownItem, 'key' | 'labelKey' | 'color'>> = [
  { key: 'system', labelKey: 'promptBreakdown.system', color: '#60A5FA' },
  { key: 'roleCard', labelKey: 'promptBreakdown.roleCard', color: '#F5C542' },
  { key: 'mod', labelKey: 'promptBreakdown.mod', color: '#465CFF' },
  { key: 'notepad', labelKey: 'promptBreakdown.notepad', color: '#84CC16' },
  { key: 'directive', labelKey: 'promptBreakdown.directive', color: '#DB2777' },
  { key: 'userProfile', labelKey: 'promptBreakdown.userProfile', color: '#34D399' },
  { key: 'summary', labelKey: 'promptBreakdown.summary', color: '#A78BFA' },
  { key: 'history', labelKey: 'promptBreakdown.history', color: '#FB7185' },
  { key: 'worldbook', labelKey: 'promptBreakdown.worldbook', color: '#22D3EE' },
  { key: 'memory', labelKey: 'promptBreakdown.memory', color: '#F97316' },
  { key: 'currentInput', labelKey: 'promptBreakdown.currentInput', color: '#C084FC' },
]

// ── 請求閘 ────────────────────────────────────────────────────────────
//
// 同一段對話的請求進行中不再發第二次；換了對話就把舊的作廢，晚到的回覆不會
// 蓋到新對話的畫面上。

export interface PromptDiagnosticsRequestToken {
  generation: number
  conversationId: string
}

export function createPromptDiagnosticsRequestGate() {
  let generation = 0
  let activeConversationId = ''

  const isCurrent = (token: PromptDiagnosticsRequestToken | null | undefined) => !!token &&
    token.generation === generation &&
    token.conversationId === activeConversationId

  return {
    begin(conversationId: unknown): PromptDiagnosticsRequestToken | null {
      const normalized = String(conversationId || '').trim()
      if (!normalized || activeConversationId === normalized) return null
      generation += 1
      activeConversationId = normalized
      return { generation, conversationId: normalized }
    },
    invalidate() {
      generation += 1
      activeConversationId = ''
    },
    isCurrent,
    finish(token: PromptDiagnosticsRequestToken | null | undefined): boolean {
      if (!isCurrent(token)) return false
      activeConversationId = ''
      return true
    },
  }
}

// ── 正規化 ────────────────────────────────────────────────────────────

function cleanText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** 命中率給人看的寫法：小數一位，整數不帶小數；沒有資料時是「--」。 */
export function formatHitRate(value: number | null | undefined): string {
  const n = Number(value)
  if (value == null || !Number.isFinite(n)) return '--'
  return String(Math.round(n * 10) / 10)
}

function compactNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

const MOD_DETAILS_UNAVAILABLE_REASONS = new Set([
  '',
  'legacy_snapshot',
  'projection_error',
  'runtime_missing',
  'invalid_detail',
  'reconcile_error',
  'size_guard',
])

function emptyUsageValue(): PromptUsageValue {
  return { charCount: 0, estimatedTokens: 0 }
}

function emptyUsagePositions(): PromptUsagePositions {
  return { mainPrompt: emptyUsageValue(), prefixRules: emptyUsageValue(), suffixRules: emptyUsageValue() }
}

function normalizeUsageValue(value: any): PromptUsageValue | null {
  if (!value || typeof value !== 'object') return null
  const charCount = nonNegativeNumber(value.charCount)
  const estimatedTokens = nonNegativeNumber(value.estimatedTokens)
  if (charCount == null || estimatedTokens == null) return null
  return { charCount, estimatedTokens }
}

function normalizeUsagePositions(value: any): PromptUsagePositions | null {
  if (!value || typeof value !== 'object') return null
  const mainPrompt = normalizeUsageValue(value.mainPrompt)
  const prefixRules = normalizeUsageValue(value.prefixRules)
  const suffixRules = normalizeUsageValue(value.suffixRules)
  if (!mainPrompt || !prefixRules || !suffixRules) return null
  return { mainPrompt, prefixRules, suffixRules }
}

function sumUsageValues(values: PromptUsageValue[]): PromptUsageValue {
  return values.reduce((sum, value) => ({
    charCount: sum.charCount + value.charCount,
    estimatedTokens: sum.estimatedTokens + value.estimatedTokens,
  }), emptyUsageValue())
}

function sameUsageValue(left: PromptUsageValue, right: PromptUsageValue): boolean {
  return left.charCount === right.charCount && left.estimatedTokens === right.estimatedTokens
}

function normalizeModDetail(value: any): PromptModUsageDetail | null {
  if (!value || typeof value !== 'object') return null
  const modId = cleanText(value.modId)
  const enabledVersion = cleanText(value.enabledVersion)
  const charCount = nonNegativeNumber(value.charCount)
  const estimatedTokens = nonNegativeNumber(value.estimatedTokens)
  const percent = nonNegativeNumber(value.percent)
  const positions = normalizeUsagePositions(value.positions)
  const runtimeSupport = normalizeUsageValue(value.runtimeSupport)
  const sharedOverhead = normalizeUsageValue(value.sharedOverhead)
  if (!modId || !enabledVersion || charCount == null || estimatedTokens == null || percent == null || percent > 100 ||
    !positions || !runtimeSupport || !sharedOverhead) {
    return null
  }
  const attributed = sumUsageValues([
    positions.mainPrompt, positions.prefixRules, positions.suffixRules, runtimeSupport, sharedOverhead,
  ])
  if (attributed.charCount !== charCount || attributed.estimatedTokens !== estimatedTokens) return null
  return {
    modId,
    enabledVersion,
    name: cleanText(value.name),
    nameEn: cleanText(value.nameEn),
    nameJa: cleanText(value.nameJa),
    nameKo: cleanText(value.nameKo),
    charCount,
    estimatedTokens,
    percent,
    positions,
    runtimeSupport,
    sharedOverhead,
  }
}

function normalizeModDetailsUnavailableReason(value: unknown): string {
  const reason = cleanText(value)
  return MOD_DETAILS_UNAVAILABLE_REASONS.has(reason) ? reason : ''
}

function emptyModFields() {
  return {
    detailsAvailable: false,
    detailsUnavailableReason: '',
    totalDetailCount: 0,
    details: [] as PromptModUsageDetail[],
    positions: emptyUsagePositions(),
    runtimeSupport: emptyUsageValue(),
    sharedOverhead: emptyUsageValue(),
  }
}

/**
 * MOD 那一桶多帶一份明細。明細只有在每一個數字都對得上總數時才放出來——
 * 加總對不上代表伺服器那邊投影有問題，畫出來玩家只會拿它跟總數比然後覺得壞了。
 */
function normalizeModItem(source: any, supported: boolean, isV2: boolean): PromptBreakdownItem {
  const meta = BREAKDOWN_META.find((item) => item.key === 'mod')!
  if (!isV2 || !source || typeof source !== 'object') {
    return { ...meta, available: false, sourceCount: 0, charCount: 0, estimatedTokens: 0, percent: 0, ...emptyModFields() }
  }
  const charCount = nonNegativeNumber(source.charCount)
  const estimatedTokens = nonNegativeNumber(source.estimatedTokens)
  const sourceCount = nonNegativeNumber(source.sourceCount)
  const totalDetailCount = nonNegativeNumber(source.totalDetailCount)
  const positions = normalizeUsagePositions(source.positions)
  const runtimeSupport = normalizeUsageValue(source.runtimeSupport)
  const sharedOverhead = normalizeUsageValue(source.sharedOverhead)
  const item: PromptBreakdownItem = {
    ...meta,
    available: supported && source.available !== false,
    sourceCount: sourceCount == null ? 0 : sourceCount,
    charCount: charCount == null ? 0 : charCount,
    estimatedTokens: supported && estimatedTokens != null ? estimatedTokens : 0,
    percent: supported ? compactNumber(source.percent) : 0,
    ...emptyModFields(),
    totalDetailCount: totalDetailCount == null ? 0 : totalDetailCount,
    positions: positions || emptyUsagePositions(),
    runtimeSupport: runtimeSupport || emptyUsageValue(),
    sharedOverhead: sharedOverhead || emptyUsageValue(),
  }
  if (!supported || !item.available || source.detailsAvailable !== true) {
    item.detailsUnavailableReason = normalizeModDetailsUnavailableReason(source.detailsUnavailableReason)
    return item
  }
  const rawDetails: unknown[] = Array.isArray(source.details) ? source.details : []
  const details = rawDetails.map(normalizeModDetail)
  const valid = details.every(Boolean) as boolean
  const checked = details as PromptModUsageDetail[]
  const detailsAreValid = Array.isArray(source.details) && details.length === source.details.length && valid &&
    sourceCount != null && totalDetailCount != null &&
    sourceCount === checked.length && totalDetailCount === checked.length &&
    charCount != null && estimatedTokens != null && positions && runtimeSupport && sharedOverhead &&
    sumUsageValues(checked).charCount === charCount &&
    sumUsageValues(checked).estimatedTokens === estimatedTokens &&
    sameUsageValue(sumUsageValues(checked.map((d) => d.positions.mainPrompt)), positions.mainPrompt) &&
    sameUsageValue(sumUsageValues(checked.map((d) => d.positions.prefixRules)), positions.prefixRules) &&
    sameUsageValue(sumUsageValues(checked.map((d) => d.positions.suffixRules)), positions.suffixRules) &&
    sameUsageValue(sumUsageValues(checked.map((d) => d.runtimeSupport)), runtimeSupport) &&
    sameUsageValue(sumUsageValues(checked.map((d) => d.sharedOverhead)), sharedOverhead) &&
    (estimatedTokens === 0
      ? checked.every((d) => d.percent === 0)
      : checked.reduce((sum, d) => sum + d.percent, 0) === 100)
  if (!detailsAreValid) {
    item.sourceCount = 0
    item.detailsUnavailableReason = 'invalid_detail'
    return item
  }
  item.detailsAvailable = true
  item.details = checked
  return item
}

export function promptBreakdownModDisplayName(
  detail: Pick<PromptModUsageDetail, 'modId' | 'name' | 'nameEn' | 'nameJa' | 'nameKo'>,
  locale: unknown,
): string {
  const language = cleanText(locale).toLowerCase()
  if (language.startsWith('en') && detail.nameEn) return detail.nameEn
  if (language.startsWith('ja') && detail.nameJa) return detail.nameJa
  if (language.startsWith('ko') && detail.nameKo) return detail.nameKo
  return detail.name || detail.modId
}

function normalizeServerCache(cache: any): PromptBreakdownCache {
  if (!cache || typeof cache !== 'object') {
    return { available: false, hitRate: null, inputTokens: 0, readTokens: 0, writeTokens: 0 }
  }
  const inputTokens = compactNumber(cache.inputTokens)
  const readTokens = compactNumber(cache.readTokens)
  const writeTokens = compactNumber(cache.writeTokens)
  const available = cache.available === true || inputTokens > 0 || readTokens > 0 || writeTokens > 0
  const hitRateValue = Number(cache.hitRate)
  return {
    available,
    hitRate: available && cache.hitRate != null && Number.isFinite(hitRateValue) ? hitRateValue : null,
    inputTokens,
    readTokens,
    writeTokens,
  }
}

function emptyBilling(): PromptBreakdownBilling {
  return { available: false, totalPoints: 0, inputPoints: 0, cacheReadPoints: 0, outputPoints: 0, cacheHitRate: null }
}

function normalizeServerBilling(billing: any): PromptBreakdownBilling {
  if (!billing || typeof billing !== 'object') return emptyBilling()
  const totalPoints = compactNumber(billing.totalPoints)
  const inputPoints = compactNumber(billing.inputPoints)
  const cacheReadPoints = compactNumber(billing.cacheReadPoints)
  const outputPoints = compactNumber(billing.outputPoints)
  const hitRateValue = Number(billing.cacheHitRate)
  const available = billing.available === true || totalPoints > 0 || inputPoints > 0 || cacheReadPoints > 0 || outputPoints > 0
  return {
    available,
    totalPoints: available ? totalPoints : 0,
    componentsAvailable: billing.componentsAvailable !== false,
    inputPoints: available ? inputPoints : 0,
    cacheReadPoints: available ? cacheReadPoints : 0,
    outputPoints: available ? outputPoints : 0,
    cacheHitRate: available && billing.cacheHitRate != null && Number.isFinite(hitRateValue) ? hitRateValue : null,
  }
}

/** 伺服器沒給百分比時自己分：最大餘數法，加總剛好 100。 */
function applyPercents(items: PromptBreakdownItem[]): PromptBreakdownItem[] {
  const totalTokens = items.reduce((sum, item) => sum + item.estimatedTokens, 0)
  if (totalTokens <= 0) return items.map((item) => ({ ...item, percent: 0 }))
  const withFractions = items.map((item, index) => {
    const raw = item.estimatedTokens / totalTokens * 100
    const base = Math.floor(raw)
    return { index, base, fraction: raw - base }
  })
  let remaining = 100 - withFractions.reduce((sum, item) => sum + item.base, 0)
  withFractions
    .slice()
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach((item) => {
      if (remaining > 0) {
        item.base += 1
        remaining -= 1
      }
    })
  const percentByIndex = new Map(withFractions.map((item) => [item.index, item.base]))
  return items.map((item, index) => ({ ...item, percent: percentByIndex.get(index) || 0 }))
}

const NO_WINDOW: PromptContextWindow = { available: false, usedTokens: 0, limitTokens: 0, compactAtTokens: 0, percent: 0, turnsLeft: null }

function normalizeServerWindow(window: any): PromptContextWindow {
  if (!window || typeof window !== 'object' || window.available !== true) return NO_WINDOW
  const used = nonNegativeNumber(window.usedTokens)
  const limit = nonNegativeNumber(window.limitTokens)
  const compactAt = nonNegativeNumber(window.compactAtTokens)
  if (used == null || !limit || compactAt == null || compactAt > limit) return NO_WINDOW
  const turnsLeft = nonNegativeNumber(window.turnsLeft)
  return {
    available: true,
    usedTokens: used,
    limitTokens: limit,
    compactAtTokens: compactAt,
    percent: Math.min(100, Math.floor(used * 100 / limit)),
    turnsLeft: turnsLeft == null ? null : Math.floor(turnsLeft),
  }
}

export function normalizeServerReport(report: any): PromptBreakdownReport | null {
  if (!report || typeof report !== 'object' || !Array.isArray(report.items)) return null
  const supported = report.supported !== false
  const status = cleanText(report.status) || (supported ? 'ok' : 'unsupportedModel')
  const isV2 = report.schemaVersion === 2
  const sourceByKey = new Map<string, any>(report.items.map((item: any) => [cleanText(item && item.key), item || {}]))
  const items: PromptBreakdownItem[] = BREAKDOWN_META.map((meta) => {
    if (meta.key === 'mod') return normalizeModItem(sourceByKey.get('mod'), supported, isV2)
    const source = sourceByKey.get(meta.key) || {}
    return {
      ...meta,
      available: supported && source.available !== false,
      sourceCount: compactNumber(source.sourceCount),
      charCount: compactNumber(source.charCount),
      estimatedTokens: supported ? compactNumber(source.estimatedTokens) : 0,
      percent: supported ? compactNumber(source.percent) : 0,
      ...emptyModFields(),
    }
  })
  const total: PromptUsageValue = {
    charCount: compactNumber(report.total && report.total.charCount),
    estimatedTokens: supported ? compactNumber(report.total && report.total.estimatedTokens) : 0,
  }
  if (supported && total.estimatedTokens <= 0) {
    total.estimatedTokens = items.reduce((sum, item) => sum + item.estimatedTokens, 0)
    total.charCount = items.reduce((sum, item) => sum + item.charCount, 0)
  }
  const normalizedItems = supported && items.reduce((sum, item) => sum + item.percent, 0) === 0
    ? applyPercents(items)
    : items
  return {
    schemaVersion: isV2 ? 2 : undefined,
    supported,
    status,
    conversationId: cleanText(report.conversationId),
    chatId: cleanText(report.chatId),
    items: normalizedItems,
    total,
    cache: normalizeServerCache(report.cache),
    billing: normalizeServerBilling(report.billing),
    window: supported ? normalizeServerWindow(report.window) : NO_WINDOW,
  }
}

// ── 沒有 MOD 的供應商 ─────────────────────────────────────────────────
//
// 同一份舞台同時接 LunaTalk（有 MOD）與 HarperHarbor（沒有 MOD），而宿主沒有告訴
// 舞台接的是哪一家——能判斷的只有報告本身。HarperHarbor 的第 2 版報告仍然帶著 mod
// 這一桶，但永遠是 0 字、不可用、沒有明細；照畫的話玩家會看到一列「MOD／暫無資料」
// 和「變更 MOD 後⋯⋯」的副標，講的是這一家根本沒有的東西。
// 所以：MOD 那桶有 token 或有明細才算「這一家有 MOD」，否則那一列與 MOD 相關的字都收起來。

/** 這份報告裡有沒有可講的 MOD 用量（沒有就代表這家供應商沒有 MOD，或這一輪沒用到）。 */
export function promptBreakdownHasModData(report: Pick<PromptBreakdownReport, 'items'> | null | undefined): boolean {
  const mod = report && Array.isArray(report.items) ? report.items.find((item) => item && item.key === 'mod') : null
  return !!(mod && mod.available !== false && (
    Number(mod.estimatedTokens) > 0 ||
    (mod.detailsAvailable && Array.isArray(mod.details) && mod.details.length > 0)
  ))
}

/** 列表要畫的桶：MOD 那桶沒有資料就不列，其餘照伺服器的固定順序全列。 */
export function visiblePromptBreakdownItems(items: PromptBreakdownItem[] | null | undefined): PromptBreakdownItem[] {
  const list = Array.isArray(items) ? items : []
  return promptBreakdownHasModData({ items: list }) ? list : list.filter((item) => item && item.key !== 'mod')
}

// ── 用量條 ────────────────────────────────────────────────────────────
//
// 面板上那一條：有容量可比時（window.available）每一段的寬度與百分比都是「占容量幾成」，
// 後面接著剩餘空間，條上畫一條線標出從哪裡開始濃縮舊劇情；沒有容量可比時退回
// 「占這次提示詞幾成」，不畫剩餘空間也不畫線。
//
// 各段的 token 是伺服器按字元把整份請求的計數分下去的；有容量時再換成記憶整理用的
// 那把尺（window.usedTokens／total.estimatedTokens），各段加起來就是條上的用量。

export interface PromptUsageRow {
  key: PromptBreakdownKey
  color: string
  tokens: number
  /** 占容量（或沒有容量時占這次提示詞）的百分比，整數 */
  percent: number
  /** 條上的寬度，0–100 */
  width: number
}

export interface PromptUsageView {
  hasWindow: boolean
  usedTokens: number
  limitTokens: number
  percent: number
  /** 濃縮線在條上的位置，0–100；沒有容量時 null */
  compactAt: number | null
  freeTokens: number
  freePercent: number
  turnsLeft: number | null
  /** 已經到了濃縮線：下一輪會先整理較早的劇情 */
  condensing: boolean
  rows: PromptUsageRow[]
}

export function promptUsageView(report: PromptBreakdownReport | null | undefined): PromptUsageView | null {
  if (!report || report.supported === false || report.status !== 'ok') return null
  const items = visiblePromptBreakdownItems(report.items).filter((item) => item.available !== false && item.estimatedTokens > 0)
  const total = report.total.estimatedTokens || items.reduce((sum, item) => sum + item.estimatedTokens, 0)
  const w = report.window
  if (w && w.available) {
    const scale = total > 0 ? w.usedTokens / total : 0
    const rows = items.map((item) => {
      const tokens = Math.round(item.estimatedTokens * scale)
      return { key: item.key, color: item.color, tokens, percent: Math.round(tokens * 100 / w.limitTokens), width: Math.min(100, tokens * 100 / w.limitTokens) }
    })
    const free = Math.max(0, w.limitTokens - w.usedTokens)
    return {
      hasWindow: true,
      usedTokens: w.usedTokens,
      limitTokens: w.limitTokens,
      percent: w.percent,
      compactAt: w.compactAtTokens * 100 / w.limitTokens,
      freeTokens: free,
      freePercent: Math.max(0, 100 - w.percent),
      turnsLeft: w.turnsLeft,
      condensing: w.usedTokens >= w.compactAtTokens,
      rows,
    }
  }
  if (total <= 0) return null
  return {
    hasWindow: false,
    usedTokens: total,
    limitTokens: 0,
    percent: 0,
    compactAt: null,
    freeTokens: 0,
    freePercent: 0,
    turnsLeft: null,
    condensing: false,
    rows: items.map((item) => ({ key: item.key, color: item.color, tokens: item.estimatedTokens, percent: item.percent, width: item.estimatedTokens * 100 / total })),
  }
}

/** 輸入框旁那顆小圓環：只在有容量可比時畫，等級門檻跟記憶整理同一條線。 */
export function contextRingFromReport(report: PromptBreakdownReport | null | undefined): { percent: number; level: ContextUsageLevel } | null {
  const w = report && report.status === 'ok' ? report.window : null
  if (!w || !w.available) return null
  return { percent: w.percent, level: contextUsageLevel(w.percent, w.compactAtTokens * 100 / w.limitTokens) }
}

/** token 數給人看的寫法：1,000 以下照寫，以上用 k、M，一位小數（23.5k、1M）。 */
export function formatTokenCount(value: unknown): string {
  const n = Math.max(0, Number(value) || 0)
  const short = (v: number, unit: string) => `${Number.parseFloat(v.toFixed(1))}${unit}`
  if (n >= 999950) return short(n / 1000000, 'M')
  if (n >= 1000) return short(n / 1000, 'k')
  return String(Math.round(n))
}

export function formatPromptNumber(value: unknown): string {
  return (Number(value) || 0).toLocaleString('en-US')
}
