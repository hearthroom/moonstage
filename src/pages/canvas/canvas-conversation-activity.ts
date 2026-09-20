/** Host notification based only on persisted history, never an opening or optimistic bubble. */
export function createConversationActivityReporter(
  emit: (activity: { roleId: string; conversationId: string }) => void,
) {
  const reported = new Map<string, string>()
  return (roleId: string, conversationId: string, chats: unknown) => {
    if (!roleId || !conversationId || !Array.isArray(chats)) return
    const row = chats.find(chat => {
      if (!chat || !chat.chatId || chat.isSummary) return false
      if (chat.chatRole === 'USER') return true
      // A generated continuation can have no player row. Greetings have no
      // generation provenance; empty failed assistant shells are not activity.
      const generated = Number(chat.inputTokens) > 0 || chat.hasContextUsage === true
        || (typeof chat.model === 'string' && chat.model.trim().length > 0)
      const content = String(chat.chatMessage || '').trim() || String(chat.contentThinking || '').trim()
      return chat.chatRole === 'AI' && generated && Boolean(content)
    })
    if (!row) return
    const key = JSON.stringify([roleId, conversationId])
    if (reported.get(key) === String(row.chatId)) return
    reported.set(key, String(row.chatId))
    emit({ roleId, conversationId })
  }
}
