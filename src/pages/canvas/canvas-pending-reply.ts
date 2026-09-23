/**
 * 「回覆還沒來」那一列：從按下送出到第一個字之間，回覆那一側一定要有一個看得到的東西。
 *
 * 由來（owner 2026-09-23，card 100019，長對話）：那一輪先整理劇情（伺服器壓縮 43 秒），
 * 再讀 120K 的上下文，前後九十幾秒一個字都沒有。畫面上只有玩家自己的「1」和停止鍵，
 * 回覆那一側什麼都沒有——玩家以為卡住，按停止或重新整理。
 *
 * 原因：收到 `compacting` 時畫布把等回覆的那顆氣泡拿掉了，註解寫「由 pill 接管」，
 * 但那顆 pill 從 mobile 分出來時就沒有搬過來（compactStatus 沒有任何元件在讀）。
 * 伺服器每 15 秒重送一次 `compacting`，於是每 15 秒又拿一次；直到第一個字到了
 * upsertPendingAIBubble 才補回一顆。
 *
 * 現在：壓縮期間那顆氣泡留著，只換標籤（「整理劇情中…」）；壓完換回「正在回覆」。
 * 一般模式與沙箱卡都吃同一份 messageProps，所以兩邊一起好。
 */

export type PendingReplyPhase = 'compacting' | ''

export interface PendingReplyRow {
  id?: string | number
  type?: number
  chatFinish?: boolean
  chatLoading?: boolean
  systemOnly?: boolean
  content?: unknown
  thinkingContent?: unknown
  pendingPhase?: PendingReplyPhase
  [key: string]: unknown
}

/** 列表末尾那顆「還沒有任何內容、還沒結束」的 AI 氣泡。 */
export function isPendingReplyRow(row: PendingReplyRow | null | undefined): boolean {
  if (!row || row.type !== 0 || row.systemOnly || row.chatFinish) return false
  return !String(row.content ?? '').trim() && !String(row.thinkingContent ?? '').trim()
}

/**
 * 把等回覆的那顆氣泡標成某個階段；末尾沒有的話先補一顆（例如刷新進來、或舊的
 * 那顆已被別的路徑拿掉）。回傳那顆氣泡。重複呼叫是冪等的（伺服器每 15 秒重送）。
 */
export function markPendingReplyPhase<T extends PendingReplyRow>(
  list: T[],
  phase: PendingReplyPhase,
  makePlaceholder: () => T,
): T {
  const last = list[list.length - 1]
  if (last && isPendingReplyRow(last)) {
    last.pendingPhase = phase
    return last
  }
  const row = makePlaceholder()
  row.pendingPhase = phase
  list.push(row)
  return row
}

/** 階段結束：清掉末尾那顆氣泡上的標記（氣泡本身留著，等第一個字）。 */
export function clearPendingReplyPhase(list: PendingReplyRow[]): void {
  const last = list[list.length - 1]
  if (last && last.type === 0 && last.pendingPhase) last.pendingPhase = ''
}

/**
 * 插一列到「等回覆的那顆氣泡」之前（例如壓縮完成時伺服器帶回的摘要）：
 * 回覆還沒來，它應該接在摘要之後，跟刷新後的順序一致。末尾不是等回覆的氣泡就照常接在最後。
 */
export function insertBeforePendingReply<T extends PendingReplyRow>(list: T[], row: T): void {
  const last = list[list.length - 1]
  if (last && isPendingReplyRow(last)) list.splice(list.length - 1, 0, row)
  else list.push(row)
}

export interface PendingReplyLabelInput {
  phase?: PendingReplyPhase
  /** Agent 模式的準備軌跡（有就代表正在準備） */
  hasLiveSteps: boolean
  /** Agent 模式的當下步驟文字 */
  prepStepText?: string
  t: (key: string) => string
}

/** 指示器上那行字。 */
export function pendingReplyLabel(input: PendingReplyLabelInput): string {
  if (input.phase === 'compacting') return input.t('chat.compacting')
  if (input.hasLiveSteps) return input.t('chat.thinkingInProgress')
  return input.prepStepText || input.t('chat.aiReplying')
}
