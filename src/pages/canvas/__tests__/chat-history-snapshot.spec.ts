import { describe, expect, it } from 'vitest'
import { incompleteTerminalHistoryOperation } from '../chat-history-snapshot'

const operation = { operationId: 'op', kind: 'send', state: 'completed', assistantChatId: 'ai', userChatId: 'user', outputDisposition: 'complete' }
const user = { chatId: 'user', chatRole: 'USER', chatMessage: 'hello' }
const snapshot = (chats: any[], operations = [operation]) => ({ schemaVersion: 'outcome_v1', operationStatusAvailable: true, chats, operations })

describe('history completion requires the final message snapshot', () => {
  it('detects an empty or missing reply paired with a completed operation', () => {
    expect(incompleteTerminalHistoryOperation(snapshot([user]))?.operationId).toBe('op')
    expect(incompleteTerminalHistoryOperation(snapshot([user, { chatId: 'ai', chatRole: 'AI', chatMessage: '', turnStatus: 'streaming' }]))?.operationId).toBe('op')
  })
  it('detects partial content still marked streaming, even though the operation completed', () => {
    expect(incompleteTerminalHistoryOperation(snapshot([user, { chatId: 'ai', chatRole: 'AI', chatMessage: 'half', turnStatus: 'streaming' }]))?.operationId).toBe('op')
  })
  it('accepts complete body or thinking-only output, and honest zero-output failures', () => {
    for (const content of [{ chatMessage: 'full' }, { contentThinking: 'reasoning' }]) {
      expect(incompleteTerminalHistoryOperation(snapshot([user, { chatId: 'ai', chatRole: 'AI', turnStatus: 'complete', ...content }]))).toBeNull()
    }
    expect(incompleteTerminalHistoryOperation(snapshot([user], [{ ...operation, assistantChatId: '', state: 'failed_retryable', outputDisposition: 'none' }]))).toBeNull()
  })
  it('does not fetch missing rows on older pages or unavailable/legacy projections', () => {
    expect(incompleteTerminalHistoryOperation(snapshot([]))).toBeNull()
    expect(incompleteTerminalHistoryOperation({ ...snapshot([user]), operationStatusAvailable: false })).toBeNull()
    expect(incompleteTerminalHistoryOperation({ chats: [user] })).toBeNull()
  })
})
