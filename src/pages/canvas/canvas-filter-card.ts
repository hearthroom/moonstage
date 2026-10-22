/**
 * 內容限制那張卡（kind filtered）上的動作：伺服器給的鍵之外，兩種情況由這一端接上去。
 *
 * 1. 原因未提供的輸出端停止（content_filter，沒有 filterReason 或 unknown）：流式輸出中途被
 *    服務商的審核截斷，改成一次輸出比較常能完整交付（2026-10-21 Gemini 4 的證據）。流式開著時
 *    多一顆主行動「關閉流式輸出並重試」，旁邊那顆重試改叫「直接重試」分開兩者；流式已關時動作
 *    不變，只換說明。值還沒讀到、世界模式與 Agent（伺服器一律流式，偏好不生效）照舊。
 * 2. 前置被擋（input_policy；舊歷史是 content_filter_input）：同一份請求在同一條線路上重送必定
 *    再擋，所以拿掉重試；主行動是「修改訊息」（走既有的編輯並重送，取代被擋那則），另有
 *    「切換線路」（同一個模型換服務商）與「切換模型」。內容根本沒開始生成，不給流式輸出出口。
 *
 * 兩個判斷要分清楚：伺服器的 filterKey 把「content_filter_input 且沒有原因」也算成 unknown
 * （標題一樣），但那是輸入端被拒，關流式輸出沒有道理。
 *
 * 說明句與按鍵吃同一個結果（offersStreamOff／streamingOff），不能讓說明提到一顆卡上沒有的鍵。
 */

export interface FilterCardEntry { action: string; label: string }

export interface FilterCardContext {
  item: any
  /** 這張卡原本的鍵（伺服器給的，或舊歷史那一顆）。 */
  base: FilterCardEntry[]
  /** 這個對話目前生效的流式輸出（含模型預設）；'' ＝還不知道。 */
  streaming: 'on' | 'off' | ''
  /** 偏好會影響下一輪嗎：世界模式、Agent、預覽、偏好 API 不可用時為 false。 */
  streamingApplies: boolean
  canEditMessage: boolean
  hasOtherLanes: boolean
  labels: { retryAsIs: string; streamOffRetry: string; switchLane: string; editMessage: string }
}

export interface FilterCardResult {
  ctas: FilterCardEntry[]
  offersStreamOff: boolean
  streamingOff: boolean
  /** 手機上主行動整行排第一（三顆排不進一行時）。 */
  stacked: boolean
}

const RETRY_FAMILY = ['retry', 'retry_rewrite', 'rewrite', 'retry_continue']
const isRetry = (action: string) => RETRY_FAMILY.includes(action)

export function isInputPolicyFilter(item: any): boolean {
  return item?.filterReason === 'input_policy'
    || item?.failureCause === 'content_filter_input'
    || item?.finishReason === 'content_filter_input'
}

export function isUnknownOutputFilter(item: any): boolean {
  if (!item || isInputPolicyFilter(item)) return false
  const cause = item.failureCause || item.finishReason
  return cause === 'content_filter' && (!item.filterReason || item.filterReason === 'unknown')
}

/** 「關閉流式輸出並重試」存完偏好後要走的那一顆重試（伺服器給哪一種不一定）。 */
export function streamOffRetryTarget(base: FilterCardEntry[]): string {
  return base.find(entry => isRetry(entry.action))?.action || ''
}

export function filterCardActions(ctx: FilterCardContext): FilterCardResult {
  const { item, base, labels } = ctx
  const unchanged: FilterCardResult = { ctas: base, offersStreamOff: false, streamingOff: false, stacked: false }
  if (isInputPolicyFilter(item)) {
    const ctas: FilterCardEntry[] = []
    for (const entry of base) {
      if (isRetry(entry.action)) continue
      if (entry.action === 'switch_model' && ctx.hasOtherLanes) ctas.push({ action: 'switch_lane', label: labels.switchLane })
      ctas.push(entry)
    }
    if (ctx.canEditMessage) ctas.push({ action: 'edit_message', label: labels.editMessage })
    return { ctas, offersStreamOff: false, streamingOff: false, stacked: ctas.length >= 3 }
  }
  if (!isUnknownOutputFilter(item) || !ctx.streamingApplies) return unchanged
  if (ctx.streaming === 'off') return { ...unchanged, streamingOff: true }
  if (ctx.streaming !== 'on' || !streamOffRetryTarget(base)) return unchanged
  return {
    ctas: [
      ...base.map(entry => (isRetry(entry.action) ? { ...entry, label: labels.retryAsIs } : entry)),
      { action: 'retry_stream_off', label: labels.streamOffRetry },
    ],
    offersStreamOff: true,
    streamingOff: false,
    stacked: true,
  }
}
