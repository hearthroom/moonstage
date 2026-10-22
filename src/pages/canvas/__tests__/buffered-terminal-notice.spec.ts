import { describe, expect, it, vi } from 'vitest'
import * as transport from '../chat-transport-ownership'
const notifyBufferedTerminal = (transport as any).notifyBufferedTerminal
import { mergeChatHistoryOperationProjections, projectionFinishReason } from '../chat-transport-ownership'

const terminal = { operationId: 'op-1', kind: 'send', state: 'failed_retryable', version: 3, sourceChatId: 'u-1', nonStreaming: true, finishReason: 'content_filter', reasonCode: 'no_final_answer', outputDisposition: 'none' }

describe('buffered empty terminal notice', () => {
  it.each(['content_filter', 'refusal', 'length', 'interrupted', 'user_stop'])('keeps the known %s cause with no final body', (finishReason) => {
    expect(projectionFinishReason({ ...terminal, finishReason, state: finishReason === 'user_stop' ? 'stopped' : terminal.state } as any)).toBe(finishReason)
  })
  // 內容限制家族的卡本身就在畫面上、字完整，頂部提示只是重複（任務 2026-10-23-content-filter-stop-actions）；
  // 其他原因照舊通知，所以這裡用一個非內容限制的原因量「只通知一次」。
  it('notifies once across terminal replay and polling', async () => {
    const seen = new Set<string>(), notify = vi.fn()
    const upstream = { ...terminal, finishReason: 'server_error' }
    notifyBufferedTerminal(upstream as any, '', seen, notify)
    notifyBufferedTerminal({ ...upstream, version: 4 } as any, '', seen, notify)
    expect(notify).toHaveBeenCalledOnce()
  })
  it.each([
    { finishReason: 'content_filter' },
    { finishReason: 'content_filter', filterReason: 'input_policy' },
    { finishReason: 'content_filter_input' },
    { finishReason: 'refusal' },
    { finishReason: 'stop', failureCause: 'content_filter' },
  ])('content restrictions leave the explanation to the card: %j', (over) => {
    const notify = vi.fn()
    notifyBufferedTerminal({ ...terminal, ...over } as any, '', new Set(), notify)
    expect(notify).not.toHaveBeenCalled()
  })
  it.each(['server_error', 'length', 'interrupted'])('other buffered failures still notify: %s', (finishReason) => {
    const notify = vi.fn()
    notifyBufferedTerminal({ ...terminal, finishReason } as any, '', new Set(), notify)
    expect(notify).toHaveBeenCalledOnce()
  })
  it.each([
    { ...terminal, state: 'running' }, { ...terminal, state: 'complete' },
    { ...terminal, nonStreaming: false }, { ...terminal, agentTurn: true },
  ])('leaves other modes and non-terminal states unchanged: %j', async (status) => {
    const notify = vi.fn()
    notifyBufferedTerminal(status as any, '', new Set(), notify)
    expect(notify).not.toHaveBeenCalled()
  })
  it('uses the existing reply status when a partial body was delivered', async () => {
    const notify = vi.fn()
    notifyBufferedTerminal(terminal as any, 'received prefix', new Set(), notify)
    expect(notify).not.toHaveBeenCalled()
  })
  it.each(['stopped', 'interrupted'])('keeps a persistent %s reason for a buffered no-body turn', (state) => {
    const rows = mergeChatHistoryOperationProjections([{ id: 'u-1', chatId: 'u-1', type: 1, content: 'Continue' }], {
      schemaVersion: 'outcome_v1', operationStatusAvailable: true,
      operations: [{ ...terminal, state, finishReason: state === 'stopped' ? 'user_stop' : 'interrupted' }],
    })
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ systemOnly: true, finishReason: state === 'stopped' ? 'user_stop' : 'interrupted' })
  })
})
