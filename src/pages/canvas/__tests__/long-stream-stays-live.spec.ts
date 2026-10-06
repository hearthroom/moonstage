import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  decideReconnectStep,
  decideRunningOperationReattach,
  decideStreamResume,
  dropSupersededLiveAssistantRows,
  liveOperationFromHistory,
  markStreamEntryAccepted,
  shouldResetReconnectBudget,
} from '../chat-transport-ownership'

// 一輪沒有總時長上限（owner 2026-10-06）：模型還在吐字，就只有玩家自己按停止能停。
// 畫面要一直顯示「正在生成」——離開再回來、換一台裝置打開、中途斷線幾次都一樣。
// 實例：2026-09-30 兩輪在慢線路上吐了約 70 分鐘。

const CHAT_VUE = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')

function sliceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start)
  expect(from, `missing ${start}`).toBeGreaterThanOrEqual(0)
  const to = source.indexOf(end, from + start.length)
  expect(to, `missing ${end} after ${start}`).toBeGreaterThan(from)
  return source.slice(from, to)
}

const OP = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'

describe('伺服器說還在跑：本機紀錄過期也要接回串流', () => {
  const now = Date.parse('2026-10-06T12:00:00Z')
  const accepted = markStreamEntryAccepted(
    { operationId: OP, clientOperationId: 'chat-x' },
    { streamId: OP, lastEventId: 812, now: now - 70 * 60 * 1000 },
  )

  it('過期的本機紀錄先去問伺服器（這一步本來就對）', () => {
    const decision = decideStreamResume(accepted, now)
    expect(decision.kind).toBe('byOperationId')
    expect(decision.operationId).toBe(OP)
  })

  it('伺服器回 generating、頁面沒有連線 → 從頭重播接回，不是只輪詢', () => {
    const decision = decideRunningOperationReattach({
      status: { operationId: OP, state: 'generating', kind: 'send' },
      socketAttached: false,
      attachedStreamId: '',
      lastEventId: 0,
      hasLiveBubble: false,
    })
    expect(decision).toEqual({ kind: 'reattach', streamId: OP, lastEventId: 0, fullReplay: true })
  })

  it('accepted（還在準備）也算還在跑', () => {
    const decision = decideRunningOperationReattach({
      status: { operationId: OP, state: 'accepted', kind: 'send' },
      socketAttached: false,
    })
    expect(decision.kind).toBe('reattach')
  })

  it('同一輪已經有畫面上的氣泡與事件序號 → 從斷點接著收，不重播', () => {
    const decision = decideRunningOperationReattach({
      status: { operationId: OP, state: 'generating', kind: 'send' },
      socketAttached: false,
      attachedStreamId: OP,
      lastEventId: 812,
      hasLiveBubble: true,
    })
    expect(decision).toEqual({ kind: 'reattach', streamId: OP, lastEventId: 812, fullReplay: false })
  })

  it('終態、倒回、已有連線、正在重連、玩家按了停止 → 都不接', () => {
    const base = { status: { operationId: OP, state: 'generating', kind: 'send' }, socketAttached: false }
    for (const state of ['completed', 'failed_retryable', 'failed_terminal', 'stopped']) {
      expect(decideRunningOperationReattach({ ...base, status: { ...base.status, state } }).kind).toBe('none')
    }
    expect(decideRunningOperationReattach({ ...base, status: { ...base.status, kind: 'backward' } }).kind).toBe('none')
    expect(decideRunningOperationReattach({ ...base, socketAttached: true }).kind).toBe('none')
    expect(decideRunningOperationReattach({ ...base, reconnectPending: true }).kind).toBe('none')
    expect(decideRunningOperationReattach({ ...base, userStopRequested: true }).kind).toBe('none')
    expect(decideRunningOperationReattach({ ...base, status: null }).kind).toBe('none')
  })

  it('權威讀取：先判終態，再判「還在跑就接回」，最後才輪到五分鐘放手', () => {
    const reconciliation = sliceBetween(
      CHAT_VUE,
      'function requestAuthoritativeOperationReconciliation',
      'function requestPendingOperationReconciliation',
    )
    const terminal = reconciliation.indexOf('isChatOperationTerminal(recorded)')
    const reattach = reconciliation.indexOf('reattachRunningOperation(recorded,', terminal)
    const expiry = reconciliation.indexOf('isChatOperationVisibleOutcomeExpired(', terminal)
    expect(terminal).toBeGreaterThanOrEqual(0)
    expect(reattach).toBeGreaterThan(terminal)
    expect(expiry).toBeGreaterThan(reattach)
  })

  it('接回時用 resumeStreamId 開連線，並把串流與停止鍵的狀態帶回來', () => {
    const fn = sliceBetween(CHAT_VUE, 'function reattachRunningOperation(', 'function requestAuthoritativeOperationReconciliation')
    expect(fn).toContain('decideRunningOperationReattach(')
    expect(fn).toContain('resumeStreamId: decision.streamId')
    expect(fn).toContain('lastEventId: decision.lastEventId')
    expect(fn).toContain('isStreamActive.value = true')
    expect(fn).toContain('streamId.value = decision.streamId')
  })
})

describe('沒有本機紀錄（換裝置、清過儲存）也要接回', () => {
  it('從歷史回應的 operations 找出還在跑的那一輪', () => {
    const live = liveOperationFromHistory({
      schemaVersion: 'outcome_v1',
      operations: [
        { operationId: 'old', state: 'completed', kind: 'send' },
        { operationId: OP, state: 'generating', kind: 'send', assistantChatId: 'a-1' },
      ],
    })
    expect(live?.operationId).toBe(OP)
    expect(live?.assistantChatId).toBe('a-1')
  })

  it('全是終態、只有倒回、或沒有 operations → 沒有要接的', () => {
    expect(liveOperationFromHistory({ schemaVersion: 'outcome_v1', operations: [{ operationId: 'x', state: 'completed', kind: 'send' }] })).toBeNull()
    expect(liveOperationFromHistory({ schemaVersion: 'outcome_v1', operations: [{ operationId: 'x', state: 'accepted', kind: 'backward' }] })).toBeNull()
    expect(liveOperationFromHistory({ chats: [] })).toBeNull()
    expect(liveOperationFromHistory(null)).toBeNull()
  })

  it('歷史第一頁載完、頁面沒在收串流時，用伺服器那一輪接回', () => {
    const history = sliceBetween(CHAT_VUE, 'function getHistoryMsg(', 'function hideLoadTips(')
    expect(history).toContain('liveOperationFromHistory(res.data)')
    expect(history).toContain("reattachRunningOperation(liveOperation, 'history')")
  })

  it('歷史裡那則「還在寫」的 AI 列交給串流氣泡，不重複出現', () => {
    const rows = [
      { id: 'u-1', type: 1, content: 'hi' },
      { id: 'a-1', type: 0, content: '寫到一半', liveTurn: true, chatFinish: true },
      { id: 'bubble-9', type: 0, content: '', chatLoading: true, chatFinish: false },
    ]
    expect(dropSupersededLiveAssistantRows(rows).map((row: any) => row.id)).toEqual(['u-1', 'bubble-9'])
    // 已經寫完的 AI 列不動。
    const done = [{ id: 'a-0', type: 0, content: '完整', chatFinish: true }]
    expect(dropSupersededLiveAssistantRows(done)).toEqual(done)
  })

  it('歷史列記下 turnStatus，串流中時把還在寫的那列交給氣泡', () => {
    const history = sliceBetween(CHAT_VUE, 'function getHistoryMsg(', 'function hideLoadTips(')
    expect(history).toContain("liveTurn: isAI && turnStatus === 'streaming'")
    expect(history).toContain('dropSupersededLiveAssistantRows(')
  })
})

describe('重連次數按每次斷線算，伺服器還在跑就一直重試', () => {
  const delays = [1000, 2000, 5000]

  it('前三次照退避', () => {
    expect(decideReconnectStep({ attempt: 0, delays, backendStillWorking: false })).toEqual({ kind: 'retry', delayMs: 1000, nextAttempt: 1 })
    expect(decideReconnectStep({ attempt: 2, delays, backendStillWorking: false })).toEqual({ kind: 'retry', delayMs: 5000, nextAttempt: 3 })
  })

  it('用完三次：伺服器還在跑 → 以最長間隔繼續；不在跑 → 放手', () => {
    expect(decideReconnectStep({ attempt: 3, delays, backendStillWorking: true })).toEqual({ kind: 'retry', delayMs: 5000, nextAttempt: 3 })
    expect(decideReconnectStep({ attempt: 9, delays, backendStillWorking: true })).toEqual({ kind: 'retry', delayMs: 5000, nextAttempt: 3 })
    expect(decideReconnectStep({ attempt: 3, delays, backendStillWorking: false })).toEqual({ kind: 'give_up' })
  })

  it('重連成功（收到 streamMeta 或內容）就把次數歸零', () => {
    for (const name of ['streamMeta', 'answer', 'thinking', 'prepStep']) {
      expect(shouldResetReconnectBudget(name)).toBe(true)
    }
    for (const name of ['ready', 'error', 'operationStatus', 'noActiveStream', '']) {
      expect(shouldResetReconnectBudget(name)).toBe(false)
    }
  })

  it('重連排程走 decideReconnectStep，收到進度時歸零', () => {
    const reconnect = sliceBetween(CHAT_VUE, 'function attemptReconnectWithResume()', 'function closeWebSocket()')
    expect(reconnect).toContain('decideReconnectStep(')
    expect(reconnect).toContain('isChatOperationBackendStillWorking(')
    const handler = sliceBetween(CHAT_VUE, 'const handlerMessage = (res', 'function handleOwnedSocketTermination')
    expect(handler).toContain('shouldResetReconnectBudget(event.event)')
    expect(handler).toContain('reconnectAttempt.value = 0')
  })
})
