/** Public causes only: never render raw provider errors or guess a network failure. */
export function operationFailureTitle(cause: unknown, t: (key: string) => string): string {
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
  }
  const key = typeof cause === 'string' && Object.prototype.hasOwnProperty.call(keys, cause) ? keys[cause] : ''
  return key ? t(key) : ''
}

/**
 * 說明那一行要讓玩家看得出這次是誰的問題、他能做什麼（owner 2026-10-05）：
 * 模型那邊連線出狀況就說不是他的訊息、可以重試或換模型；我們這邊出錯就道歉，
 * 並說沒有扣點（伺服器只在這一輪實際沒扣時才給 internal_error）；他能處理的事就指路。
 * 空回覆、拒答這類講不準原因的，回空字串沿用原本那一句，不替模型找理由。
 */
export function operationFailureSub(cause: unknown, t: (key: string) => string, opts: { agent?: boolean } = {}): string {
  if (typeof cause !== 'string') return ''
  switch (cause) {
    case 'internal_error':
      return t('systemMsg.ourErrorSub')
    case 'service_unavailable':
    case 'upstream_timeout':
    case 'stream_incomplete':
      return t(opts.agent ? 'multiPass.upstreamSub' : 'systemMsg.upstreamSub')
    case 'insufficient_credits':
      return t('chat.manageCredits')
    case 'context_capacity_exceeded':
      return t('error.contextCapacityExceeded')
    default:
      return ''
  }
}
