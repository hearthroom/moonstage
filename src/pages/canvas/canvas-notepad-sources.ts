/**
 * 手帳的字數，以及「從其他對話複製」能選的來源。
 */

/** 照伺服器的算法數字：一個字元算一個，emoji 不會因為佔兩個 UTF-16 單位就算兩個。 */
export function notepadLength(text: string): number {
  return Array.from(text || '').length
}

export type NotepadSourceRow = { key: string; conversationId: string; name: string }

/**
 * 手帳綁的是對話，不是角色：同一張卡開了好幾個存檔，每一個都有自己的手帳，
 * 所以這裡一段對話一列，只排除玩家現在開著的這一段。
 */
export function notepadSourceRowsOf(list: any[], currentConversationId: string): NotepadSourceRow[] {
  const current = String(currentConversationId || '')
  return (Array.isArray(list) ? list : [])
    .map((row: any) => {
      const conversationId = String(row?.conversationId || '')
      return {
        key: conversationId,
        conversationId,
        name: String(row?.roleName || row?.conversationName || ''),
      }
    })
    .filter((row) => row.conversationId && row.conversationId !== current)
}
