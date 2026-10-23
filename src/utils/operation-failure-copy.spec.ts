import { describe, expect, it } from 'vitest'
import { operationFailureSub, operationFailureTitle } from './operation-failure-copy'
import zhHant from '../locale/zh-Hant.json'
import zhHans from '../locale/zh-Hans.json'
import en from '../locale/en.json'
import ja from '../locale/ja.json'
import ko from '../locale/ko.json'

const key = (k: string) => k

// 玩家要看得出這次是誰的問題、自己能做什麼：模型那邊、我們這邊，還是他自己能處理的事。
describe('operation failure copy says whose problem it was', () => {
  it('names our own failure and apologises', () => {
    expect(operationFailureTitle('internal_error', key)).toBe('systemMsg.ourError')
    expect(operationFailureSub('internal_error', key, {settled:true,chargeCredits:0})).toBe('systemMsg.ourErrorSub')
    expect(operationFailureSub('internal_error', key, { agent: true,settled:true,chargeCredits:0 })).toBe('systemMsg.ourErrorSub')
  })

  it('puts a broken model connection on the model, not the player', () => {
    for (const cause of ['service_unavailable', 'upstream_timeout', 'stream_incomplete']) {
      expect(operationFailureSub(cause, key)).toBe('systemMsg.upstreamSub')
      expect(operationFailureSub(cause, key, { agent: true })).toBe('multiPass.upstreamSub')
    }
  })

  it('points the player at what they can fix', () => {
    expect(operationFailureTitle('content_filter', key)).toBe('systemMsg.filterUnknown')
    expect(operationFailureSub('content_filter', key, { agent: true })).toBe('systemMsg.filterUnknownSub')
    expect(operationFailureSub('insufficient_credits', key, { agent: true })).toBe('chat.creditsNotEnoughSub')
    expect(operationFailureSub('context_capacity_exceeded', key, { agent: true })).toBe('error.contextCapacityExceeded')
  })

  it('leaves causes it cannot explain to the existing subtitle', () => {
    for (const cause of ['', 'empty_response', 'rate_limit', 'made_up', undefined, 7]) {
      expect(operationFailureSub(cause, key)).toBe('')
    }
  })

  it('has the new copy in every locale', () => {
    for (const locale of [zhHant, zhHans, en, ja, ko] as Array<Record<string, string>>) {
      for (const k of ['systemMsg.ourError', 'systemMsg.ourErrorSub', 'systemMsg.upstreamSub', 'multiPass.upstreamSub']) {
        expect(locale[k], k).toBeTruthy()
      }
    }
  })
})

it('uses localized causes without confusing tool failures with player network errors', () => {
  for (const locale of [zhHant, zhHans, en, ja, ko]) {
    const t = (k: string) => (locale as any)[k]
    const titles = ['tool_rejections', 'upstream_timeout', 'stream_incomplete', 'stopped'].map((cause) => operationFailureTitle(cause, t))
    expect(titles.every((title) => typeof title === 'string' && !!title)).toBe(true)
    expect(new Set(titles).size).toBe(4)
    expect(titles).not.toContain(t('systemMsg.networkError'))
    for (const cause of [undefined, 'other', 'private error text', 'toString', '__proto__']) expect(operationFailureTitle(cause, t)).toBe('')
    for (const cause of ['toString', '__proto__', 'private error text']) expect(operationFailureSub(cause, t)).toBe('')
  }
})

// 內容限制停止的兩個出口（任務 2026-10-23-content-filter-stop-actions）：說明句跟卡上的鍵吃同一個判斷。
describe('content restriction copy follows the actions on the card', () => {
  it('unknown output stop: suggests turning streaming off only when that action is on the card', () => {
    expect(operationFailureSub('content_filter', key, { filterReason: 'unknown', offersStreamOff: true })).toBe('systemMsg.filterUnknownSubStream')
    expect(operationFailureSub('content_filter', key, { offersStreamOff: true, canSwitch: false })).toBe('systemMsg.filterUnknownSubStreamNoSwitch')
    expect(operationFailureSub('content_filter', key, { streamingOff: true, canSwitch: true })).toBe('systemMsg.filterUnknownSubSwitch')
    expect(operationFailureSub('content_filter', key, { streamingOff: true, canSwitch: false })).toBe('systemMsg.filterUnknownSub')
    expect(operationFailureSub('content_filter', key, {})).toBe('systemMsg.filterUnknownSub')
  })
  it('the streaming options never change another reason', () => {
    expect(operationFailureSub('content_filter', key, { filterReason: 'safety', offersStreamOff: true, streamingOff: true })).toBe('systemMsg.filterSafetySub')
  })
  it('input policy has one explanation whatever the buttons, including the legacy input-side cause', () => {
    for (const canSwitch of [true, false]) {
      expect(operationFailureSub('content_filter', key, { filterReason: 'input_policy', canSwitch })).toBe('systemMsg.filterInputPolicySub')
      expect(operationFailureSub('content_filter_input', key, { canSwitch })).toBe('systemMsg.filterInputPolicySub')
    }
    expect(operationFailureTitle('content_filter_input', key)).toBe('systemMsg.filterInputPolicy')
  })
  it('input policy after a switch from the card: says the new lane or model is ready to resend', () => {
    expect(operationFailureSub('content_filter', key, { filterReason: 'input_policy', switchedTo: 'lane' })).toBe('systemMsg.filterInputPolicySubSwitchedLane')
    expect(operationFailureSub('content_filter', key, { filterReason: 'input_policy', switchedTo: 'model' })).toBe('systemMsg.filterInputPolicySubSwitchedModel')
    expect(operationFailureSub('content_filter', key, { filterReason: 'unknown', switchedTo: 'lane' })).toBe('systemMsg.filterUnknownSub')
  })
  it('input policy with the traditional resend on the card: the explanation mentions it; a switch still wins', () => {
    expect(operationFailureSub('content_filter', key, { filterReason: 'input_policy', offersTraditional: true })).toBe('systemMsg.filterInputPolicySubTraditional')
    expect(operationFailureSub('content_filter_input', key, { offersTraditional: true })).toBe('systemMsg.filterInputPolicySubTraditional')
    expect(operationFailureSub('content_filter', key, { filterReason: 'input_policy', offersTraditional: true, switchedTo: 'lane' })).toBe('systemMsg.filterInputPolicySubSwitchedLane')
    expect(operationFailureSub('content_filter', key, { filterReason: 'unknown', offersTraditional: true })).toBe('systemMsg.filterUnknownSub')
  })
  it('input policy after a traditional resend was blocked again: says it was tried; a switch still wins', () => {
    expect(operationFailureSub('content_filter', key, { filterReason: 'input_policy', traditionalFailed: true })).toBe('systemMsg.filterInputPolicySubTraditionalFailed')
    expect(operationFailureSub('content_filter', key, { filterReason: 'input_policy', traditionalFailed: true, switchedTo: 'model' })).toBe('systemMsg.filterInputPolicySubSwitchedModel')
    expect(operationFailureSub('content_filter', key, { filterReason: 'unknown', traditionalFailed: true })).toBe('systemMsg.filterUnknownSub')
  })
  it('every locale has the new keys and no longer carries the input-policy no-switch variant', () => {
    const keys = ['systemMsg.filterUnknownSubStream', 'systemMsg.filterUnknownSubStreamNoSwitch', 'systemMsg.filterUnknownSubSwitch',
      'chat.filterStopStreamingRetry', 'chat.retryAsIs', 'chat.streamingTurnedOff', 'chat.streamingTurnOffFailed',
      'chat.editFilteredMessage', 'chat.switchLane', 'chat.resendNewLane', 'chat.resendNewModel', 'systemMsg.filterInputPolicy', 'systemMsg.filterInputPolicySub',
      'systemMsg.filterInputPolicySubSwitchedLane', 'systemMsg.filterInputPolicySubSwitchedModel',
      'chat.resendTraditional', 'systemMsg.filterInputPolicySubTraditional', 'systemMsg.filterInputPolicySubTraditionalFailed']
    for (const locale of [zhHant, zhHans, en, ja, ko] as Array<Record<string, string>>) {
      for (const k of keys) expect(locale[k], k).toBeTruthy()
      expect(locale['systemMsg.filterInputPolicySubNoSwitch']).toBeUndefined()
    }
  })
})
