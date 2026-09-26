/**
 * conversation/start 順便帶回的第一頁歷史（firstPage）能不能直接拿來用。
 *
 * 伺服器在接續既有對話、而且請求帶了 firstPageSize 時，會附上跟 messages 同一份的第一頁；
 * 開場就不必再等一趟 messages。只在「要的正是這個對話的第一頁」時才用：翻到別頁、
 * 對話已經換掉、或回應形狀不對，都照常自己去問。
 */
export function usableFirstPage(preloaded: unknown, page: number, conversationId: string): preloaded is { chats: Array<{ conversationId?: unknown }> } {
  if (!preloaded || typeof preloaded !== 'object' || page !== 1) return false
  const chats = (preloaded as { chats?: unknown }).chats
  if (!Array.isArray(chats)) return false
  return chats.every((c) => String((c as { conversationId?: unknown })?.conversationId ?? '') === conversationId)
}
