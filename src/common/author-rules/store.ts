/**
 * 作者規則持久層的資料庫名與「整個刪掉」。
 *
 * 這個檔案不 import 任何東西：宿主站台登出時直接引用它（不必為了刪一個資料庫載入整個舞台），
 * 舞台自己的持久層（persist-idb.ts）也用同一個名字，兩邊不會漂移。
 */
export const AUTHOR_RULE_DB_NAME = 'hearthroom-author-rules'

function globalFactory(): IDBFactory | null {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB
  } catch {
    return null
  }
}

/**
 * 刪掉作者規則的資料庫（裡面是聊天原文與套完規則的 HTML）。
 * 同源別的分頁開著連線時，它們的持久層會在 versionchange 時自己關掉讓位；仍被擋住就等到逾時為止。
 * 回傳是否確定刪掉；環境沒有 IndexedDB、被停用、逾時都回 false，從不丟錯。
 */
export function deleteAuthorRuleStore(options: { factory?: IDBFactory | null; name?: string; timeoutMs?: number } = {}): Promise<boolean> {
  const factory = options.factory === undefined ? globalFactory() : options.factory
  if (!factory) return Promise.resolve(false)
  const name = options.name || AUTHOR_RULE_DB_NAME
  const timeoutMs = options.timeoutMs ?? 3_000
  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(ok)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    try {
      const req = factory.deleteDatabase(name)
      req.onsuccess = () => finish(true)
      req.onerror = () => finish(false)
      // onblocked：別的連線還沒關，刪除仍在排隊；等 onsuccess 或逾時。
    } catch {
      finish(false)
    }
  })
}
