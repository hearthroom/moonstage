export const responseAxes = {
 agency: ['protect', 'assist', 'lines', 'coauthor'],
 style: ['card', 'plain', 'dialogue', 'descriptive', 'custom'],
 perspective: ['card', 'first_character', 'second_user', 'third_limited'],
 length: ['auto', 'brief', 'balanced', 'detailed'],
 pace: ['natural', 'linger', 'advance'],
} as const
export type ResponseAxis = keyof typeof responseAxes
// 每一項選項之後的補充說明（進階微調）：只作用在那一項，和選項不同時以補充為準。
export const responseNoteKeys = {agency:'agencyNote',style:'styleNote',perspective:'perspectiveNote',length:'lengthNote',pace:'paceNote'} as const satisfies Record<ResponseAxis,string>
export type ResponseNoteKey = typeof responseNoteKeys[ResponseAxis]
export const maxResponseNoteLength = 200
export type ResponseDraft = Partial<Record<ResponseAxis | 'customStyle' | ResponseNoteKey, string>>
const noteKeys:readonly string[] = Object.values(responseNoteKeys)
export const responseDefaults: Record<ResponseAxis, string> = {agency:'protect',style:'card',perspective:'card',length:'auto',pace:'natural'}
export interface ResponseSettings {
 conversationId: string
 scope: 'conversation'
 schemaVersion: 1
 revision: number
 overrides: ResponseDraft
 effective: Record<ResponseAxis, string>
}
export function readResponseSettings(raw: unknown, conversationId: string): ResponseSettings {
 const r=raw as ResponseSettings
 if(!r || r.conversationId!==conversationId || r.scope!=='conversation' || r.schemaVersion!==1 || !Number.isSafeInteger(r.revision) || r.revision<0 || !r.overrides || !r.effective) throw new Error('Invalid settings response')
 for(const [key,options] of Object.entries(responseAxes)) {
  if(!(options as readonly string[]).includes(r.effective[key as ResponseAxis])) throw new Error('Unsupported preference')
 }
 for(const [key,value] of Object.entries(r.overrides)) {
  if(key==='customStyle') {if(typeof value!=='string' || [...value].length>1000) throw new Error('Invalid style');continue}
  if(noteKeys.includes(key)) {if(typeof value!=='string' || !value.trim() || [...value].length>maxResponseNoteLength) throw new Error('Invalid note');continue}
  if(!Object.prototype.hasOwnProperty.call(responseAxes,key) || !(responseAxes[key as ResponseAxis] as readonly string[]).includes(value as string)) throw new Error('Unsupported override')
 }
 return r
}
export function responsePatch(draft: ResponseDraft): Record<string,string|null> {
 const patch:Record<string,string|null>={}
 for(const key of [...Object.keys(responseAxes),'customStyle']) patch[key]=draft[key as keyof ResponseDraft] ?? null
 for(const key of noteKeys) patch[key]=draft[key as ResponseNoteKey]?.trim() || null
 if(draft.style!=='custom') patch.customStyle=null
 else patch.styleNote=null
 return patch
}
