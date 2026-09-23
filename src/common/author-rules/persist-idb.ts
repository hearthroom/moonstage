/**
 * 作者規則定稿結果的持久層（IndexedDB）：重整、回訪時直接拿，不必在 worker 裡重跑一次。
 *
 * 為什麼：規則有災難性回溯的卡，每次重整都要重跑全部歷史（2026-09-23 正式站：13 則歷史、最新那則約 87 秒
 * 才套上樣式）。同一份輸入的套用結果就是同一份，存起來重用不改語意；鍵含引擎版本（見 engine-version.ts），
 * 引擎一改就自然不命中。
 *
 * 兩個物件庫：
 *   entries  鍵 → { p, text, html, rollbacks }（大的那份，只在命中時讀）
 *   meta     { k, at, size }，at 上有索引——淘汰只掃這份小的，不必把所有 html 讀出來。
 * 上限：筆數與字元數（先到先算），最久沒用的先丟；單筆太大的不存。淘汰在寫入後延遲批次做。
 *
 * 儲存隨時可能不能用（私密模式、沙箱 iframe 的不透明源、被使用者停用、配額滿、別的分頁卡著升級）：
 * 每個呼叫都包 try/catch，開不起來就整個停用——排程器照樣只用記憶體快取，行為跟沒有持久層一樣。
 *
 * 帳號範圍（隱私）：內容是聊天原文與套完的 HTML，同一台裝置可能換人用。
 *   - 沒有範圍（沒登入、宿主沒給）就完全不開庫，只用記憶體。
 *   - 範圍是宿主給的不可逆雜湊（不是帳號 ID），接在每一把鍵前面：別的帳號同一段原文也不命中。
 *   - owner 物件庫記著「這份資料屬於哪個範圍」；開庫發現不是目前的範圍（換帳號、改版前沒有標記的舊資料），
 *     先整份清掉才用。沙箱卡的殼在各自的子網域上，宿主刪不到，靠這一步在下次載入時清。
 *   - 範圍變成沒有（登出）或呼叫 clear()：關掉自己的連線、整個資料庫刪掉。
 */
import type { RulePersist, RulePersistEntry } from './rule-runner'
import { AUTHOR_RULE_DB_NAME, deleteAuthorRuleStore } from './store'

export interface IdbRulePersistOptions {
  /** 測試注入；沒給用全域 indexedDB（取用本身可能丟 SecurityError）。 */
  factory?: IDBFactory | null
  name?: string
  /** 一開始的帳號範圍；沒給＝不存（之後用 setScope 給）。 */
  scope?: string | null
  maxEntries?: number
  /** 所有筆的（鍵＋原文＋產物）字元數上限。 */
  maxChars?: number
  /** 單筆超過就不存（長篇的整頁 HTML 卡）。 */
  maxEntryChars?: number
  /** 開庫多久沒回應算不能用（別的分頁擋著版本升級時 open 會一直等）。這是儲存的事，不是規則的逾時。 */
  openTimeoutMs?: number
  /** 寫入後多久做一次淘汰。 */
  evictDelayMs?: number
}

const ENTRIES = 'entries'
const META = 'meta'
const OWNER = 'owner'
const OWNER_KEY = 'scope'
const DB_VERSION = 2

/** 帶帳號範圍的持久層：排程器只用 get/set；宿主接線用 setScope/clear。 */
export interface ScopedRulePersist extends RulePersist {
  /** 換範圍：不同的範圍先清掉舊資料；null＝刪掉整個資料庫、之後不存。完成時 resolve，從不 reject。 */
  setScope(scope: string | null): Promise<void>
  /** 刪掉整個資料庫、之後不存（登出）。 */
  clear(): Promise<void>
}

interface MetaRow { k: string; at: number; size: number }

function globalFactory(): IDBFactory | null {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB
  } catch {
    return null
  }
}

/** 環境沒有 IndexedDB 時回 null（排程器只用記憶體）。 */
export function createIdbRulePersist(options: IdbRulePersistOptions = {}): ScopedRulePersist | null {
  const factory = options.factory === undefined ? globalFactory() : options.factory
  if (!factory) return null
  const name = options.name || AUTHOR_RULE_DB_NAME
  const maxEntries = options.maxEntries ?? 400
  const maxChars = options.maxChars ?? 16_000_000
  const maxEntryChars = options.maxEntryChars ?? 1_000_000
  const openTimeoutMs = options.openTimeoutMs ?? 5_000
  const evictDelayMs = options.evictDelayMs ?? 1_500

  let dead = false
  let opening: Promise<IDBDatabase | null> | null = null
  /** 目前的帳號範圍；null 時 get/set 直接略過、不開庫。 */
  let scope: string | null = null
  /** 範圍切換（清舊資料／刪庫）排成一條鏈；get/set 等它做完才碰資料。 */
  let ready: Promise<void> = Promise.resolve()
  /** 切換的世代：get/set 發出時的範圍已經被換掉就放棄。 */
  let generation = 0
  let evictTimer: ReturnType<typeof setTimeout> | null = null
  let lastAt = 0
  /** 單調遞增的時間戳：同一毫秒內的多筆也分得出先後。 */
  const now = () => { lastAt = Math.max(lastAt + 0.001, Date.now()); return lastAt }

  const open = (): Promise<IDBDatabase | null> => {
    if (dead) return Promise.resolve(null)
    if (opening) return opening
    opening = new Promise<IDBDatabase | null>((resolve) => {
      let settled = false
      const finish = (db: IDBDatabase | null) => {
        if (settled) { if (db) try { db.close() } catch { /* 已關 */ } return }
        settled = true
        clearTimeout(timer)
        if (!db) dead = true
        resolve(db)
      }
      const timer = setTimeout(() => finish(null), openTimeoutMs)
      try {
        const req = factory.open(name, DB_VERSION)
        req.onupgradeneeded = () => {
          try {
            const db = req.result
            if (!db.objectStoreNames.contains(ENTRIES)) db.createObjectStore(ENTRIES)
            if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'k' }).createIndex('at', 'at')
            // 版本 1 沒有 owner：留下的舊資料沒有帳號標記，第一次帶範圍開庫時會被 claim 清掉。
            if (!db.objectStoreNames.contains(OWNER)) db.createObjectStore(OWNER)
          } catch { /* 交給 onerror */ }
        }
        req.onsuccess = () => {
          const db = req.result
          // 別的分頁要升級版本：讓位，這個分頁之後只用記憶體。
          try { db.onversionchange = () => { dead = true; try { db.close() } catch { /* 已關 */ } } } catch { /* 不支援就算了 */ }
          finish(db)
        }
        req.onerror = () => finish(null)
        req.onblocked = () => finish(null)
      } catch {
        finish(null)
      }
    })
    return opening
  }

  const tx = (db: IDBDatabase, stores: string[], mode: IDBTransactionMode): IDBTransaction | null => {
    if (dead) return null
    try { return db.transaction(stores, mode) } catch { return null }
  }

  const touch = (db: IDBDatabase, key: string, size: number) => {
    const t = tx(db, [META], 'readwrite')
    if (!t) return
    try { t.objectStore(META).put({ k: key, at: now(), size } as MetaRow) } catch { /* 算了 */ }
  }

  const evict = async () => {
    evictTimer = null
    const db = await open()
    if (!db) return
    const t = tx(db, [ENTRIES, META], 'readwrite')
    if (!t) return
    try {
      const rows: MetaRow[] = []
      let total = 0
      const cursorReq = t.objectStore(META).index('at').openCursor()
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (cursor) {
          const row = cursor.value as MetaRow
          rows.push(row)
          total += row.size || 0
          cursor.continue()
          return
        }
        // rows 由舊到新（at 遞增）：超量就從最舊的丟。
        let count = rows.length
        for (const row of rows) {
          if (count <= maxEntries && total <= maxChars) break
          t.objectStore(ENTRIES).delete(row.k)
          t.objectStore(META).delete(row.k)
          count--
          total -= row.size || 0
        }
      }
    } catch { /* 下次寫入再試 */ }
  }

  const scheduleEvict = () => {
    if (evictTimer || dead) return
    evictTimer = setTimeout(() => { evict().catch(() => {}) }, evictDelayMs)
  }

  /** 等交易完成（或失敗）；從不 reject。 */
  const done = (t: IDBTransaction) => new Promise<void>((resolve) => {
    try {
      t.oncomplete = () => resolve()
      t.onerror = () => resolve()
      t.onabort = () => resolve()
    } catch { resolve() }
  })

  /** 資料庫改成屬於 next：原本記的不是它（別的帳號、舊版沒標記）就整份清掉再記上。 */
  const claim = async (next: string) => {
    const db = await open()
    if (!db) return
    const t = tx(db, [ENTRIES, META, OWNER], 'readwrite')
    if (!t) return
    const finished = done(t)
    try {
      const req = t.objectStore(OWNER).get(OWNER_KEY)
      req.onsuccess = () => {
        try {
          if (req.result === next) return
          t.objectStore(ENTRIES).clear()
          t.objectStore(META).clear()
          t.objectStore(OWNER).put(next, OWNER_KEY)
        } catch { /* 清不掉：交易中止，get 仍靠鍵上的範圍不命中 */ }
      }
    } catch { /* 同上 */ }
    await finished
  }

  /** 關掉自己的連線（不然刪庫會被自己擋住）再刪整個資料庫；之後要用會重開。 */
  const wipe = async () => {
    if (evictTimer) { clearTimeout(evictTimer); evictTimer = null }
    const current = opening
    opening = null
    if (current) {
      const db = await current.catch(() => null)
      if (db) try { db.close() } catch { /* 已關 */ }
    }
    // 刪掉了才允許之後重開（別的分頁刪庫時這邊讓位標成 dead 的情況）；刪不掉就維持原狀。
    if (await deleteAuthorRuleStore({ factory, name, timeoutMs: openTimeoutMs })) dead = false
  }

  const setScope = (next: string | null): Promise<void> => {
    const value = typeof next === 'string' && next ? next : null
    scope = value
    generation++
    ready = ready.then(() => (value ? claim(value) : wipe())).catch(() => {})
    return ready
  }

  const scoped = (key: string, s: string) => `${s}\u0002${key}`

  if (options.scope) void setScope(options.scope)

  return {
    setScope,
    clear: () => setScope(null),

    async get(rawKey: string): Promise<RulePersistEntry | undefined> {
      const s = scope
      if (!s) return undefined
      const gen = generation
      await ready
      if (gen !== generation) return undefined
      const key = scoped(rawKey, s)
      const db = await open()
      if (!db) return undefined
      const t = tx(db, [ENTRIES], 'readonly')
      if (!t) return undefined
      return new Promise<RulePersistEntry | undefined>((resolve) => {
        try {
          const req = t.objectStore(ENTRIES).get(key)
          req.onsuccess = () => {
            const value = req.result as RulePersistEntry | undefined
            if (value && typeof value === 'object') {
              touch(db, key, rawKey.length + String(value.text || '').length + String(value.html || '').length)
              resolve(value)
            } else resolve(undefined)
          }
          req.onerror = () => resolve(undefined)
          t.onabort = () => resolve(undefined)
        } catch {
          resolve(undefined)
        }
      })
    },

    set(rawKey: string, value: RulePersistEntry): void {
      const s = scope
      if (!s) return
      const gen = generation
      const key = scoped(rawKey, s)
      // 上限照原鍵算（範圍前綴是固定的幾十個字元，不改變上限的意義）。
      const size = rawKey.length + value.text.length + value.html.length
      if (size > maxEntryChars) return
      ready.then(() => (gen === generation ? open() : null)).then((db) => {
        if (!db || gen !== generation) return
        const t = tx(db, [ENTRIES, META], 'readwrite')
        if (!t) return
        try {
          t.objectStore(ENTRIES).put({ p: value.p, text: value.text, html: value.html, rollbacks: value.rollbacks }, key)
          t.objectStore(META).put({ k: key, at: now(), size } as MetaRow)
          t.oncomplete = () => scheduleEvict()
        } catch { /* 配額滿之類：這筆不存 */ }
      }).catch(() => {})
    },
  }
}
