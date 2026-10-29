import { describe, expect, it } from 'vitest'

import {
  resolveChatErrorTypeFromFailure,
  resolveChatErrorMessage,
  resolveChatErrorPresentation,
  resolveContextCapacityAdvice,
} from './chat-error-message.js'

const translate = (key: string) => key

describe('resolveChatErrorMessage', () => {
  it('preserves typed business failures rejected by the shared HTTP interceptor', () => {
    expect(resolveChatErrorTypeFromFailure({
      statusCode: 409,
      data: {
        errorCode: 'rewrite_target_not_latest',
        error: 'This conversation changed.',
      },
    })).toBe('rewrite_target_not_latest')

    expect(resolveChatErrorTypeFromFailure({
      response: {
        status: 400,
        data: { errorCode: 'rewrite_target_invalid' },
      },
    })).toBe('rewrite_target_invalid')
  })

  it('distinguishes HTTP platform failures from actual network failures', () => {
    expect(resolveChatErrorTypeFromFailure({ statusCode: 500, data: {} })).toBe('server_error')
    expect(resolveChatErrorTypeFromFailure({ statusCode: 402, data: {} })).toBe('insufficient_credits')
    expect(resolveChatErrorTypeFromFailure(new Error('network disconnected'))).toBe('connection_error')
  })

  it('maps insufficient credits to the localized top-up message', () => {
    expect(resolveChatErrorMessage('insufficient_credits', translate)).toBe('chat.point_no_tips')
  })

  it('maps exhausted free quota to the localized quota message', () => {
    expect(resolveChatErrorMessage('quota_exhausted', translate)).toBe('chat.freeQuotaExhaustedTitle')
  })

  it('preserves known chat errors and falls back for unknown types', () => {
    expect(resolveChatErrorMessage('empty_response', translate)).toBe('error.emptyResponse')
    expect(resolveChatErrorMessage('unexpected_error', translate)).toBe('error.serverError')
  })

  it('maps compact_retryable to its own honest recap message, not the generic connection error', () => {
    expect(resolveChatErrorMessage('compact_retryable', translate)).toBe('error.compactRetryable')
  })

  it('keeps mutation_in_progress on the localized rollback-in-progress notice', () => {
    expect(resolveChatErrorMessage('mutation_in_progress', translate)).toBe('chat.rollbackInProgressNotice')
  })

  it('maps every typed pre-admission failure to an honest visible SystemMessage reason', () => {
    expect(resolveChatErrorPresentation('operation_in_progress', translate)).toMatchObject({
      message: 'chat.operationPending',
      finishReason: 'operation_in_progress',
    })
    expect(resolveChatErrorPresentation('mutation_in_progress', translate)).toMatchObject({
      message: 'chat.rollbackInProgressNotice',
      finishReason: 'mutation_in_progress',
    })
    expect(resolveChatErrorPresentation('conversation_history_mutation_pending', translate)).toMatchObject({
      message: 'chat.rollbackInProgressNotice',
      finishReason: 'mutation_in_progress',
    })
    expect(resolveChatErrorPresentation('rewrite_target_not_persisted', translate)).toMatchObject({
      message: 'error.replyNotGenerated',
      finishReason: 'conversation_stale',
    })
    expect(resolveChatErrorPresentation('continue_target_invalid', translate)).toMatchObject({
      message: 'error.replyNotGenerated',
      finishReason: 'conversation_stale',
    })
    expect(resolveChatErrorPresentation('rewrite_target_not_latest', translate)).toMatchObject({
      message: 'chat.editLatestAIOnly',
      finishReason: 'rewrite_target_not_latest',
    })
    expect(resolveChatErrorPresentation('rewrite_target_invalid', translate)).toMatchObject({
      message: 'chat.rewriteTargetChanged',
      finishReason: 'rewrite_target_invalid',
    })
  })

  it('keeps an unknown typed failure visible instead of creating a hidden system-only row', () => {
    expect(resolveChatErrorPresentation('unexpected_error', translate)).toMatchObject({
      message: 'error.serverError',
      finishReason: 'error',
    })
  })

  it('[B2] maps conversation_stale to its own honest retry message in all five locales', () => {
    expect(resolveChatErrorMessage('conversation_stale', translate)).toBe('error.replyNotGenerated')

    const expected = {
      "zh-Hant": "對話狀態已變更，請重新載入對話後再試。",
      "zh-Hans": "对话状态已变更，请重新加载对话后再试。",
      "en": "The conversation has changed. Reload it and try again.",
      "ja": "会話の状態が変わりました。再読み込みしてからお試しください。",
      "ko": "대화 상태가 변경됐어요. 대화를 다시 불러온 뒤 시도해 보세요."
}
    Object.entries(expected).forEach(([locale, message]) => {
      expect(require(`../locale/${locale}.json`)['error.replyNotGenerated']).toBe(message)
    })
  })

  // 施工單：內容審查拒絕精準分揀與用戶提示（ContentModerationErrorSurfacing）
  // §3.3：error_type='content_filter' 走專屬提示（可換說法/換模型），不再落回
  // 通用「連線錯誤」。
  it('maps content_filter to its own actionable message, not the generic connection error', () => {
    expect(resolveChatErrorMessage('content_filter', translate)).toBe('error.contentFilter')
  })

  it('keeps user-actionable failures distinct from platform failures', () => {
    expect(resolveChatErrorPresentation('insufficient_credits', translate)).toEqual({
      message: 'chat.point_no_tips',
      finishReason: 'insufficient_credits',
      action: 'openVip',
    })
    expect(resolveChatErrorPresentation('quota_exhausted', translate)).toEqual({
      message: 'chat.freeQuotaExhaustedTitle',
      finishReason: 'quota_exhausted',
      action: 'openVip',
    })
    expect(resolveChatErrorPresentation('model_refused', translate)).toEqual({
      message: 'error.modelRefused',
      finishReason: 'refusal',
      action: '',
    })
    expect(resolveChatErrorPresentation('content_filter', translate)).toEqual({
      message: 'error.contentFilter',
      finishReason: 'content_filter_input',
      action: '',
    })
    expect(resolveChatErrorPresentation('rate_limit', translate).finishReason).toBe('rate_limit')
    expect(resolveChatErrorPresentation('connection_error', translate).finishReason).toBe('network_error')
    expect(resolveChatErrorPresentation('server_error', translate).finishReason).toBe('server_error')
  })
})

it('explains capacity failures without presenting them as a network retry', () => {
 expect(resolveChatErrorMessage('context_capacity_exceeded', translate)).toBe('error.contextCapacityExceeded')
 expect(resolveChatErrorPresentation('context_capacity_exceeded', translate).finishReason).toBe('context_capacity_exceeded')
})

// 第一輪就裝不下時，伺服器會說哪種玩法裝得下；同一個信封走 WebSocket error 事件與 HTTP 422。
describe('resolveContextCapacityAdvice', () => {
  const envelope = {
    error: 'context_capacity_exceeded',
    code: 'context_capacity_exceeded',
    error_type: 'context_capacity_exceeded',
    required_context_tier: 3,
    required_context_tokens: 128000,
    constant_lore_trim_fits: true,
  }

  it('keeps the recommended tier, its size and whether trimming fits', () => {
    expect(resolveContextCapacityAdvice(envelope)).toEqual({ requiredTier: 3, requiredTokens: 128000, trimFits: true })
  })

  it('offers trimming alone when no tier fits the whole card', () => {
    const { required_context_tier: _t, required_context_tokens: _k, ...trimOnly } = envelope
    expect(resolveContextCapacityAdvice(trimOnly)).toEqual({ requiredTier: null, requiredTokens: null, trimFits: true })
  })

  it('offers raising alone when trimming does not fit', () => {
    expect(resolveContextCapacityAdvice({ ...envelope, constant_lore_trim_fits: false }))
      .toEqual({ requiredTier: 3, requiredTokens: 128000, trimFits: false })
  })

  it('reads the same envelope from an HTTP 422 body', () => {
    expect(resolveContextCapacityAdvice({ statusCode: 422, data: envelope })).toEqual({ requiredTier: 3, requiredTokens: 128000, trimFits: true })
  })

  it('returns null for mid-conversation capacity errors and for other errors', () => {
    expect(resolveContextCapacityAdvice({ error_type: 'context_capacity_exceeded', code: 'context_capacity_exceeded' })).toBe(null)
    expect(resolveContextCapacityAdvice({ ...envelope, error_type: 'rate_limit', code: 'rate_limit', error: 'rate_limit' })).toBe(null)
    expect(resolveContextCapacityAdvice({ ...envelope, required_context_tier: 9, constant_lore_trim_fits: false })).toBe(null)
    expect(resolveContextCapacityAdvice(null)).toBe(null)
  })
})

describe('resolveCreditsShortfall', () => {
  it('reads credits_needed and credits_available from the insufficient_credits envelope', async () => {
    const { resolveCreditsShortfall } = await import('./chat-error-message')
    expect(resolveCreditsShortfall({ error_type: 'insufficient_credits', credits_needed: 300, credits_available: 120 })).toEqual({ needed: 300, available: 120 })
    expect(resolveCreditsShortfall({ data: { code: 'insufficient_credits', credits_needed: 300, credits_available: 0 } })).toEqual({ needed: 300, available: 0 })
  })
  it('returns null for other errors or missing numbers', async () => {
    const { resolveCreditsShortfall } = await import('./chat-error-message')
    expect(resolveCreditsShortfall({ error_type: 'rate_limit', credits_needed: 1 })).toBeNull()
    expect(resolveCreditsShortfall({ error_type: 'insufficient_credits' })).toBeNull()
    expect(resolveCreditsShortfall(null)).toBeNull()
  })
})

// 選用的預設在送出時才被擋：上游回 preset_invalid＋reason，或綁定版本讀不到。
// 講成預設的事，不講成伺服器壞了；玩家可以換模型或在回覆偏好裡停用預設。
it('names a preset failure at send time instead of calling it a server error', () => {
 const translate = (k: string) => k
 const unsupported = { statusCode: 422, data: { error: 'preset_invalid', reason: 'preset_model_setting_unsupported' } }
 expect(resolveChatErrorTypeFromFailure(unsupported)).toBe('preset_model_setting_unsupported')
 expect(resolveChatErrorMessage('preset_model_setting_unsupported', translate)).toBe('responseSettings.preset.modelSettingUnsupported')
 const missing = { statusCode: 409, data: { error: 'preset_revision_unavailable' } }
 expect(resolveChatErrorTypeFromFailure(missing)).toBe('preset_revision_unavailable')
 expect(resolveChatErrorMessage('preset_revision_unavailable', translate)).toBe('responseSettings.preset.loadFailed')
 // 其他 preset_invalid 細碼不冒充成這一句
 expect(resolveChatErrorTypeFromFailure({ statusCode: 422, data: { error: 'preset_invalid', reason: 'preset_macro_invalid' } })).toBe('server_error')
})
