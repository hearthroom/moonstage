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
  }
  const key = typeof cause === 'string' && Object.prototype.hasOwnProperty.call(keys, cause) ? keys[cause] : ''
  return key ? t(key) : ''
}
