// 回覆偏好裡的「預設」：玩家自己的預設（在宿主站的「我的預設」建立或匯入）綁到這段對話，
// 或綁到這張卡之後的新存檔。預設與原本的文風二擇一：綁了預設，文風就由預設決定，
// 玩家原本選的文風不清掉，停用預設後恢復。篇幅照舊由滑桿決定，預設碰不到。
//
// 沒有「全部的卡都用這個」：預設是玩家主動為某張卡選的（owner 2026-10-29）。
// 綁定的版本讀不到時明說讀不到，不悄悄換回卡片原本的文風。

export type PresetScope = 'conversation' | 'card'

export interface PresetBinding {
 mode: 'card_default' | 'revision'
 presetId: string | null
 revisionId: string | null
 bindingVersion: number
 title: string
 version: number
 state: 'ready' | 'unavailable'
}

export interface PresetChoice {
 id: string
 title: string
 headRevisionId: string
 version: number
 recommendedModels: string[]
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function readBinding(raw: unknown): PresetBinding {
 const r = (raw ?? {}) as Record<string, unknown>
 const mode = r.mode
 if (mode !== 'card_default' && mode !== 'revision') throw new Error('Unsupported preset binding')
 const bindingVersion = Number(r.bindingVersion)
 if (!Number.isSafeInteger(bindingVersion) || bindingVersion < 0) throw new Error('Invalid preset binding')
 const revisionId = mode === 'revision' ? str(r.revisionId) : ''
 if (mode === 'revision' && !revisionId) throw new Error('Invalid preset binding')
 return {
  mode, bindingVersion,
  presetId: mode === 'revision' ? str(r.presetId) || null : null,
  revisionId: revisionId || null,
  title: str(r.presetTitle),
  version: Number(r.version) || 0,
  state: r.state === 'unavailable' ? 'unavailable' : 'ready',
 }
}

/** 可以選用的預設：封存的不再列出（已經綁著的對話照常運作）。 */
export function readPresetChoices(raw: unknown): PresetChoice[] {
 const items = Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: Record<string, unknown>[] }).items : []
 return items.filter((p) => !p.archived && str(p.id) && str(p.headRevisionId)).map((p) => ({
  id: str(p.id), title: str(p.title), headRevisionId: str(p.headRevisionId), version: Number(p.version) || 0,
  recommendedModels: Array.isArray(p.recommendedModels) ? (p.recommendedModels as unknown[]).map(str).filter(Boolean) : [],
 }))
}

/** 作者存了更新的版本：對話不會自己跟著換，給玩家一顆鍵自己換。 */
export function newerVersion(binding: PresetBinding | null, list: PresetChoice[]): PresetChoice | null {
 if (!binding || binding.mode !== 'revision' || !binding.presetId) return null
 const head = list.find((p) => p.id === binding.presetId)
 return head && head.version > binding.version && head.headRevisionId !== binding.revisionId ? head : null
}

export type PresetFailure = 'busy' | 'conflict' | 'archived' | 'capacity' | 'loadFailed' | 'unknown' | 'failed'

/** 套用失敗時玩家接下來能做什麼。送出後沒收到回應是「結果未知」，不是失敗。 */
export function presetFailure(err: unknown): PresetFailure {
 const e = err as { statusCode?: number; data?: { error?: string; reason?: string } }
 // 沒有狀態碼（斷線）或請求層的負值（逾時 -9999）：送出去了沒有不知道
 if (!e || typeof e.statusCode !== 'number' || e.statusCode <= 0) return 'unknown'
 const code = e.data?.error ?? '', reason = e.data?.reason ?? ''
 if (reason === 'operation_active') return 'busy'
 if (reason === 'preset_archived') return 'archived'
 if (code === 'preset_revision_unavailable') return 'loadFailed'
 if (code === 'context_capacity' || reason === 'context_capacity') return 'capacity'
 if (e.statusCode === 409) return 'conflict'
 return 'failed'
}

/**
 * 預設決定文風的時候，存其他偏好不能帶文風那三個鍵——帶了（就算是 null）伺服器會當成要改文風而拒絕。
 */
export function lockedPatch<T extends Record<string, unknown>>(patch: T, locked: boolean): T {
 if (!locked) return patch
 const { style: _s, customStyle: _c, styleNote: _n, ...rest } = patch
 return rest as T
}

export const newOperationKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** 畫布向頁面要的預設能力；頁面在伺服器說這段對話能用預設時才給。 */
export interface PresetApi {
 conversation(conversationId: string): Promise<unknown>
 card(): Promise<unknown>
 list(): Promise<unknown>
 apply(scope: PresetScope, conversationId: string, revisionId: string | null, expectedVersion: number, key: string): Promise<unknown>
 /** 模型代碼 → 站上公開的名稱；查不到就顯示代碼 */
 modelName?(value: string): string
 /** 到宿主站的「我的預設」；宿主沒給就不畫這個連結 */
 manage?(): void
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 送出後沒收到回應：用同一把冪等鍵再送，伺服器回原本那次的結果，不會重複套用。 */
export async function applyOnce(call: (key: string) => Promise<unknown>, onUnknown: () => void, tries = 3): Promise<unknown> {
 const key = newOperationKey()
 for (let attempt = 0; ; attempt++) {
  try { return await call(key) } catch (err) {
   if (presetFailure(err) !== 'unknown' || attempt >= tries) throw err
   onUnknown()
   await wait(1500 * (attempt + 1))
  }
 }
}
