export const responseAxes = {
 agency: ['protect', 'assist', 'lines', 'coauthor'],
 style: ['default', 'guided', 'card', 'custom'],
 perspective: ['card', 'first_character', 'second_user', 'third_limited', 'third_omniscient'],
 length: ['auto', 'recommended', 'target'],
 pace: ['natural', 'linger', 'advance'],
} as const
export type ResponseAxis = keyof typeof responseAxes
// 每一項選項之後的補充說明（進階微調）：只作用在那一項，和選項不同時以補充為準。
export const responseNoteKeys = {agency:'agencyNote',style:'styleNote',perspective:'perspectiveNote',length:'lengthNote',pace:'paceNote'} as const satisfies Record<ResponseAxis,string>
export type ResponseNoteKey = typeof responseNoteKeys[ResponseAxis]
export const maxResponseNoteLength = 200
// 篇幅：自動（完全交給 AI）、推薦（2 到 5 段、約 2500 字），或用滑桿指定字數。刻度是對數間距，伺服器只收刻度上的值——
// 模型分不出 700 與 800，連續數值只是假精確。上限停在 10000：公開評測顯示更長的
// 目標沒有模型穩定達標，再往上只會得到中途收尾。
export const lengthTargetLadder = [200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 7000, 10000] as const
export const defaultLengthTarget = 800
// 舊存檔還會帶三檔文字值；顯示成滑桿上對應的字數，玩家一拖就換成 target。
export const legacyLengthTargets: Readonly<Record<string, number>> = {brief:300, balanced:800, detailed:1500}
export type LengthZone = 'brief' | 'balanced' | 'detailed' | 'long'
export function lengthZone(target:number):LengthZone {
 if(target<=400) return 'brief'
 if(target<=1200) return 'balanced'
 if(target<=5000) return 'detailed'
 return 'long'
}
export function isLengthTarget(value:unknown):value is number {return (lengthTargetLadder as readonly number[]).includes(value as number)}
export function lengthMode(value:string|undefined):'auto'|'recommended'|'target' {return !value || value==='auto' ? 'auto' : value==='recommended' ? 'recommended' : 'target'}
export type ResponseDraft = Partial<Record<ResponseAxis | 'customStyle' | 'lengthTarget' | ResponseNoteKey, string>>
// 玩家什麼都沒改時的偏好：平台預設，卡片有作者預設時再疊上去（伺服器的 defaults）。
export type ResponseBase = Record<ResponseAxis, string> & {lengthTarget?: number, customStyle?: string} & Partial<Record<ResponseNoteKey, string>>
export function lengthTargetOf(draft:ResponseDraft, base?:ResponseBase):number {
 const baseTarget=base?.length==='target' && isLengthTarget(base.lengthTarget) ? base.lengthTarget : defaultLengthTarget
 if(draft.length==='target') {const n=Number(draft.lengthTarget);return isLengthTarget(n) ? n : baseTarget}
 if(draft.length===undefined) return baseTarget
 return legacyLengthTargets[draft.length] ?? baseTarget
}
const noteKeys:readonly string[] = Object.values(responseNoteKeys)
const lengthValues:readonly string[] = [...responseAxes.length, ...Object.keys(legacyLengthTargets)]
export const responseDefaults: Record<ResponseAxis, string> = {agency:'protect',style:'default',perspective:'card',length:'auto',pace:'natural'}
// 伺服器仍收這三個舊文風值並當成 default；面板照樣顯示成 default，下次存檔就換掉。
const legacyStyles:readonly string[] = ['plain','dialogue','descriptive']
export interface ResponseSettings {
 conversationId: string
 scope: 'conversation'
 schemaVersion: 1
 revision: number
 overrides: ResponseDraft
 // 舊伺服器沒有這一欄；沒有就用平台預設。
 defaults?: ResponseBase
 effective: Record<ResponseAxis, string> & {lengthTarget?: number}
}
export function responseBase(settings:ResponseSettings|null|undefined):ResponseBase {return settings?.defaults ?? responseDefaults}
function lengthOption(value:unknown){return typeof value==='string' && lengthValues.includes(value)}
function checkResolved(value:Record<string,unknown>){
 for(const [key,options] of Object.entries(responseAxes)) {
  const v=value[key]
  if(key==='length' ? !lengthOption(v) : !(options as readonly string[]).includes(v as string)) throw new Error('Unsupported preference')
 }
 if((value.length==='target') !== isLengthTarget(value.lengthTarget)) throw new Error('Unsupported preference')
}
export function readResponseSettings(raw: unknown, conversationId: string): ResponseSettings {
 const r=raw as ResponseSettings
 if(!r || r.conversationId!==conversationId || r.scope!=='conversation' || r.schemaVersion!==1 || !Number.isSafeInteger(r.revision) || r.revision<0 || !r.overrides || !r.effective) throw new Error('Invalid settings response')
 checkResolved(r.effective)
 if(r.defaults!==undefined) checkResolved(r.defaults)
 if(legacyStyles.includes(r.overrides.style ?? '')) return readResponseSettings({...r,overrides:{...r.overrides,style:'default'}},conversationId)
 for(const [key,value] of Object.entries(r.overrides)) {
  if(key==='customStyle') {if(typeof value!=='string' || [...value].length>1000) throw new Error('Invalid style');continue}
  if(noteKeys.includes(key)) {if(typeof value!=='string' || !value.trim() || [...value].length>maxResponseNoteLength) throw new Error('Invalid note');continue}
  if(key==='length') {if(!lengthOption(value)) throw new Error('Unsupported override');continue}
  if(key==='lengthTarget') {if((r.overrides.length ?? responseBase(r).length)!=='target' || !isLengthTarget(Number(value))) throw new Error('Unsupported override');continue}
  if(!Object.prototype.hasOwnProperty.call(responseAxes,key) || !(responseAxes[key as ResponseAxis] as readonly string[]).includes(value as string)) throw new Error('Unsupported override')
 }
 if(r.overrides.length==='target' && !isLengthTarget(Number(r.overrides.lengthTarget))) throw new Error('Unsupported override')
 return r
}
// 附屬值（自訂文風、指定字數）看合併作者預設後實際生效的選項：作者預設「自訂」時，
// 玩家只改文字、不必先重選「自訂」。
export function responsePatch(draft: ResponseDraft, base: ResponseBase = responseDefaults): Record<string,string|null> {
 const patch:Record<string,string|null>={}
 for(const key of Object.keys(responseAxes)) patch[key]=draft[key as keyof ResponseDraft] ?? null
 // 清空的文字等於沒寫：作者預設「自訂」時，伺服器會退回作者的文字，而不是收到空字串拒絕存檔。
 patch.customStyle=draft.customStyle?.trim() ? draft.customStyle : null
 for(const key of noteKeys) patch[key]=draft[key as ResponseNoteKey]?.trim() || null
 patch.lengthTarget=draft.length==='target' ? String(lengthTargetOf(draft,base)) : null
 if((draft.style ?? base.style)!=='custom') patch.customStyle=null
 else patch.styleNote=null
 return patch
}
