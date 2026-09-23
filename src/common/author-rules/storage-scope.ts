/**
 * 作者規則持久層的帳號範圍（宿主給的不可逆雜湊）與「清掉」通知。
 *
 * 範圍只收 16–128 個 [A-Za-z0-9_-] 字元：宿主要給的是雜湊，不是帳號 ID；
 * 格式不對（例如直接塞了數字 ID）就當沒給——寧可不存，也不把可辨識的東西寫進鍵裡。
 *
 * 沙箱卡在各自的子網域上跑，宿主刪不到那邊的資料庫：
 *   - 握手時給殼的是「這張卡專用」的範圍（帳號範圍＋卡 id 再雜湊一次，cardStorageScope），
 *     作者的腳本在殼的 origin 上跑，拿到的標記沒辦法跨卡對出同一個人。
 *   - 登出時 clearAuthorRuleStorage() 通知還開著的沙箱橋，叫殼清掉（盡力而為；下次載入時殼也會比對範圍再清）。
 * 這個檔不 import 執行器或 IndexedDB，沙箱橋可以直接用。
 */
export type StorageScopeEvent = { type: 'scope'; scope: string | null } | { type: 'clear' }

const SCOPE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

let current: string | null = null
const listeners = new Set<(event: StorageScopeEvent) => void>()

export function normalizeStorageScope(value: unknown): string | null {
  return typeof value === 'string' && SCOPE_PATTERN.test(value) ? value : null
}

export function getAuthorRuleStorageScope(): string | null {
  return current
}

/** 記下範圍並通知；回傳收下的值（格式不對就是 null）。 */
export function updateStorageScope(value: unknown): string | null {
  current = normalizeStorageScope(value)
  emit({ type: 'scope', scope: current })
  return current
}

/** 範圍改成沒有並通知「清掉」（沙箱橋轉給殼）。 */
export function announceStorageClear(): void {
  current = null
  emit({ type: 'clear' })
}

export function onStorageScopeChange(fn: (event: StorageScopeEvent) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function emit(event: StorageScopeEvent) {
  for (const fn of Array.from(listeners)) {
    try { fn(event) } catch { /* 一個聽的人壞了不影響別人 */ }
  }
}

/**
 * 某張沙箱卡專用的範圍：SHA-256(帳號範圍, 卡 id) 的十六進位。沒有帳號範圍、環境沒有 WebCrypto 就回 null（殼就不存）。
 */
export async function cardStorageScope(scope: string | null, roleId: string): Promise<string | null> {
  if (!scope) return null
  try {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) return null
    const bytes = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(`author-rules-card\u0000${scope}\u0000${roleId}`)))
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}
