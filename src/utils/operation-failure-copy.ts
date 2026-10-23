const FILTER_COPY: Record<string, string> = {
 input_policy: 'InputPolicy', safety: 'Safety', prohibited: 'Safety', blocklist: 'Safety',
 privacy: 'Privacy', recitation: 'Recitation', refusal: 'Refusal', unknown: 'Unknown',
}
export function normalizeFilterReason(reason: unknown): string {
 if (!reason) return ''
 return typeof reason === 'string' && Object.prototype.hasOwnProperty.call(FILTER_COPY, reason) ? reason : 'unknown'
}
/** 內容限制卡用哪一組字（systemMsg.filterXxx）；不是內容限制回 ''。卡上的鍵（canvas-filter-card）照同一個判斷。 */
export function filterKey(cause: unknown, reason: unknown): string {
 if (!['content_filter', 'content_filter_input', 'refusal'].includes(String(cause)) && !reason) return ''
 // 舊歷史的輸入端拒絕沒有原因：它就是前置被擋，跟 input_policy 用同一組字。
 const value = normalizeFilterReason(reason) || (cause === 'refusal' ? 'refusal' : cause === 'content_filter_input' ? 'input_policy' : 'unknown')
 return 'systemMsg.filter' + FILTER_COPY[value]
}
/** Public causes only: never render raw provider errors or guess a network failure. */
export function operationFailureTitle(cause: unknown, t: (key: string) => string, filterReason?: unknown, hasReasoning = false): string {
  if (hasReasoning && ['no_final_answer', 'empty_response', 'no_answer'].includes(String(cause))) return t('chat.noFinalAnswer')
  const restricted = filterKey(cause, filterReason)
  if (restricted) return t(restricted)
  const keys: Record<string, string> = {
    stopped: 'systemMsg.stopped',
    tool_rejections: 'multiPass.failureTools',
    upstream_timeout: 'multiPass.failureTimeout',
    stream_incomplete: 'multiPass.failureInterrupted',
    service_unavailable: 'error.serviceUnavailable',
    rate_limit: 'systemMsg.rateLimit',
    empty_turn: 'error.emptyResponse',
    no_answer: 'error.emptyResponse',
    no_final_answer: 'error.emptyResponse',
    empty_response: 'error.emptyResponse',
    usage_invalid: 'multiPass.failureUsage',
    context_capacity_exceeded: 'error.contextCapacityTitle',
    insufficient_credits: 'chat.point_no_tips',
    internal_error: 'systemMsg.ourError',
    content_filter: 'systemMsg.filtered',
  }
  const key = typeof cause === 'string' && Object.prototype.hasOwnProperty.call(keys, cause) ? keys[cause] : ''
  return key ? t(key) : ''
}

/** Select copy from confirmed reasons, available actions and settlement evidence. */
// offersStreamOff／streamingOff 來自卡上的鍵（canvas-filter-card），說明不會提到一顆卡上沒有的鍵。
// 前置被擋的說明不點名按鍵，按鍵少一顆時同一句仍成立，所以沒有「不能切換」的變體。
export function operationFailureSub(cause: unknown, t: (key: string) => string, opts: { agent?: boolean; filterReason?: unknown; canSwitch?: boolean; actions?: string[]; settled?: boolean; chargeCredits?: number; hasReasoning?: boolean; offersStreamOff?: boolean; streamingOff?: boolean; switchedTo?: '' | 'lane' | 'model'; offersTraditional?: boolean; traditionalFailed?: boolean } = {}): string {
  if (opts.hasReasoning && ['no_final_answer', 'empty_response', 'no_answer'].includes(String(cause))) return t('chat.noFinalAnswerSub')
  const restricted = filterKey(cause, opts.filterReason)
  // 前置被擋後從卡上換了線路或模型、卡上有重送鍵：說明只講現在可以直接重送。
  if (restricted === 'systemMsg.filterInputPolicy' && opts.switchedTo) return t(restricted + (opts.switchedTo === 'lane' ? 'SubSwitchedLane' : 'SubSwitchedModel'))
  if (restricted === 'systemMsg.filterInputPolicy' && opts.offersTraditional) return t(restricted + 'SubTraditional')
  if (restricted === 'systemMsg.filterInputPolicy' && opts.traditionalFailed) return t(restricted + 'SubTraditionalFailed')
  if (restricted === 'systemMsg.filterUnknown') {
    if (opts.offersStreamOff) return t(restricted + (opts.canSwitch === false ? 'SubStreamNoSwitch' : 'SubStream'))
    if (opts.streamingOff && opts.canSwitch === true) return t(restricted + 'SubSwitch')
  }
  if (restricted) return t(restricted + (opts.canSwitch === false && ['systemMsg.filterSafety','systemMsg.filterRefusal'].includes(restricted) ? 'SubNoSwitch' : 'Sub'))
  if (typeof cause !== 'string') return ''
  switch (cause) {
    case 'no_final_answer':
    case 'empty_response':
    case 'no_answer':
      return opts.actions?.some(action => action.startsWith('retry')) ? t('chat.turnRetryable') : ''
    case 'content_filter':
      return opts.agent ? t('error.contentFilter') : ''
    case 'internal_error':
      return opts.settled === true && opts.chargeCredits === 0 ? t('systemMsg.ourErrorSub') : ''
    case 'service_unavailable':
    case 'upstream_timeout':
    case 'stream_incomplete':
      return opts.actions && !opts.actions.some(action => action.startsWith('retry')) ? '' : t(opts.agent ? 'multiPass.upstreamSub' : 'systemMsg.upstreamSub')
    case 'insufficient_credits':
      return t('chat.creditsNotEnoughSub')
    case 'context_capacity_exceeded':
      return t('error.contextCapacityExceeded')
    default:
      return ''
  }
}
