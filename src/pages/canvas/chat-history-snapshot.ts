import { isChatOperationTerminal, normalizeChatOperationStatus, type ChatOperationStatus } from './chat-transport-ownership'

/** A terminal read and its message rows may straddle the final append/commit.
 * Do not discard a live reply or its recovery identity on that mixed snapshot.
 * Only inspect operations anchored on this page; older-page omissions are normal.
 */
export function incompleteTerminalHistoryOperation(response: any): ChatOperationStatus | null {
  if (response?.schemaVersion !== 'outcome_v1' || response.operationStatusAvailable === false
    || !Array.isArray(response.chats) || !Array.isArray(response.operations)) return null
  for (const input of response.operations) {
    const status = normalizeChatOperationStatus(input)
    if (!status || !isChatOperationTerminal(status) || !status.assistantChatId || status.kind === 'backward') continue
    const row = response.chats.find((chat: any) => String(chat.chatId || '') === status.assistantChatId)
    if (row?.turnStatus === 'streaming' || row?.isComplete === false) return status
    if (!row && status.state === 'completed' && status.outputDisposition === 'complete'
      && response.chats.some((chat: any) => String(chat.chatId || '') === status.userChatId)) return status
  }
  return null
}
