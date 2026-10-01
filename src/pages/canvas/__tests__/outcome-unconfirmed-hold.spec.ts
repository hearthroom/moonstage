import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createOutcomeUnconfirmedHold } from '../outcome-unconfirmed-hold'

const LIMIT = 5 * 60 * 1000
const MIN = 60 * 1000

describe('outcome-unconfirmed hold', () => {
  it('holds an in-progress turn until the limit, then lets it through', () => {
    const hold = createOutcomeUnconfirmedHold<object>(LIMIT)
    const turn = {}
    expect(hold.shouldHold(turn, 0)).toBe(true)
    expect(hold.shouldHold(turn, 4 * MIN)).toBe(true)
    expect(hold.shouldHold(turn, 5 * MIN)).toBe(false)
  })

  it('never holds when no turn is in progress', () => {
    const hold = createOutcomeUnconfirmedHold<object>(LIMIT)
    expect(hold.shouldHold(null, 0)).toBe(false)
  })

  // 上一輪壓過一次、之後正常完成；隔了五分鐘以上的下一輪不能一開口就宣告。
  it('starts a fresh hold for a new turn instead of inheriting the old start time', () => {
    const hold = createOutcomeUnconfirmedHold<object>(LIMIT)
    expect(hold.shouldHold({}, 0)).toBe(true)
    const next = {}
    expect(hold.shouldHold(next, 20 * MIN)).toBe(true)
    expect(hold.shouldHold(next, 24 * MIN)).toBe(true)
    expect(hold.shouldHold(next, 25 * MIN)).toBe(false)
  })

  it('restarts the clock after reset', () => {
    const hold = createOutcomeUnconfirmedHold<object>(LIMIT)
    const turn = {}
    hold.shouldHold(turn, 0)
    hold.reset()
    expect(hold.shouldHold(turn, 6 * MIN)).toBe(true)
  })
})

describe('canvas wiring', () => {
  const chat = fs.readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')

  it('gates the announcement with the per-turn hold', () => {
    const start = chat.indexOf('function announceOutcomeUnconfirmed')
    const body = chat.slice(start, chat.indexOf('\nfunction ', start + 1))
    expect(body).toContain('outcomeUnconfirmedHold.shouldHold(pendingChatTurn, Date.now())')
    expect(chat).not.toContain('outcomeUnconfirmedSuppressedAt')
  })

  // 整理劇情跑一兩分鐘，伺服器在這段期間還沒寫任何東西。compacting 就是伺服器活著的
  // 證據；不算進去的話，15 秒等不到「已寫入」就會開始追問結果，最後跳出「結果還在確認中」。
  it('counts compacting as server progress, like prepStep', () => {
    // 檔案裡還有別的 case 'compacting'（送出鍵狀態），從 compactDone 往回找才是事件那一段。
    const end = chat.indexOf("case 'compactDone':")
    const body = chat.slice(chat.lastIndexOf("case 'compacting':", end), end)
    expect(body).toContain("store.commit('setIsCompacting', true)")
    expect(body).toContain("chatTransport.noteServerStreamProgress(pendingChatTurn, 'durable_operation')")
  })
})
