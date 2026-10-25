/** Public author history values contain opaque keys, never host credentials. */
export interface HistoryCapabilities { version: 1; available: boolean; reason: string }
export interface HistoryOptions { cursor?: string; revision?: string; limit?: number; content?: boolean }
export interface HistoryItem { id: string; order: string; role: 'user'|'ai'; kind: 'opening'|'message'; state: 'streaming'|'complete'|'partial'|'failed'; complete: boolean; contentVersion: string; content?: string }
export interface HistoryPage { conversationKey: string; revision: string; items: HistoryItem[]; complete: boolean; cursor: string|null }
export interface HistoryChangeItem { op: 'add'|'update'|'remove'; id: string; replacementId?: string }
export interface HistoryChange { conversationKey: string|null; previousRevision: string|null; revision: string|null; kind: 'append'|'update'|'remove'|'truncate'|'replace'|'reset'|'unavailable'; changes: HistoryChangeItem[]; part: number; final: boolean }
export interface HistoryApi { capabilities(): HistoryCapabilities; list(options?: HistoryOptions): Promise<HistoryPage>; onChange(callback: (event: HistoryChange)=>void): ()=>void }
export interface HistoryChangesPage { conversationKey: string; revision: string; events: HistoryChange[]; reset: boolean; complete: boolean; cursor: string|null }
export const historyError = (code: string) => Object.assign(new Error(code), { code })
export const historyRevision = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)
export function historyOptions(input: HistoryOptions = {}): HistoryOptions {
 if(!input||typeof input!=='object'||Array.isArray(input))throw historyError('HISTORY_CURSOR_INVALID')
 const out: HistoryOptions = {}
 if (input.cursor !== undefined) { if (typeof input.cursor !== 'string' || input.cursor.length > 2048) throw historyError('HISTORY_CURSOR_INVALID'); out.cursor=input.cursor }
 if (input.revision !== undefined) { if (!historyRevision(input.revision)) throw historyError('HISTORY_CURSOR_INVALID'); out.revision=input.revision }
 if (input.limit !== undefined) { if (!Number.isInteger(input.limit)||input.limit<1||input.limit>200) throw historyError('HISTORY_LIMIT'); out.limit=input.limit }
 if (input.content !== undefined) { if (typeof input.content!=='boolean') throw historyError('HISTORY_CURSOR_INVALID'); out.content=input.content }
 return out
}
