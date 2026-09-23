// Keep this mapping aligned with mobile/src/utils/chat-error-message.js.
const CHAT_ERROR_I18N_KEYS = Object.freeze({
  service_unavailable: 'error.serviceUnavailable',
  rate_limit: 'error.rateLimit',
  model_refused: 'error.modelRefused',
  empty_response: 'error.emptyResponse',
  server_error: 'error.serverError',
  timeout: 'error.timeout',
  connection_error: 'error.connectionError',
  insufficient_credits: 'chat.point_no_tips',
  http_402: 'chat.point_no_tips',
  quota_exhausted: 'chat.freeQuotaExhaustedTitle',
  compact_retryable: 'error.compactRetryable',
  context_capacity_exceeded: 'error.contextCapacityExceeded',
  operation_in_progress: 'chat.operationPending',
  mutation_in_progress: 'chat.rollbackInProgressNotice',
  conversation_history_mutation_pending: 'chat.rollbackInProgressNotice',
  rewrite_target_not_persisted: 'error.replyNotGenerated',
  rewrite_target_not_latest: 'chat.editLatestAIOnly',
  rewrite_target_invalid: 'chat.rewriteTargetChanged',
  continue_target_invalid: 'error.replyNotGenerated',
  conversation_stale: 'error.replyNotGenerated',
  content_filter: 'error.contentFilter',
})

export function resolveChatErrorMessage(errorType, translate) {
  return translate(CHAT_ERROR_I18N_KEYS[errorType] || CHAT_ERROR_I18N_KEYS.connection_error)
}

export function resolveChatErrorTypeFromFailure(failure) {
  const response = failure?.response || failure || {}
  const data = response?.data || failure?.data || {}
  const typedCode = typeof data?.errorCode === 'string'
    ? data.errorCode
    : (typeof data?.code === 'string'
      ? data.code
      : (typeof failure?.errorCode === 'string' ? failure.errorCode : ''))
  const normalizedCode = typedCode.trim()
  if (normalizedCode) return normalizedCode

  const statusCode = Number(
    response?.statusCode ?? response?.status ?? failure?.statusCode ?? failure?.status,
  )
  if (statusCode === 402) return 'insufficient_credits'
  if (statusCode === 408) return 'timeout'
  if (statusCode === 429) return 'rate_limit'
  if (statusCode >= 400) return 'server_error'
  return 'connection_error'
}

// 第一輪就裝不下時，伺服器在同一個錯誤信封（WebSocket error 事件、HTTP 422）裡附上建議：
// 裝得下整張卡的最小檔位，以及用目前檔位精簡常駐設定是否裝得下。對話中途的容量錯誤不帶建議，
// 這裡回 null，畫面維持原本的說法。
export function resolveContextCapacityAdvice(source) {
  const data = source && typeof source === 'object' && source.data && typeof source.data === 'object'
    ? source.data
    : source
  if (!data || typeof data !== 'object') return null
  const type = String(data.error_type || data.errorCode || data.code || data.error || '').trim()
  if (type !== 'context_capacity_exceeded') return null
  const tier = Number(data.required_context_tier)
  const requiredTier = Number.isInteger(tier) && tier >= 1 && tier <= 5 ? tier : null
  const tokens = Number(data.required_context_tokens)
  const requiredTokens = requiredTier && Number.isFinite(tokens) && tokens > 0 ? tokens : null
  const trimFits = data.constant_lore_trim_fits === true
  if (!requiredTier && !trimFits) return null
  return { requiredTier, requiredTokens, trimFits }
}

const CHAT_ERROR_FINISH_REASONS = Object.freeze({
  service_unavailable: 'server_error',
  rate_limit: 'rate_limit',
  model_refused: 'refusal',
  empty_response: 'empty_response',
  server_error: 'server_error',
  connection_error: 'network_error',
  content_filter: 'content_filter_input',
  compact_retryable: 'compact_retryable',
  context_capacity_exceeded: 'context_capacity_exceeded',
  operation_in_progress: 'operation_in_progress',
  mutation_in_progress: 'mutation_in_progress',
  conversation_history_mutation_pending: 'mutation_in_progress',
  rewrite_target_not_persisted: 'conversation_stale',
  rewrite_target_not_latest: 'rewrite_target_not_latest',
  rewrite_target_invalid: 'rewrite_target_invalid',
  continue_target_invalid: 'conversation_stale',
  conversation_stale: 'conversation_stale',
})

export function resolveChatErrorPresentation(errorType, translate) {
  const normalizedType = String(errorType || 'connection_error').trim()
  const normalizedFinishReason = normalizedType === 'http_402'
    ? 'insufficient_credits'
    : normalizedType
  const isCreditFailure = normalizedFinishReason === 'insufficient_credits'
    || normalizedFinishReason === 'quota_exhausted'
  return {
    message: resolveChatErrorMessage(normalizedType, translate),
    finishReason: isCreditFailure
      ? normalizedFinishReason
      : (CHAT_ERROR_FINISH_REASONS[normalizedType] || 'error'),
    action: isCreditFailure ? 'openVip' : '',
  }
}
