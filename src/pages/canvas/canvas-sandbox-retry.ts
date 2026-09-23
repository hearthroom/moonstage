/**
 * 沙箱卡的重試出路。
 *
 * 沙箱卡的訊息列表畫在殼裡，殼不畫系統訊息卡（宿主送過去的列表濾掉了系統列），
 * 所以一般卡那張帶「重試」的失敗卡在沙箱裡看不到：玩家只看到思考停住，什麼都不能做
 * （2026-09-23 正式站實際發生）。這裡挑出「最新一列是可重試的失敗」那一刻，由宿主
 * 用面板通道的確認框問玩家要不要重試；按下去走系統訊息卡同一個動作。
 */
import { latestTerminalAIIndex } from './chat-operation-ui-state'

const RETRY_ACTIONS = new Set(['retry', 'retry_rewrite', 'retry_continue', 'rewrite'])

export interface SandboxRetryPrompt {
  /**
   * 同一則失敗只問一次：操作 id（沒有就用列 id）。不含結果——即時收尾與重新載入的
   * 歷史可能給同一則失敗不同的說法，那不是另一次失敗，不該再問一次。
   */
  key: string
  index: number
  action: string
  finishReason: string
}

/**
 * ctaAction 是系統訊息卡決定按鈕的那一支（canvas.vue 的 getSystemMsgCtaAction），
 * 這裡不另判權限：卡上不會出現重試鍵的失敗，這裡也不問。
 */
export function sandboxRetryPrompt(
  messages: any[],
  ctaAction: (item: any, index: number) => string,
): SandboxRetryPrompt | null {
  const index = latestTerminalAIIndex(messages)
  if (index < 0) return null
  const item = messages[index]
  const finishReason = String(item?.finishReason || '').trim()
  if (!finishReason || finishReason === 'stop') return null
  const action = String(ctaAction(item, index) || '')
  if (!RETRY_ACTIONS.has(action)) return null
  const identity = String(item.operationId || '').trim() || String(item.id ?? '')
  if (!identity) return null
  return { key: identity, index, action, finishReason }
}
