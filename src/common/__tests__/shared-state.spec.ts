import { describe, it, expect, vi } from 'vitest'
import { createSharedApi, sharedArgs, sharedResult, sharedError, SHARED_ERROR_CODES } from '../shared-state'
import { SDK_ERROR_CODES } from '../../sandbox/sdk/errors'

const codeOf = async (p: Promise<unknown>) => { try { await p; return 'ok' } catch (e) { return (e as { code?: string }).code } }

describe('共用狀態的參數（兩種 pageMode、沙箱兩端同一套）', () => {
  it('read 收一個 key 或一組 key：去重、最多 16 個；格式不對 INVALID_ARGS', () => {
    expect(sharedArgs('shared.read', ['boss'])).toEqual([['boss']])
    expect(sharedArgs('shared.read', [['p1-4', 'boss', 'p1-4']])).toEqual([['p1-4', 'boss']])
    for (const bad of [[], [[]], ['a b'], [['ok', 3]], [Array.from({ length: 17 }, (_, i) => `k${i}`)]]) {
      expect(() => sharedArgs('shared.read', bad)).toThrow(expect.objectContaining({ code: 'INVALID_ARGS' }))
    }
  })

  it('vote：key 不合格式＝NOT_DECLARED、選項不合格式＝OPTION_INVALID、不是字串＝INVALID_ARGS', () => {
    expect(sharedArgs('shared.vote', ['p1-4', 'b'])).toEqual(['p1-4', 'b'])
    expect(() => sharedArgs('shared.vote', ['~K7Q2M9XA', 'b'])).toThrow(expect.objectContaining({ code: 'NOT_DECLARED' }))
    expect(() => sharedArgs('shared.vote', ['p1-4', '<b>'])).toThrow(expect.objectContaining({ code: 'OPTION_INVALID' }))
    expect(() => sharedArgs('shared.vote', ['p1-4', 2])).toThrow(expect.objectContaining({ code: 'INVALID_ARGS' }))
  })

  it('add：1–1000 的整數；leaderboard 的 limit 1–50，省略是 10', () => {
    expect(sharedArgs('shared.add', ['boss', 5])).toEqual(['boss', 5])
    for (const d of [0, -1, 1.5, 1001, '5', NaN]) expect(() => sharedArgs('shared.add', ['boss', d])).toThrow(expect.objectContaining({ code: 'INVALID_ARGS' }))
    expect(sharedArgs('shared.leaderboard', ['boss'])).toEqual(['boss', 10])
    expect(sharedArgs('shared.leaderboard', ['boss', { limit: 50 }])).toEqual(['boss', 50])
    for (const o of [{ limit: 0 }, { limit: 51 }, { limit: 2.5 }, 'x']) expect(() => sharedArgs('shared.leaderboard', ['boss', o])).toThrow(expect.objectContaining({ code: 'INVALID_ARGS' }))
  })

  it('tallyLink：情境碼照分享情境的規則（SHARE_CONTEXT_INVALID）、投票 key；respond 收選項；results 不收參數', () => {
    expect(sharedArgs('share.tally', ['p1-4.b', 'p1-4'])).toEqual(['p1-4.b', 'p1-4'])
    expect(() => sharedArgs('share.tally', ['~K7Q2M9XA', 'p1-4'])).toThrow(expect.objectContaining({ code: 'SHARE_CONTEXT_INVALID' }))
    expect(() => sharedArgs('share.tally', ['p1-4.b', 'a b'])).toThrow(expect.objectContaining({ code: 'NOT_DECLARED' }))
    expect(sharedArgs('share.respond', ['c'])).toEqual(['c'])
    expect(() => sharedArgs('share.respond', [''])).toThrow(expect.objectContaining({ code: 'OPTION_INVALID' }))
    expect(sharedArgs('share.results', ['ignored'])).toEqual([])
  })

  it('錯誤碼都在沙箱 sdk 的名單裡（不然殼會把它當 NETWORK）', () => {
    for (const c of SHARED_ERROR_CODES) expect(SDK_ERROR_CODES).toContain(c)
  })
})

describe('宿主回來的值只收形狀對的', () => {
  it('read：只收 poll／counter，數字不是非負整數的當 0；壞的 key 丟掉', () => {
    expect(sharedResult('shared.read', {
      'p1-4': { kind: 'poll', counts: { a: 3, b: -1, 'x y': 2 }, total: 3, mine: 'a', extra: 1 },
      boss: { kind: 'counter', total: 42, goal: 100, reachedAt: null, previous: 7, mine: 5 },
      weird: { kind: 'other' },
      'a b': { kind: 'poll', counts: {}, total: 0 },
    })).toEqual({
      'p1-4': { kind: 'poll', counts: { a: 3, b: 0 }, total: 3, mine: 'a' },
      boss: { kind: 'counter', total: 42, goal: 100, reachedAt: null, previous: 7, mine: 5 },
    })
    expect(sharedResult('shared.read', null)).toEqual({})
  })

  it('leaderboard 沒有 mine 就不給；名字不是字串是 null', () => {
    expect(sharedResult('shared.leaderboard', { items: [{ rank: 1, name: '月', value: 9, memberId: 'x' }, { rank: 2, name: 3, value: 4 }] }))
      .toEqual({ items: [{ rank: 1, name: '月', value: 9 }, { rank: 2, name: null, value: 4 }] })
    expect(sharedResult('shared.leaderboard', { items: [], mine: { rank: 4, value: 2 } })).toEqual({ items: [], mine: { rank: 4, value: 2 } })
  })

  it('results 只給情境、投票、總數、各選項（未達門檻 null）、更新日——短碼不給', () => {
    expect(sharedResult('share.results', { items: [{ token: '~K7Q2M9XA', context: 'p1-4.b', pollKey: 'p1-4', total: 2, counts: null, updatedAt: null, expiresAt: 9 }] }))
      .toEqual([{ context: 'p1-4.b', pollKey: 'p1-4', total: 2, counts: null, updatedAt: null }])
    expect(sharedResult('share.tally', 'javascript:alert(1)')).toBeNull()
    expect(sharedResult('share.tally', 'https://sukisuki.ai/cards/1?share=~K7Q2M9XA')).toBe('https://sukisuki.ai/cards/1?share=~K7Q2M9XA')
  })
})

describe('createSharedApi：卡片看到的 shared 與 share 的回流方法', () => {
  it('先驗參數再送；送出去的是整理過的參數，回來的是整理過的值', async () => {
    const send = vi.fn(async (op: string) => (op === 'shared.vote' ? { mine: 'b' } : op === 'share.tally' ? 'https://x.test/c?share=~K7Q2M9XA' : { boss: { kind: 'counter', total: 1 } }))
    const { shared, tally } = createSharedApi(send, sharedError)
    expect(await shared.read('boss')).toEqual({ boss: { kind: 'counter', total: 1 } })
    expect(send).toHaveBeenLastCalledWith('shared.read', [['boss']])
    expect(await shared.vote('p1-4', 'b')).toEqual({ mine: 'b' })
    expect(await tally.tallyLink('p1-4.b', 'p1-4')).toBe('https://x.test/c?share=~K7Q2M9XA')
    expect(await codeOf(shared.add('boss', 0))).toBe('INVALID_ARGS')
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('宿主給不出連結＝HOST_DENIED', async () => {
    const { tally } = createSharedApi(async () => '', sharedError)
    expect(await codeOf(tally.tallyLink('p1-4.b', 'p1-4'))).toBe('HOST_DENIED')
  })
})
