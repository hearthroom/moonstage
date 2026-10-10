/**
 * 上下文用量的等級：輸入框旁那顆小圓環的顏色。
 *
 * ── 口徑 ──
 * 百分比是伺服器診斷回的 window.percent：這段對話送進模型的那份請求，用記憶整理
 * 那把尺量（離線計數 × 這段對話的換算係數），占玩家選的容量幾成。伺服器在用量到
 * compactAtTokens（容量的 92%）時開始把較早的劇情濃縮成摘要，所以 full 這一級就從
 * 那條線開始：玩家看到圓環變色的那一刻，跟伺服器開始整理的那一刻是同一刻。
 */

export type ContextUsageLevel = 'low' | 'mid' | 'high' | 'full'

export const CONTEXT_USAGE_HIGH_PERCENT = 75
export const CONTEXT_USAGE_MID_PERCENT = 45

/** fullAt 是伺服器回的濃縮線（占容量的百分比）。 */
export function contextUsageLevel(percent: number, fullAt: number): ContextUsageLevel {
  if (percent >= fullAt) return 'full'
  if (percent >= CONTEXT_USAGE_HIGH_PERCENT) return 'high'
  if (percent >= CONTEXT_USAGE_MID_PERCENT) return 'mid'
  return 'low'
}
