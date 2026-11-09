/**
 * 一般頁（canvas.vue）的卡片數值：畫面上的訊息列 → 共用的時間線（common/card-state.ts）。
 *
 * 訊息列（talkList 的一列）身上的 `cardState` 有兩個來源：載入歷史時的那一列（mapRow），以及一輪跑完時
 * operationStatus 帶來的那一份（掛到那一輪的 AI 氣泡上）。重寫、回溯、刪除之後歷史整份重載，列跟著換。
 * 沙箱卡的宿主橋讀的是同一份訊息列（HUD 的 messages），所以兩種頁面的時間線是同一條。
 */
import { cardStateMessageId, normalizeCardState, type CardStateRow, type CardStateSnapshot } from '@/common/card-state'
import type { SandboxCardState } from '@/sandbox/protocol'

interface TimelineItem {
  id?: unknown
  chatId?: unknown
  assistantChatId?: unknown
  type?: unknown
  systemOnly?: unknown
  cardState?: CardStateSnapshot | null
}

const roleOf = (item: TimelineItem): CardStateRow['role'] => (item.systemOnly ? 'system' : Number(item.type) === 1 ? 'user' : 'ai')

/** 訊息列 → 時間線。skip 跟 HUD 的 messages 用同一個條件（前置被擋、整列收起的那一列不算）。 */
export function cardStateRowsOf(items: TimelineItem[], skip: (item: TimelineItem) => boolean = () => false): CardStateRow[] {
  const rows: CardStateRow[] = []
  for (const item of items || []) {
    if (!item || skip(item)) continue
    rows.push({ messageId: cardStateMessageId(item), role: roleOf(item), state: item.cardState || null })
  }
  return rows
}

/** 只看帶數值的列（id＋seq）：串流中正文一直變，這個鍵不動，watch 才不會每一跳都重算事件。 */
export function cardStateRowsKey(rows: CardStateRow[]): string {
  return rows.filter((r) => r.state).map((r) => `${r.messageId}#${(r.state as CardStateSnapshot).seq}`).join('|')
}

/** 伺服器的列（歷史或 operationStatus）→ 掛在畫面訊息上的那一份；沒有或認不得就 undefined（列上不留欄位）。 */
export function cardStateFromServer(raw: unknown): CardStateSnapshot | undefined {
  return normalizeCardState(raw) || undefined
}

/** 給沙箱殼的那一份：帶上宿主的訊息 id（殼的事件載荷要跟一般頁一樣）。 */
export function sandboxCardStateOf(item: TimelineItem): SandboxCardState | null {
  const s = item.cardState
  if (!s) return null
  const out: SandboxCardState = { messageId: cardStateMessageId(item), data: s.data, changes: s.changes, seq: s.seq, source: s.source }
  if (s.rejected) out.rejected = s.rejected
  return JSON.parse(JSON.stringify(out))
}
