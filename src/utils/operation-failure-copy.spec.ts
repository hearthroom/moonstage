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
    expect(operationFailureSub('internal_error', key)).toBe('systemMsg.ourErrorSub')
    expect(operationFailureSub('internal_error', key, { agent: true })).toBe('systemMsg.ourErrorSub')
  })

  it('puts a broken model connection on the model, not the player', () => {
    for (const cause of ['service_unavailable', 'upstream_timeout', 'stream_incomplete']) {
      expect(operationFailureSub(cause, key)).toBe('systemMsg.upstreamSub')
      expect(operationFailureSub(cause, key, { agent: true })).toBe('multiPass.upstreamSub')
    }
  })

  it('points the player at what they can fix', () => {
    expect(operationFailureSub('insufficient_credits', key, { agent: true })).toBe('chat.manageCredits')
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
