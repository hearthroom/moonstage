/**
 * 遊客（沒登入）在對話頁（owner 2026-10-10）：看開場白、挑開場白、點開場選項、打字都行，
 * 按下送出那一下才請宿主登入。登入是整頁來回（去供應商的登入頁再回來），所以送出前把
 * 打好的字與挑到第幾條開場白存在這個分頁的 sessionStorage，回來時同一張卡拿回去。
 *
 * 只還給同一張卡；放超過 GUEST_DRAFT_TTL_MS 不還；拿過一次就清掉。
 */
export const GUEST_DRAFT_TTL_MS = 60 * 60 * 1000
const KEY = 'moonstage-guest-draft'

export interface GuestDraft { roleId: string; content: string; greetingIndex: number; savedAt: number }
type Writable = Pick<Storage, 'setItem'>
type Readable = Pick<Storage, 'getItem' | 'removeItem'>

/** 這個分頁的 sessionStorage；無痕模式或被擋時是 null。 */
export function guestDraftStorage(): Storage | null {
  try { return globalThis.sessionStorage ?? null } catch { return null }
}

export function saveGuestDraft(storage: Writable | null, draft: Omit<GuestDraft, 'savedAt'>, now = Date.now()): void {
  try { storage?.setItem(KEY, JSON.stringify({ ...draft, savedAt: now })) } catch { /* 存不了就算了：登入回來重打一次 */ }
}

export function takeGuestDraft(storage: Readable | null, roleId: string, now = Date.now()): GuestDraft | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return null
    storage.removeItem(KEY)
    const d = JSON.parse(raw) as GuestDraft
    if (d?.roleId !== roleId || typeof d.content !== 'string' || !Number.isInteger(d.greetingIndex) || typeof d.savedAt !== 'number') return null
    if (now - d.savedAt > GUEST_DRAFT_TTL_MS) return null
    return d
  } catch { return null }
}
