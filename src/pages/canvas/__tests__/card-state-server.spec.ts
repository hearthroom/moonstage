// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mergeChatHistoryOperationProjections, normalizeChatOperationStatus } from '../chat-transport-ownership'
import { cardStateFromServer, cardStateRowsKey, cardStateRowsOf, sandboxCardStateOf } from '../canvas-card-state'

const cs = (seq: number, data: unknown) => ({ data, changes: [{ op: 'set', path: 'a', old: 0, new: 1 }], seq, source: 'inline' })

describe('伺服器的 cardState 進到畫面', () => {
  it('operationStatus 帶的 cardState 留下（一輪跑完）；沒帶或壞掉就沒有這一欄', () => {
    const status = normalizeChatOperationStatus({ operationId: 'op1', state: 'completed', kind: 'send', cardState: cs(2, { a: 1 }) })
    expect(status?.cardState).toEqual({ data: { a: 1 }, changes: [{ op: 'set', path: 'a', old: 0, new: 1 }], seq: 2, source: 'inline' })
    expect(normalizeChatOperationStatus({ operationId: 'op1', state: 'completed', kind: 'send' })).not.toHaveProperty('cardState')
    expect(normalizeChatOperationStatus({ operationId: 'op1', state: 'completed', kind: 'send', cardState: 'x' })).not.toHaveProperty('cardState')
  })

  it('歷史的 operations[]：那一列自己沒帶數值才補；列上帶的為準', () => {
    const rows = [
      { id: 'u1', type: 1, content: 'hi' },
      { id: 'a1', type: 0, content: 'yo', chatFinish: true },
      { id: 'a2', type: 0, content: 'yo2', chatFinish: true, cardState: cardStateFromServer(cs(5, { own: true })) },
    ]
    const merged = mergeChatHistoryOperationProjections(rows, {
      schemaVersion: 'outcome_v1',
      operations: [
        { operationId: 'op1', state: 'completed', kind: 'send', assistantChatId: 'a1', userChatId: 'u1', cardState: cs(3, { fromOp: true }) },
        { operationId: 'op2', state: 'completed', kind: 'send', assistantChatId: 'a2', cardState: cs(4, { fromOp: true }) },
      ],
    })
    expect(merged[1].cardState).toMatchObject({ data: { fromOp: true }, seq: 3 })
    expect(merged[2].cardState).toMatchObject({ data: { own: true }, seq: 5 })
    expect(merged[0]).not.toHaveProperty('cardState')
  })

  it('時間線：跟 HUD 同一個略過條件；鍵只看帶數值的列；給殼的那一份帶宿主 id', () => {
    const items = [
      { id: 1, type: 0, cardState: cardStateFromServer(cs(0, { a: 0 })) },
      { id: 2, type: 1 },
      { id: 'tmp-9', chatId: '3', type: 0, cardState: cardStateFromServer(cs(1, { a: 1 })) },
      { id: 4, type: 0, systemOnly: true },
      { id: 5, type: 0, hidden: true },
    ]
    const rows = cardStateRowsOf(items as never[], (item) => !!(item as { hidden?: boolean }).hidden)
    expect(rows.map((r) => [r.messageId, r.role, !!r.state])).toEqual([['1', 'ai', true], ['2', 'user', false], ['3', 'ai', true], ['4', 'system', false]])
    expect(cardStateRowsKey(rows)).toBe('1#0|3#1')
    expect(sandboxCardStateOf(items[2] as never)).toEqual({ messageId: '3', data: { a: 1 }, changes: [{ op: 'set', path: 'a', old: 0, new: 1 }], seq: 1, source: 'inline' })
    expect(sandboxCardStateOf(items[1] as never)).toBeNull()
  })
})
