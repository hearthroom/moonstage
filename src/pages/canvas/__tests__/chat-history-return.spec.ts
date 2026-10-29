import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as ownership from '../chat-transport-ownership'
import * as ui from '../chat-operation-ui-state'
import * as first from '../canvas-first-page'
import * as recovery from '../chat-history-recovery'
import { incompleteTerminalHistoryOperation } from '../chat-history-snapshot'

// Exercise the actual page-one response handler, including its asynchronous retry.
// The transport is controlled; mapping, ownership, projections and timers are real.
const canvas = readFileSync(path.resolve('src/pages/canvas/canvas.vue'), 'utf8')
const start = canvas.indexOf('function scheduleHistorySnapshotRefresh(')
const end = canvas.indexOf('\n// 隐藏加载提示', start)
const js = ts.transpileModule(canvas.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const ref = (value: any) => ({ value })
const op = { operationId: 'op', conversationId: 'conv', kind: 'send', state: 'completed', version: 3,
  assistantChatId: 'ai', userChatId: 'user', outputDisposition: 'complete' }
function page(content: string, turnStatus = 'complete') {
  return { statusCode: 200, data: { schemaVersion: 'outcome_v1', operationStatusAvailable: true, operations: [op],
    chats: [{ chatId: 'ai', chatRole: 'AI', chatMessage: content, turnStatus },
      { chatId: 'user', chatRole: 'USER', chatMessage: 'player turn', turnStatus: 'complete' }], hasNextPage: false } }
}
function harness(responses: any[], pending = true) {
  let stored: any = pending ? { operationId: 'op', operationState: 'completed' } : null
  const get = vi.fn(() => {
    const response = responses.shift()
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response)
  })
  const clear = vi.fn((options: any = {}) => { ctx.isStreamActive.value = false; if (!options.preservePersistedOperation) stored = null })
  const ctx: any = {
    ownershipRevision: {value:0},
    ...ownership, ...ui, ...first, ...recovery, incompleteTerminalHistoryOperation,
    ajax: ref({ flag: true, page: 1, rows: 20 }), conversationGeneration: ref(1), conversationId: ref('conv'),
    historyRequestSequence: 0, activeHistoryRequestKey: '', historyRecoveryAttemptedKey: '', historyRecoveryKey: '',
    historySnapshotPollScheduler: ownership.createOperationStatusPollScheduler(),
    pendingChatTurn: pending ? { operationId: 'op', accepted: true } : null,
    pendingResendPayload: ref(null), isResumeInitial: ref(true), userStopRequested: ref(false),
    talkList: ref(pending ? [{ id: 'live', type: 0, content: 'already visible', chatFinish: false }] : []),
    pic: ref(''), userInfo: ref({ avatar: '' }), roleId: ref('card'), contextFootprint: ref(null), responseSettingsVersion: ref(0),
    knownOperations: ref([]), isStreamActive: ref(pending), socket: ref(pending ? {} : null),
    currentChatId: ref('live'), replyContent: ref('already visible'), thinkingContent: ref(''),
    autoScrollEnabled: ref(false), isUserAtBottom: ref(false),
    _this: { requestUrl: { historyMessageList: 'mock-history' }, http: { get } },
    canUseChatOperationOutcome: () => true, unref: (r: any) => r.value, t: (key: string) => key,
    isConversationGenerationCurrent: (g: number) => g === ctx.conversationGeneration.value,
    completeHistoryRequest: (r: any) => {
      if (!recovery.shouldCompleteHistoryRequest({ requestConversationId: r.conversationId, requestKey: r.requestKey,
        currentConversationId: ctx.conversationId.value, activeRequestKey: ctx.activeHistoryRequestKey })) return false
      ctx.activeHistoryRequestKey = ''; ctx.ajax.value.flag = true; return true
    },
    hideLoadTips: vi.fn(), reportConversationActivity: vi.fn(), maybeShowContextFootprintIntro: vi.fn(),
    splitThinkingContent: (s: string) => ({ visibleContent: s, thinkingContent: '' }), cardHandlesTag: () => false,
    clearStreamState: clear, closeWebSocket: vi.fn(() => { ctx.socket.value = null }),
    carryPrepTrailAcrossHistoryRebuild: (rows: any[]) => rows,
    requestPendingOperationReconciliation: vi.fn(), removeResumeHistoryDuplicateByMessageAnchor: vi.fn(),
    upsertPendingAIBubble: vi.fn(), nextBubbleId: () => 'placeholder', reattachRunningOperation: vi.fn(),
    nextTick: (fn: () => void) => fn(), scrollToBottom: vi.fn(), setPageScrollTo: vi.fn(),
    recoverEmptyHistory: () => false, showHistoryLoadFailure: vi.fn(),
    readLsEntry: () => stored, writeLsEntry: (value: any) => { stored = value }, console,
  }
  runInNewContext(js + '\ngetHistoryMsg();', ctx)
  return { ctx, get, clear, stored: () => stored }
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve() }
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('return to a generating card without manual reload', () => {
  it.each(['', 'partial'])('keeps visible output until the final snapshot replaces %j', async content => {
    const app = harness([page(content, 'streaming'), page('full reply')])
    await settle()
    expect(app.ctx.talkList.value[0].content).toBe('already visible')
    expect(app.stored()?.operationId).toBe('op')
    expect(app.ctx.closeWebSocket).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(app.ctx.talkList.value.find((r: any) => r.type === 0)?.content).toBe('full reply')
    expect(app.get).toHaveBeenCalledTimes(2)
    expect(app.ctx.closeWebSocket).toHaveBeenCalledOnce()
    expect(app.stored()).toBeNull()
  })
  it('recovers a cold entry with no local record', async () => {
    const app = harness([page('', 'streaming'), page('full reply')], false)
    await settle()
    expect(app.stored()?.operationId).toBe('op')
    await vi.advanceTimersByTimeAsync(2000)
    expect(app.ctx.talkList.value.find((r: any) => r.type === 0)?.content).toBe('full reply')
    expect(app.stored()).toBeNull()
  })
  it.each([new Error('offline'), { statusCode: 503 }])('retains recovery and retries a failed final history read', async failure => {
    const app = harness([failure, page('full reply')])
    await settle()
    expect(app.stored()?.operationId).toBe('op')
    expect(app.ctx.talkList.value[0].content).toBe('already visible')
    await vi.advanceTimersByTimeAsync(2000)
    expect(app.ctx.talkList.value.find((r: any) => r.type === 0)?.content).toBe('full reply')
    expect(app.stored()).toBeNull()
  })
  it.each(['generation', 'conversation', 'newer-request'])('discards an old retry after %s changes', async changed => {
    const app = harness([page('', 'streaming')])
    await settle()
    if (changed === 'generation') app.ctx.conversationGeneration.value++
    if (changed === 'conversation') app.ctx.conversationId.value = 'another'
    if (changed === 'newer-request') app.ctx.historyRequestSequence++
    await vi.advanceTimersByTimeAsync(2000)
    expect(app.get).toHaveBeenCalledOnce()
    expect(app.clear).not.toHaveBeenCalled()
  })
})
