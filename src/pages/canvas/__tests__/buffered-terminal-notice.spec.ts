import { describe, expect, it, vi } from 'vitest'
import * as transport from '../chat-transport-ownership'
const notifyBufferedTerminal = (transport as any).notifyBufferedTerminal
import { mergeChatHistoryOperationProjections, projectionFinishReason } from '../chat-transport-ownership'

const terminal = { operationId: 'op-1', kind: 'send', state: 'failed_retryable', version: 3, sourceChatId: 'u-1', nonStreaming: true, finishReason: 'content_filter', reasonCode: 'no_final_answer', outputDisposition: 'none' }

describe('buffered empty terminal notice', () => {
  it.each(['content_filter', 'refusal', 'length', 'interrupted', 'user_stop'])('keeps the known %s cause with no final body', (finishReason) => {
    expect(projectionFinishReason({ ...terminal, finishReason, state: finishReason === 'user_stop' ? 'stopped' : terminal.state } as any)).toBe(finishReason)
  })
  it('notifies once across terminal replay and polling', async () => {
    const seen = new Set<string>(), notify = vi.fn()
    notifyBufferedTerminal(terminal as any, '', seen, notify)
    notifyBufferedTerminal({ ...terminal, version: 4 } as any, '', seen, notify)
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
