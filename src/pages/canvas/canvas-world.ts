/**
 * 世界卡（world mode）在舞台上的三件事，全都只吃 /role/detail 的 `world` 名冊：
 *
 *   1. 複合訊息裡每個發言者區塊 `<section class="hh-speaker hh-speaker--id">` 的名字列補上頭像。
 *      伺服器只送標準 HTML 與名字（兩種聊天頁的淨化都不剝標準元素），頭像網址舞台自己從名冊查——
 *      訊息本體因此不綁頭像網址，作者換頭像舊訊息也跟著換。
 *   2. 快捷列多出「@名字」：重用既有的 shortcut 事件，沙箱協議一個欄位都不加。
 *   3. 送出時帶 `mention`（成員 id），被 @ 的人一定先開口。
 *
 * 判定（世界層的隱藏裁定）從不到客戶端，這裡沒有任何東西需要藏。
 */

export interface WorldMember {
  id: string
  name: string
  avatar?: string
  profile?: string
}

export const MENTION_PREFIX = 'mention:'

const MEMBER_ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/

/** 名冊：只認合法代號與非空名字，其餘略過（舊伺服器沒有 world 就是空陣列＝普通卡）。 */
export function worldMembers(role: any): WorldMember[] {
  const list = role && role.world && Array.isArray(role.world.characters) ? role.world.characters : []
  const out: WorldMember[] = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const id = String(raw.id || '')
    const name = String(raw.name || '').trim()
    if (!MEMBER_ID_RE.test(id) || !name) continue
    const avatar = typeof raw.avatar === 'string' && /^https:\/\//.test(raw.avatar) ? raw.avatar : ''
    out.push({ id, name, avatar, profile: typeof raw.profile === 'string' ? raw.profile : '' })
  }
  return out
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const SPEAKER_HEADER_RE = /(<section class="hh-speaker hh-speaker--([a-z0-9_-]+)"[^>]*>\s*<header class="hh-speaker__name">)(?!<img class="hh-speaker__avatar")/g

/**
 * 把頭像插進每個發言者區塊的名字列。已經有頭像的（重複渲染同一段 html）不再插；
 * 名冊裡沒有頭像的成員只留名字。不動區塊以外的任何字。
 */
export function decorateSpeakers(html: string, members: WorldMember[]): string {
  if (!html || !members.length || html.indexOf('hh-speaker') < 0) return html
  const byId = new Map(members.map((m) => [m.id, m]))
  return html.replace(SPEAKER_HEADER_RE, (whole, open: string, id: string) => {
    const member = byId.get(id)
    if (!member || !member.avatar) return whole
    return open + '<img class="hh-speaker__avatar" src="' + escapeAttr(member.avatar) + '" alt="" loading="lazy">'
  })
}

/** 快捷列的 @ 項：被選中的加勾，再點一次取消。 */
export function mentionShortcuts(members: WorldMember[], selected: string): Array<{ key: string; label: string }> {
  return members.map((m) => ({ key: MENTION_PREFIX + m.id, label: (selected === m.id ? '✓ @' : '@') + m.name }))
}

/** 快捷鍵是不是 @ 項；是的話回成員 id。 */
export function mentionOf(key: string): string {
  return typeof key === 'string' && key.startsWith(MENTION_PREFIX) ? key.slice(MENTION_PREFIX.length) : ''
}
