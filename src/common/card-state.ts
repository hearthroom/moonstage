/**
 * 卡片數值（card state）在遊玩畫布上的共用邏輯：一般頁（canvas.vue）與沙箱殼（sandbox/shell.ts）都用這一份，
 * 同一份歷史在兩種頁面算出一樣的現值、一樣的 state:change 序列、一樣的「更新於」那一行。
 *
 * 資料來源（伺服器）：
 * - 歷史的訊息列可能帶 `cardState`（這一輪記了數值的 AI 列，以及開場那一列 seq 0）。沒帶的列＝沿用前面最近的一份。
 * - 一輪跑完時的 operationStatus 也帶 `cardState`（串流中不帶）。
 * - 角色細節的 `state.data` 是開場前的初始值；`state.panel.template` 是作者寫的面板皮膚。
 *
 * 訊息 id：兩種頁面都用宿主的訊息 id（伺服器的 chatId）。一般頁的作者在 HUD／訊息上看到的就是它；
 * 沙箱卡的作者看到的 serverId 也是它（殼的 l1／h123 只在殼裡有效）。live 那一輪的氣泡先拿暫時 id，
 * 定稿後換成伺服器的 id——呼叫端用 cardStateMessageId 取「定稿後的那個」，事件才不會每輪整串重發。
 *
 * 純資料、零 DOM：兩種頁面與 node 測試都能直接跑。
 */

export interface CardStateChange {
  op: string
  path: string
  key?: string
  old?: unknown
  new?: unknown
  reason?: string
}

export interface CardStateSnapshot {
  data: unknown
  changes: CardStateChange[]
  /** 模型提了但沒被接受的變更；只有卡片作者拿得到。 */
  rejected?: unknown[]
  seq: number
  /** inline＝主回覆順帶輸出；agent＝獨立的變數計算；seed＝開場的初始值。 */
  source: string
}

/** 時間線的一列：每則訊息一列（有沒有數值都列，算「幾輪前」與 of() 要用）。 */
export interface CardStateRow {
  messageId: string
  role: 'ai' | 'user' | 'system'
  state?: CardStateSnapshot | null
}

/** state:change 的載荷，也是 state.get()／state.of() 的回傳值。 */
export interface CardStatePayload {
  /** 數值掛在哪一則訊息上；只有初始值（還沒有任何一則帶數值）時是 null。 */
  messageId: string | null
  data: unknown
  changes: CardStateChange[]
}

export type CardStateUpdate =
  | { kind: 'latest' }
  | { kind: 'ago'; n: number }
  | { kind: 'opening' }

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** 伺服器的 cardState → 內部格式；認不得就 null（當作這一列沒有數值）。 */
export function normalizeCardState(raw: unknown): CardStateSnapshot | null {
  if (!isObject(raw) || !('data' in raw)) return null
  const changes = Array.isArray(raw.changes)
    ? (raw.changes as unknown[]).filter((c): c is Record<string, unknown> => isObject(c) && typeof c.op === 'string' && typeof c.path === 'string').map((c) => {
      const out: CardStateChange = { op: String(c.op), path: String(c.path) }
      if (typeof c.key === 'string') out.key = c.key
      if ('old' in c) out.old = c.old
      if ('new' in c) out.new = c.new
      if (typeof c.reason === 'string') out.reason = c.reason
      return out
    })
    : []
  const seq = Number(raw.seq)
  const snapshot: CardStateSnapshot = {
    data: raw.data ?? null,
    changes,
    seq: Number.isFinite(seq) ? seq : 0,
    source: typeof raw.source === 'string' ? raw.source : '',
  }
  if (Array.isArray(raw.rejected)) snapshot.rejected = raw.rejected.slice()
  return snapshot
}

/** 初始值（角色細節的 state.data）當成一份「開場」快照；沒有就 null。 */
export function initialCardState(data: unknown): CardStateSnapshot | null {
  return data === undefined ? null : { data, changes: [], seq: 0, source: 'seed' }
}

/** 一則訊息在時間線上的 id：定稿後伺服器給的 id 優先，live 氣泡的暫時 id 墊底。 */
export function cardStateMessageId(item: { id?: unknown; chatId?: unknown; assistantChatId?: unknown }): string {
  const pick = (v: unknown) => (v === undefined || v === null || v === '' ? '' : String(v))
  return pick(item.assistantChatId) || pick(item.chatId) || pick(item.id)
}

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)))

export function payloadOf(messageId: string | null, state: CardStateSnapshot): CardStatePayload {
  return { messageId, data: clone(state.data), changes: clone(state.changes) }
}

/** 最後一則帶數值的列；沒有就 -1。 */
function lastSnapshotIndex(rows: CardStateRow[], upTo = rows.length - 1): number {
  for (let i = upTo; i >= 0; i--) if (rows[i].state) return i
  return -1
}

/** 現在生效的數值：最後一份快照，沒有就初始值，都沒有是 null。 */
export function currentCardState(rows: CardStateRow[], initial: CardStateSnapshot | null): { messageId: string | null; state: CardStateSnapshot } | null {
  const i = lastSnapshotIndex(rows)
  if (i >= 0) return { messageId: rows[i].messageId, state: rows[i].state as CardStateSnapshot }
  return initial ? { messageId: null, state: initial } : null
}

export function currentCardStatePayload(rows: CardStateRow[], initial: CardStateSnapshot | null): CardStatePayload | null {
  const cur = currentCardState(rows, initial)
  return cur ? payloadOf(cur.messageId, cur.state) : null
}

/**
 * 某則訊息當下生效的數值：它自己帶的那份，或它之前最近的一份，再沒有就初始值。
 * 不認得的 id 回 null（id 錯了不假裝有值）。
 */
export function cardStateAt(rows: CardStateRow[], messageId: string, initial: CardStateSnapshot | null): CardStatePayload | null {
  const index = rows.findIndex((r) => r.messageId === String(messageId))
  if (index < 0) return null
  const i = lastSnapshotIndex(rows, index)
  if (i >= 0) return payloadOf(rows[i].messageId, rows[i].state as CardStateSnapshot)
  return initial ? payloadOf(null, initial) : null
}

/**
 * 面板上「更新於」那一行：開場的值、最新一輪、或幾輪之前（數之後的 AI 回覆）。
 * 不用 seq：伺服器沒有承諾它是第幾輪；只往後數，載入更早的歷史不會讓數字變。
 */
export function cardStateUpdate(rows: CardStateRow[]): CardStateUpdate {
  const i = lastSnapshotIndex(rows)
  if (i < 0) return { kind: 'opening' }
  const state = rows[i].state as CardStateSnapshot
  if (state.source === 'seed' || state.seq === 0) return { kind: 'opening' }
  let n = 0
  for (let k = i + 1; k < rows.length; k++) if (rows[k].role === 'ai') n++
  return n === 0 ? { kind: 'latest' } : { kind: 'ago', n }
}

const keyOf = (row: CardStateRow) => `${row.messageId}\u0000${(row.state as CardStateSnapshot).seq}`

export interface CardStateFeed {
  /**
   * 時間線變了：回傳這次要發的 state:change（舊到新）。
   * - 上次發的最後一份還在：只發它之後新長出來的（新的一輪；載入更早的歷史不發）。
   * - 不在了（重寫、回溯、刪除、換存檔、整份重載後內容不同）：整條重發一次，最新的在最後。
   */
  update(rows: CardStateRow[]): CardStatePayload[]
  /** 最後發出的那一份（晚訂閱的補發用）。 */
  latest(): CardStatePayload | null
  /** 換對話：忘掉發過什麼。 */
  reset(): void
}

export function createCardStateFeed(): CardStateFeed {
  let lastKey: string | null = null
  let last: CardStatePayload | null = null
  return {
    update(rows) {
      const snaps = rows.filter((r) => !!r.state)
      if (!snaps.length) return []
      const at = lastKey == null ? -1 : snaps.findIndex((r) => keyOf(r) === lastKey)
      const out = (at >= 0 ? snaps.slice(at + 1) : snaps).map((r) => payloadOf(r.messageId, r.state as CardStateSnapshot))
      if (!out.length) return []
      lastKey = keyOf(snaps[snaps.length - 1])
      last = out[out.length - 1]
      return out
    },
    latest: () => (last ? clone(last) : null),
    reset() { lastKey = null; last = null },
  }
}

/** 介面字串裡的 {name} 換成值（兩種頁面同一套；一般頁由 i18n 給樣板，殼由宿主送來）。 */
export function fillLabel(template: string, vars: Record<string, string | number>): string {
  return String(template || '').replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
}
