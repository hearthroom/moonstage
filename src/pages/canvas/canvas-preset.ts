// 回覆偏好裡的「自訂預設」：玩家自己的預設（在宿主站的「我的預設」建立或匯入）套用到整張卡，
// 這張卡的所有存檔從下一次回覆開始都用它，取消也是整張卡（owner 2026-10-30；原本的「這段對話／
// 這張卡的新存檔」兩種範圍已經拿掉，伺服器對舊寫法回 preset_scope_changed）。
// 套用後搶話、文風、敘事視角、劇情節奏、破甲強度由預設決定（伺服器的 presetLocked 說了算），
// 玩家原本的選擇不清掉，取消後恢復。篇幅照舊由滑桿決定，預設碰不到。
//
// 沒有「全部的卡都用這個」：預設是玩家主動為某張卡選的（owner 2026-10-29）。
// 預設不留版本、跟著作者走（owner 2026-10-30）：卡綁的是預設本身，作者存檔後下一次回覆就用新內容，畫布不顯示版本。
// 套用的預設讀不到時明說讀不到，不悄悄換回原本的設定。

export interface PresetBinding {
 mode: 'card_default' | 'preset'
 presetId: string | null
 bindingVersion: number
 title: string
 state: 'ready' | 'unavailable'
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function readBinding(raw: unknown): PresetBinding {
 const r = (raw ?? {}) as Record<string, unknown>
 // 'revision' 是跟著作者走之前的伺服器回的：同一個意思（綁著某份預設），換版期間兩種都收
 const mode = r.mode === 'revision' ? 'preset' : r.mode
 if (mode !== 'card_default' && mode !== 'preset') throw new Error('Unsupported preset binding')
 const bindingVersion = Number(r.bindingVersion)
 if (!Number.isSafeInteger(bindingVersion) || bindingVersion < 0) throw new Error('Invalid preset binding')
 const presetId = mode === 'preset' ? str(r.presetId) : ''
 if (mode === 'preset' && !presetId) throw new Error('Invalid preset binding')
 return {
  mode, bindingVersion,
  presetId: presetId || null,
  title: str(r.presetTitle),
  state: r.state === 'unavailable' ? 'unavailable' : 'ready',
 }
}

/**
 * 選擇器與預設庫的一列：自己的（/presets 給 id）、喜愛與用過、熱門、預設庫（給 presetId）都讀成同一個形狀。
 * listed:false＝作者改回私人或被下架；喜愛或用過的人照常可以套用（owner 2026-10-30）。
 */
export interface PresetRow {
 purpose: '' | 'general' | 'specific'
 id: string
 title: string
 author: string
 usesLast7d: number
 fresh: boolean
 listed: boolean
 favorited: boolean
 lastAppliedAt: string
 mine: boolean
 recommendedModels: string[]
}

const models = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(str).filter(Boolean) : [])

export function readPresetRows(raw: unknown): PresetRow[] {
 const items = Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: Record<string, unknown>[] }).items : []
 return items.map((p) => ({
  purpose: p.purpose === 'general' || p.purpose === 'specific' ? p.purpose : '',
  id: str(p.presetId) || str(p.id), title: str(p.title), author: str(p.authorName),
  usesLast7d: Number(p.usesLast7d) || 0, fresh: p.fresh === true, listed: p.listed !== false, favorited: p.favorited === true,
  lastAppliedAt: str(p.lastAppliedAt), mine: p.mine === true, recommendedModels: models(p.recommendedModels),
 })).filter((p) => p.id)
}

/** 測試過的模型存的是 series:<系列>／model:<模型>（網頁同一個規則）；畫布只顯示名稱。 */
export function modelValueName(value: string): string {
 if (value.startsWith('series:')) return value.slice(7)
 if (value.startsWith('model:')) return value.slice(6)
 return value
}

export type PresetFailure = 'busy' | 'conflict' | 'gone' | 'capacity' | 'loadFailed' | 'modelSettingUnsupported' | 'unknown' | 'failed'

/** 套用失敗時玩家接下來能做什麼。送出後沒收到回應是「結果未知」，不是失敗。 */
export function presetFailure(err: unknown): PresetFailure {
 const e = err as { statusCode?: number; data?: { error?: string; reason?: string } }
 // 沒有狀態碼（斷線）或請求層的負值（逾時 -9999）：送出去了沒有不知道
 if (!e || typeof e.statusCode !== 'number' || e.statusCode <= 0) return 'unknown'
 const code = e.data?.error ?? '', reason = e.data?.reason ?? ''
 if (reason === 'operation_active') return 'busy'
 // 要套用的那份已經刪除（清單還沒更新時按到）：伺服器跟「不存在」一樣回 404
 if (e.statusCode === 404 && code === 'not_found') return 'gone'
 if (reason === 'preset_model_setting_unsupported') return 'modelSettingUnsupported'
 if (code === 'preset_revision_unavailable') return 'loadFailed'
 if (code === 'context_capacity' || reason === 'context_capacity') return 'capacity'
 if (e.statusCode === 409) return 'conflict'
 return 'failed'
}

/** 哪幾項由預設決定：照伺服器的 presetLocked；舊伺服器只說文風（styleLocked）。 */
export function presetLockedOf(settings: unknown): string[] {
 const s = (settings ?? {}) as { presetLocked?: unknown; styleLocked?: unknown }
 if (Array.isArray(s.presetLocked)) return s.presetLocked.filter((k): k is string => typeof k === 'string')
 return s.styleLocked === true ? ['style'] : []
}

/**
 * 預設決定的那幾項，存其他偏好時連同它的補充說明（文風還有自訂文風）一起拿掉——
 * 帶了（就算是 null）伺服器會當成要改而拒絕。
 */
export function lockedPatch<T extends Record<string, unknown>>(patch: T, locked: readonly string[]): T {
 if (!locked.length) return patch
 const drop = new Set(locked.flatMap((k) => [k, `${k}Note`, ...(k === 'style' ? ['customStyle'] : [])]))
 return Object.fromEntries(Object.entries(patch).filter(([k]) => !drop.has(k))) as T
}

export const newOperationKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** 畫布向頁面要的預設能力；頁面在伺服器說這段對話能用預設時才給。 */
export interface PresetApi {
 /** 這張卡現在套用的預設 */
 card(): Promise<unknown>
 list(): Promise<unknown>
 /** 套用到整張卡；presetId 是 null 就是取消套用。expectedVersion 是讀到的綁定版本。 */
 apply(presetId: string | null, expectedVersion: number, key: string): Promise<unknown>
 /** 喜愛（收藏在前）與用過，別人的預設；自己的不列 */
 shelf?(): Promise<unknown>
 /** 預設庫熱門（依目前線路篩選） */
 hot?(model: string): Promise<unknown>
 /** 預設庫：model＝線路代號、model:X、series:S、general 或 all；sort 熱門或最新 */
 library?(query: { model: string; q: string; sort: 'hot' | 'new'; offset: number; limit: number }): Promise<unknown>
 /** 加入或取消喜愛（冪等） */
 favorite?(presetId: string, on: boolean): Promise<unknown>
 /** 到宿主站看這份預設的內容 */
 view?(presetId: string): void
 /** 目前對話的線路代號與卡名（預設庫抽屜要用） */
 context?(): { model: string; card: string }
 /** 模型代碼 → 站上公開的名稱；查不到就顯示代碼 */
 modelName?(value: string): string
 /** Match series/model labels against the live catalog, never display substrings. */
 modelMatches?(models: string[], value: string): boolean
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


export function presetModelsMatch(models: string[], value: string, groups: {group: string; families: {family: string; variants?: {value: string}[]}[]}[]): boolean {
 let family = value.startsWith('model:') ? value.slice(6) : ''
 let series = value.startsWith('series:') ? value.slice(7) : ''
 for (const group of groups) for (const f of group.families ?? []) {
  if (f.family === family || (f.variants ?? []).some(v => v.value === value)) { family = f.family; series = group.group }
 }
 return models.some(m => m === value || (m.startsWith('model:') && !!family && m.slice(6) === family) || (m.startsWith('series:') && !!series && m.slice(7) === series))
}

export function presetPurposeLine(row: PresetRow, model: string, api: PresetApi, t: (key: string, values?: Record<string, unknown>) => string): string {
 if (!row.purpose) return ''
 const parts = [t(`responseSettings.preset.purpose.${row.purpose}`)]
 const matches = !!model && (api.modelMatches?.(row.recommendedModels, model) ?? row.recommendedModels.includes(model))
 if (row.purpose === 'general' && matches) parts.push(t('responseSettings.preset.purpose.tested'))
 if (row.purpose === 'specific' && model && !matches) parts.push(t('responseSettings.preset.purpose.recommendation', {models: row.recommendedModels.map(modelValueName).join(t('responseSettings.preset.separator'))}))
 return parts.join(' · ')
}
