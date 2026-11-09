// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  cardStateAt, cardStateMessageId, cardStateUpdate, createCardStateFeed, currentCardState, currentCardStatePayload,
  fillLabel, initialCardState, normalizeCardState, type CardStateRow, type CardStateSnapshot,
} from './card-state'

const snap = (seq: number, data: unknown, source = 'inline'): CardStateSnapshot => ({ data, changes: seq ? [{ op: 'set', path: 'a', old: seq - 1, new: seq }] : [], seq, source })
const ai = (messageId: string, state?: CardStateSnapshot): CardStateRow => ({ messageId, role: 'ai', state: state || null })
const user = (messageId: string): CardStateRow => ({ messageId, role: 'user', state: null })

describe('normalizeCardState', () => {
  it('keeps data, valid changes, rejected, seq and source; rejects non-objects', () => {
    expect(normalizeCardState({ data: { 好感度: 5 }, changes: [{ op: 'set', path: '好感度', old: 4, new: 5, reason: '送花' }, { op: 1 }, 'x'], rejected: [{ path: 'x' }], seq: 3, source: 'agent' }))
      .toEqual({ data: { 好感度: 5 }, changes: [{ op: 'set', path: '好感度', old: 4, new: 5, reason: '送花' }], rejected: [{ path: 'x' }], seq: 3, source: 'agent' })
    expect(normalizeCardState({ data: null })).toEqual({ data: null, changes: [], seq: 0, source: '' })
    expect(normalizeCardState(null)).toBeNull()
    expect(normalizeCardState({ changes: [] })).toBeNull()
    expect(normalizeCardState([1])).toBeNull()
  })

  it('initial state and message id preference (settled server id over a temporary bubble id)', () => {
    expect(initialCardState(undefined)).toBeNull()
    expect(initialCardState({ a: 1 })).toEqual({ data: { a: 1 }, changes: [], seq: 0, source: 'seed' })
    expect(cardStateMessageId({ id: 'tmp-1', assistantChatId: '9001' })).toBe('9001')
    expect(cardStateMessageId({ id: 'tmp-1', chatId: '9001' })).toBe('9001')
    expect(cardStateMessageId({ id: 42 })).toBe('42')
  })
})

describe('current value, of() and the updated line', () => {
  const rows = [ai('1', snap(0, { a: 0 }, 'seed')), user('2'), ai('3', snap(1, { a: 1 })), user('4'), ai('5'), user('6'), ai('7')]

  it('current is the latest snapshot, else the initial value, else null', () => {
    expect(currentCardState(rows, null)).toMatchObject({ messageId: '3', state: { data: { a: 1 } } })
    expect(currentCardStatePayload([user('1')], initialCardState({ a: 9 }))).toEqual({ messageId: null, data: { a: 9 }, changes: [] })
    expect(currentCardState([user('1')], null)).toBeNull()
  })

  it('of(): own snapshot, else the latest earlier one; unknown ids are null', () => {
    expect(cardStateAt(rows, '1', null)).toEqual({ messageId: '1', data: { a: 0 }, changes: [] })
    expect(cardStateAt(rows, '2', null)?.messageId).toBe('1')
    expect(cardStateAt(rows, '6', null)?.messageId).toBe('3')
    expect(cardStateAt(rows, 'nope', null)).toBeNull()
    expect(cardStateAt([user('u')], 'u', initialCardState({ x: 1 }))).toEqual({ messageId: null, data: { x: 1 }, changes: [] })
  })

  it('payloads are copies: an author mutating one does not change the timeline', () => {
    const p = cardStateAt(rows, '3', null)!
    ;(p.data as Record<string, number>).a = 99
    expect(cardStateAt(rows, '3', null)!.data).toEqual({ a: 1 })
  })

  it('updated line counts AI replies after the snapshot; opening values say so', () => {
    expect(cardStateUpdate(rows)).toEqual({ kind: 'ago', n: 2 })
    expect(cardStateUpdate(rows.slice(0, 3))).toEqual({ kind: 'latest' })
    expect(cardStateUpdate(rows.slice(0, 5))).toEqual({ kind: 'ago', n: 1 })
    expect(cardStateUpdate(rows.slice(0, 2))).toEqual({ kind: 'opening' })
    expect(cardStateUpdate([user('1')])).toEqual({ kind: 'opening' })
  })

  it('fillLabel fills named placeholders and leaves unknown ones', () => {
    expect(fillLabel('{n} 輪前更新', { n: 3 })).toBe('3 輪前更新')
    expect(fillLabel('第 {line} 行：{message} {x}', { line: 2, message: 'oops' })).toBe('第 2 行：oops {x}')
  })
})

describe('createCardStateFeed (state:change sequence)', () => {
  const base = [ai('1', snap(0, { a: 0 }, 'seed')), user('2'), ai('3', snap(1, { a: 1 }))]

  it('first sync emits every snapshot oldest first; unchanged timeline emits nothing', () => {
    const feed = createCardStateFeed()
    expect(feed.update(base).map((p) => p.messageId)).toEqual(['1', '3'])
    expect(feed.update(base)).toEqual([])
    expect(feed.latest()).toEqual({ messageId: '3', data: { a: 1 }, changes: [{ op: 'set', path: 'a', old: 0, new: 1 }] })
  })

  it('a new turn emits only the new snapshot; turns without values emit nothing', () => {
    const feed = createCardStateFeed()
    feed.update(base)
    expect(feed.update([...base, user('4'), ai('5')])).toEqual([])
    expect(feed.update([...base, user('4'), ai('5'), user('6'), ai('7', snap(2, { a: 2 }))]).map((p) => p.messageId)).toEqual(['7'])
  })

  it('loading an older page (rows prepended) emits nothing', () => {
    const feed = createCardStateFeed()
    feed.update(base)
    expect(feed.update([ai('0a', snap(0, { a: -1 })), user('0b'), ...base])).toEqual([])
  })

  it('regenerate / rollback / delete (latest snapshot gone) re-emits the whole timeline, latest last', () => {
    const feed = createCardStateFeed()
    feed.update(base)
    const regenerated = [...base.slice(0, 2), ai('3b', snap(1, { a: 5 }))]
    expect(feed.update(regenerated).map((p) => p.messageId)).toEqual(['1', '3b'])
    const rolledBack = base.slice(0, 2)
    expect(feed.update(rolledBack).map((p) => p.messageId)).toEqual(['1'])
    expect(feed.latest()?.messageId).toBe('1')
  })

  it('reset (conversation switch) forgets what was sent', () => {
    const feed = createCardStateFeed()
    feed.update(base)
    feed.reset()
    expect(feed.latest()).toBeNull()
    expect(feed.update(base).map((p) => p.messageId)).toEqual(['1', '3'])
  })
})
