import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref, unref } from 'vue'
import { operationFailureTitle } from '@/utils/operation-failure-copy'
import { findOperationCandidate, nextBackwardHistorySnapshot } from '../chat-operation-ui-state'
import {
  normalizeChatOperationStatus, shouldApplyOperationStatus,
  mergeOperationStatusIntoStreamEntry, isChatOperationTerminal, projectionFinishReason,
  notifyBufferedTerminal, isBufferedTerminalFailure,
} from '../chat-transport-ownership'

// Execute the actual canvas completion handlers, not a reimplementation of their
// behavior. History stays pending: the new reply must expose usage before reload.
const canvas = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
const handlers = canvas.slice(canvas.indexOf('function operationKindFromServer('),
  canvas.indexOf('\nfunction ', canvas.indexOf('function handleOperationStatusEvent(') + 1))
const snapshotHandler = canvas.slice(canvas.indexOf('function applyBackwardHistorySnapshot('), canvas.indexOf('function backwardStorageKey('))
const js = ts.transpileModule(snapshotHandler + handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

function harness() {
  const row = ref<any>({ id: 'pending-ai', operationBubbleId: 'pending-ai', type: 0,
    content: 'Synthetic reply', chatLoading: true, chatFinish: false })
  const getHistoryMsg = vi.fn(() => new Promise(() => {}))
  const clearStreamState = vi.fn()
  const bindings: Record<string, any> = {
    pendingChatTurn: { aiBubbleId: 'pending-ai', operationId: 'op-1', operationState: 'generating', operationVersion: 1 },
    conversationId: ref('conv-1'), talkList: ref([row.value]), unref,
    backwardHistorySnapshot: ref({ conversationId: 'conv-1', historyEpoch: 1, nextSeq: 1 }),
    nextBackwardHistorySnapshot,
    normalizeChatOperationStatus, shouldApplyOperationStatus,
    mergeOperationStatusIntoStreamEntry, isChatOperationTerminal, projectionFinishReason,
    notifyBufferedTerminal, isBufferedTerminalFailure,
    uni: { showToast: vi.fn() }, t: (key: string) => key,
    operationFailureTitle,
    getSystemMsgLabel: new Function('t', canvas.slice(canvas.indexOf('function getSystemMsgLabel('), canvas.indexOf('function getSystemMsgSub(')) + '\nreturn getSystemMsgLabel;')((key: string) => key),
    findOperationCandidate, readLsEntry: () => null, writeLsEntry: vi.fn(),
    chatTransport: { noteServerStreamProgress: vi.fn() }, STREAM_ENTRY_VERSION: 1,
    hasRenderableAssistantOutput: (body: string) => !!body,
    commitPendingChatOperationAfterVisibleDone: vi.fn(),
    clearStreamCache: vi.fn(), clearStreamState, removeOrphanPlaceholder: vi.fn(),
    closeWebSocket: vi.fn(), bumpConversationGeneration: vi.fn(),
    ajax: ref({ flag: false, page: 2 }), getHistoryMsg,
    refreshContextRing: vi.fn(), panel: ref({ sheet: '' }),
    loadContextBreakdown: vi.fn(), loadMemory: vi.fn(),
  }
  for (const key of ['lastFinishReason', 'tempContent', 'replyContent', 'thinkingContent',
    'pendingMessageMeta', 'currentChatId', 'pendingResendPayload', 'isResumeInitial', 'userStopRequested']) {
    bindings[key] = ref('')
  }
  const handle = new Function(...Object.keys(bindings), js + '\nreturn handleOperationStatusEvent;')(...Object.values(bindings))
  return { handle, row, getHistoryMsg, clearStreamState, bindings }
}

const terminal = { operationId: 'op-1', conversationId: 'conv-1', kind: 'send',
  historyEpoch: 2, nextSeq: 5, startHistoryEpoch: 1, startNextSeq: 1,
  state: 'completed', version: 2, assistantChatId: 'reply-1', outputDisposition: 'adopted',
  hasContextUsage: true, model: 'test-model',
  contextUsage: { inputTokens: 200, outputTokens: 30, cachedTokens: 20, cacheWriteTokens: 0 } }

describe('context usage on the newly completed reply', () => {
  it('executes the buffered empty-reply toast through the actual authoritative terminal handler', () => {
    const app = harness()
    app.row.value.content = ''
    const status = { ...terminal, nonStreaming: true, state: 'failed_retryable', version: 3,
      finishReason: 'content_filter', failureCause: 'content_filter', outputDisposition: 'none' }
    app.handle(status)
    expect(app.bindings.uni.showToast).toHaveBeenCalledWith({ title: 'systemMsg.filterUnknown', icon: 'error' })
    app.handle(status)
    expect(app.bindings.uni.showToast).toHaveBeenCalledOnce()
  })
  // 選單裡「這一輪的用量」看的是列上的 hasContextUsage 與 chatId：剛收尾的那則不必重新整理就要有。
  it.each(['stream', 'polled', 'wrapped'] as const)('%s completion marks the reply as measured without history or page reload', async (path) => {
    const app = harness()
    expect(app.row.value.hasContextUsage).toBeUndefined()
    const event = path === 'polled' ? normalizeChatOperationStatus(terminal)
      : path === 'wrapped' ? { schemaVersion: 'outcome_v1', operation: terminal } : terminal
    expect(() => app.handle(event)).not.toThrow()
    await nextTick()
    expect(app.row.value).toMatchObject({ chatFinish: true, chatLoading: false,
      hasContextUsage: true, inputTokens: 200, chatId: 'reply-1', model: 'test-model' })
    expect(app.clearStreamState).toHaveBeenCalledOnce()
    expect(app.clearStreamState).toHaveBeenCalledWith({ preservePersistedOperation: true })
    expect(app.getHistoryMsg).toHaveBeenCalledOnce()
    // The page-one request remains unresolved: the terminal metadata itself
    // must make a first rollback use the current timeline.
    expect(app.bindings.backwardHistorySnapshot.value).toEqual({
      conversationId: 'conv-1', historyEpoch: 2, nextSeq: 5,
    })
  })

  // 輸入框旁的小圓環看最新一輪：伺服器確認這一輪結束時重讀，不必等玩家離開再進來。
  it('re-reads the composer ring once the server confirms the turn ended', () => {
    const app = harness()
    app.handle(terminal)
    expect(app.bindings.refreshContextRing).toHaveBeenCalledOnce()
    expect(app.bindings.loadContextBreakdown).not.toHaveBeenCalled()
  })

  it('reloads an open usage or memory sheet so it shows the turn that just ended', () => {
    for (const sheet of ['context-breakdown', 'memory']) {
      const app = harness()
      app.bindings.panel.value.sheet = sheet
      app.handle(terminal)
      expect(app.bindings.loadContextBreakdown).toHaveBeenCalledTimes(sheet === 'context-breakdown' ? 1 : 0)
      expect(app.bindings.loadMemory).toHaveBeenCalledTimes(sheet === 'memory' ? 1 : 0)
    }
  })

  it('keeps usage through repeated normalization without inventing missing counts', () => {
    expect(normalizeChatOperationStatus(normalizeChatOperationStatus(terminal))).toMatchObject({
      hasContextUsage: true, model: 'test-model', contextUsage: terminal.contextUsage,
    })
    expect(normalizeChatOperationStatus({ ...terminal, contextUsage: null })?.contextUsage).toBeUndefined()
  })
})
