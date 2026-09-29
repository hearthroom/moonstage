export const responseAxes = {
 agency: ['protect', 'assist', 'lines', 'coauthor'],
 style: ['default', 'card', 'plain', 'dialogue', 'descriptive', 'custom'],
 perspective: ['card', 'first_character', 'second_user', 'third_limited'],
 length: ['auto', 'target'],
 pace: ['natural', 'linger', 'advance'],
} as const
export type ResponseAxis = keyof typeof responseAxes
// 每一項選項之後的補充說明（進階微調）：只作用在那一項，和選項不同時以補充為準。
export const responseNoteKeys = {agency:'agencyNote',style:'styleNote',perspective:'perspectiveNote',length:'lengthNote',pace:'paceNote'} as const satisfies Record<ResponseAxis,string>
export type ResponseNoteKey = typeof responseNoteKeys[ResponseAxis]
export const maxResponseNoteLength = 200
// 篇幅：要麼自動，要麼用滑桿指定字數。刻度是對數間距，伺服器只收刻度上的值——
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
export function lengthMode(value:string|undefined):'auto'|'target' {return !value || value==='auto' ? 'auto' : 'target'}
export type ResponseDraft = Partial<Record<ResponseAxis | 'customStyle' | 'lengthTarget' | ResponseNoteKey, string>>
export function lengthTargetOf(draft:ResponseDraft):number {
 if(draft.length==='target') {const n=Number(draft.lengthTarget);return isLengthTarget(n) ? n : defaultLengthTarget}
 return legacyLengthTargets[draft.length ?? ''] ?? defaultLengthTarget
}
const noteKeys:readonly string[] = Object.values(responseNoteKeys)
const lengthValues:readonly string[] = [...responseAxes.length, ...Object.keys(legacyLengthTargets)]
export const responseDefaults: Record<ResponseAxis, string> = {agency:'protect',style:'card',perspective:'card',length:'auto',pace:'natural'}
export interface ResponseSettings {
 conversationId: string
 scope: 'conversation'
 schemaVersion: 1
 revision: number
 overrides: ResponseDraft
 effective: Record<ResponseAxis, string> & {lengthTarget?: number}
}
function lengthOption(value:unknown){return typeof value==='string' && lengthValues.includes(value)}
export function readResponseSettings(raw: unknown, conversationId: string): ResponseSettings {
 const r=raw as ResponseSettings
 if(!r || r.conversationId!==conversationId || r.scope!=='conversation' || r.schemaVersion!==1 || !Number.isSafeInteger(r.revision) || r.revision<0 || !r.overrides || !r.effective) throw new Error('Invalid settings response')
 for(const [key,options] of Object.entries(responseAxes)) {
  const value=r.effective[key as ResponseAxis]
  if(key==='length' ? !lengthOption(value) : !(options as readonly string[]).includes(value)) throw new Error('Unsupported preference')
 }
 if((r.effective.length==='target') !== isLengthTarget(r.effective.lengthTarget)) throw new Error('Unsupported preference')
 for(const [key,value] of Object.entries(r.overrides)) {
  if(key==='customStyle') {if(typeof value!=='string' || [...value].length>1000) throw new Error('Invalid style');continue}
  if(noteKeys.includes(key)) {if(typeof value!=='string' || !value.trim() || [...value].length>maxResponseNoteLength) throw new Error('Invalid note');continue}
  if(key==='length') {if(!lengthOption(value)) throw new Error('Unsupported override');continue}
  if(key==='lengthTarget') {if(r.overrides.length!=='target' || !isLengthTarget(Number(value))) throw new Error('Unsupported override');continue}
  if(!Object.prototype.hasOwnProperty.call(responseAxes,key) || !(responseAxes[key as ResponseAxis] as readonly string[]).includes(value as string)) throw new Error('Unsupported override')
 }
 if(r.overrides.length==='target' && !isLengthTarget(Number(r.overrides.lengthTarget))) throw new Error('Unsupported override')
 return r
}
export function responsePatch(draft: ResponseDraft): Record<string,string|null> {
 const patch:Record<string,string|null>={}
 for(const key of [...Object.keys(responseAxes),'customStyle']) patch[key]=draft[key as keyof ResponseDraft] ?? null
 for(const key of noteKeys) patch[key]=draft[key as ResponseNoteKey]?.trim() || null
 patch.lengthTarget=draft.length==='target' ? String(lengthTargetOf(draft)) : null
 if(draft.style!=='custom') patch.customStyle=null
 else patch.styleNote=null
 return patch
}
