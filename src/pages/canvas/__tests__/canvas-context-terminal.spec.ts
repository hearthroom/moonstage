import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref, unref } from 'vue'
import { findOperationCandidate } from '../chat-operation-ui-state'
import {
  normalizeChatOperationStatus, shouldApplyOperationStatus,
  mergeOperationStatusIntoStreamEntry, isChatOperationTerminal, projectionFinishReason,
} from '../chat-transport-ownership'

// Execute the actual canvas completion handlers, not a reimplementation of their
// behavior. History stays pending: the new reply must expose usage before reload.
const canvas = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
const handlers = canvas.slice(canvas.indexOf('function operationKindFromServer('),
  canvas.indexOf('\nfunction ', canvas.indexOf('function handleOperationStatusEvent(') + 1))
const js = ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

function harness() {
  const row = ref<any>({ id: 'pending-ai', operationBubbleId: 'pending-ai', type: 0,
    content: 'Synthetic reply', chatLoading: true, chatFinish: false })
  const getHistoryMsg = vi.fn(() => new Promise(() => {}))
  const clearStreamState = vi.fn()
  const bindings: Record<string, any> = {
    pendingChatTurn: { aiBubbleId: 'pending-ai', operationId: 'op-1', operationState: 'generating', operationVersion: 1 },
    conversationId: ref('conv-1'), talkList: ref([row.value]), unref,
    normalizeChatOperationStatus, shouldApplyOperationStatus,
    mergeOperationStatusIntoStreamEntry, isChatOperationTerminal, projectionFinishReason,
    findOperationCandidate, readLsEntry: () => null, writeLsEntry: vi.fn(),
    chatTransport: { noteServerStreamProgress: vi.fn() }, STREAM_ENTRY_VERSION: 1,
    hasRenderableAssistantOutput: (body: string) => !!body,
    commitPendingChatOperationAfterVisibleDone: vi.fn(),
    clearStreamCache: vi.fn(), clearStreamState, removeOrphanPlaceholder: vi.fn(),
    closeWebSocket: vi.fn(), bumpConversationGeneration: vi.fn(),
    ajax: ref({ flag: false, page: 2 }), getHistoryMsg,
  }
  for (const key of ['lastFinishReason', 'tempContent', 'replyContent', 'thinkingContent',
    'pendingMessageMeta', 'currentChatId', 'pendingResendPayload', 'isResumeInitial', 'userStopRequested']) {
    bindings[key] = ref('')
  }
  const handle = new Function(...Object.keys(bindings), js + '\nreturn handleOperationStatusEvent;')(...Object.values(bindings))
  return { handle, row, getHistoryMsg, clearStreamState }
}

const terminal = { operationId: 'op-1', conversationId: 'conv-1', kind: 'send',
  state: 'completed', version: 2, assistantChatId: 'reply-1', outputDisposition: 'adopted',
  hasContextUsage: true, model: 'test-model',
  contextUsage: { inputTokens: 200, outputTokens: 30, cachedTokens: 20, cacheWriteTokens: 0 } }

describe('context usage on the newly completed reply', () => {
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
    expect(app.getHistoryMsg).toHaveBeenCalledOnce()
  })

  it('keeps usage through repeated normalization without inventing missing counts', () => {
    expect(normalizeChatOperationStatus(normalizeChatOperationStatus(terminal))).toMatchObject({
      hasContextUsage: true, model: 'test-model', contextUsage: terminal.contextUsage,
    })
    expect(normalizeChatOperationStatus({ ...terminal, contextUsage: null })?.contextUsage).toBeUndefined()
  })
})
