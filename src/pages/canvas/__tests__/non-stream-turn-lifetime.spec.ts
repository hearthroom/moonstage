import {expect,it} from 'vitest'
import {decideStreamResume,isChatOperationVisibleOutcomeExpired,markStreamEntryAccepted,mergeOperationStatusIntoStreamEntry,normalizeChatOperationStatus} from '../chat-transport-ownership'

it('keeps a complete-response turn through a ten-minute wait and reload',()=>{
 const start=Date.parse('2026-10-21T01:00:00Z'),now=start+11*60*1000
 expect(isChatOperationVisibleOutcomeExpired({acceptedAt:start,now,nonStreaming:true} as any)).toBe(false)
 const saved=markStreamEntryAccepted({operationId:'op1',nonStreaming:true,updatedAt:start},{streamId:'stream1',lastEventId:0,now:start})
 expect(saved.nonStreaming).toBe(true)
 const resume=decideStreamResume(saved,now)
 expect(resume.kind).toBe('byOperationId')
 expect(resume.expired).toBe(false)
})

it('takes transport from the authoritative operation snapshot',()=>{
 const raw={schemaVersion:'outcome_v1',operation:{operationId:'op1',kind:'send',state:'generating',nonStreaming:true}}
 expect(normalizeChatOperationStatus(raw)?.nonStreaming).toBe(true)
 expect(mergeOperationStatusIntoStreamEntry({operationId:'op1'},raw).nonStreaming).toBe(true)
 expect(normalizeChatOperationStatus({...raw,operation:{...raw.operation,nonStreaming:undefined}})?.nonStreaming).toBeUndefined()
})
