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
 *    被擋那則含簡體、還沒轉過時，主行動換成「轉成繁體再送出」（服務商多半用簡體詞庫），修改訊息讓位。
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
  /** 前置被擋後，玩家從這張卡換了線路（同一個模型）或模型、而且選好了；'' ＝還沒換。 */
  switchedTo?: '' | 'lane' | 'model'
  /** 被擋那則能改、含簡體、還沒轉過（canvas-traditional-resend）。 */
  canResendTraditional?: boolean
  labels: { retryAsIs: string; streamOffRetry: string; switchLane: string; editMessage: string; resendLane: string; resendModel: string; resendTraditional: string }
}

export interface FilterCardResult {
  ctas: FilterCardEntry[]
  offersStreamOff: boolean
  streamingOff: boolean
  /** 手機上主行動整行排第一（三顆排不進一行時）。 */
  stacked: boolean
  /** 卡上有「用新線路／模型重送」時是哪一種：說明句跟著換成「已換到新的…，可以直接重送」。 */
  switched: '' | 'lane' | 'model'
  /** 卡上有「轉成繁體再送出」：說明句跟著提到它。 */
  offersTraditional: boolean
}

import { filterKey } from '@/utils/operation-failure-copy'

const RETRY_FAMILY = ['retry', 'retry_rewrite', 'rewrite', 'retry_continue']
const isRetry = (action: string) => RETRY_FAMILY.includes(action)

// 跟卡上的標題與說明同一個判斷（filterKey 吃的也是 failureCause || finishReason）：鍵不會跟字各說各話。
const copyKey = (item: any) => filterKey(item?.failureCause || item?.finishReason, item?.filterReason)

export function isInputPolicyFilter(item: any): boolean {
  return !!item && copyKey(item) === 'systemMsg.filterInputPolicy'
}

// 舊紀錄可能 failureCause 是 content_filter、finishReason 卻被換成 content_filter_input（沒有產出的輸入端拒絕）：
// 字照「原因未提供」，但分不出是不是中途截斷，保守地不給流式輸出出口。
export function isUnknownOutputFilter(item: any): boolean {
  if (!item || item.failureCause === 'content_filter_input' || item.finishReason === 'content_filter_input') return false
  return copyKey(item) === 'systemMsg.filterUnknown' && (item.failureCause || item.finishReason) === 'content_filter'
}

/** 卡上那顆重試（伺服器給哪一種不一定）：關閉流式輸出並重試、換線路／模型後重送都走它。 */
export function cardRetryTarget(base: FilterCardEntry[]): string {
  return base.find(entry => isRetry(entry.action))?.action || ''
}

export function filterCardActions(ctx: FilterCardContext): FilterCardResult {
  const { item, base, labels } = ctx
  const unchanged: FilterCardResult = { ctas: base, offersStreamOff: false, streamingOff: false, stacked: false, switched: '', offersTraditional: false }
  if (isInputPolicyFilter(item)) {
    const ctas: FilterCardEntry[] = []
    for (const entry of base) {
      if (isRetry(entry.action)) continue
      if (entry.action === 'switch_model' && ctx.hasOtherLanes) ctas.push({ action: 'switch_lane', label: labels.switchLane })
      ctas.push(entry)
    }
    // 換了線路或模型之後，原樣重送才有意義：主行動換成重送（玩家按了才送，只看看選單不會扣費）。
    // 伺服器沒給任何重試動作就沒有路可走，維持修改訊息。
    const switched = ctx.switchedTo && cardRetryTarget(base) ? ctx.switchedTo : ''
    // 轉繁體也是改這一則再送，能改才給；換過線路之後主行動已經是重送，不再疊一顆。
    const offersTraditional = !switched && ctx.canEditMessage && ctx.canResendTraditional === true
    // 主行動只有一顆，修改訊息跟換線路後一樣讓位：卡維持三顆，手機上兩顆次要鍵才排得進一行（改字仍可走⋯→編輯並重送）。
    if (switched) {
      ctas.push({ action: 'resend_filtered', label: switched === 'lane' ? labels.resendLane : labels.resendModel })
    } else if (offersTraditional) {
      ctas.push({ action: 'resend_traditional', label: labels.resendTraditional })
    } else if (ctx.canEditMessage) {
      ctas.push({ action: 'edit_message', label: labels.editMessage })
    }
    return { ctas, offersStreamOff: false, streamingOff: false, stacked: ctas.length >= 3, switched, offersTraditional }
  }
  if (!isUnknownOutputFilter(item) || !ctx.streamingApplies) return unchanged
  if (ctx.streaming === 'off') return { ...unchanged, streamingOff: true }
  if (ctx.streaming !== 'on' || !cardRetryTarget(base)) return unchanged
  return {
    ctas: [
      ...base.map(entry => (isRetry(entry.action) ? { ...entry, label: labels.retryAsIs } : entry)),
      { action: 'retry_stream_off', label: labels.streamOffRetry },
    ],
    offersStreamOff: true,
    streamingOff: false,
    stacked: true,
    switched: '',
    offersTraditional: false,
  }
}
