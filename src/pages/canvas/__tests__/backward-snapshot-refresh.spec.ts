import {expect,it} from 'vitest'
import {normalizeChatOperationStatus} from '../chat-transport-ownership'
it('retains the server timeline snapshot through terminal operation normalization',()=>{
 const status=normalizeChatOperationStatus({operationId:'op',conversationId:'conv',kind:'send',state:'completed',historyEpoch:2,nextSeq:5})
 expect(status).toMatchObject({historyEpoch:2,nextSeq:5})
})

import {nextBackwardHistorySnapshot} from '../chat-operation-ui-state'
it('advances the first backward snapshot after same-page terminal or edit without a second click',()=>{
 let current={conversationId:'conv',historyEpoch:1,nextSeq:1}
 const terminal=normalizeChatOperationStatus({operationId:'op',conversationId:'conv',kind:'send',state:'completed',historyEpoch:1,nextSeq:3,startHistoryEpoch:1,startNextSeq:1})
 current=nextBackwardHistorySnapshot(current,terminal,'conv')!
 expect(current.nextSeq).toBe(3)
 current=nextBackwardHistorySnapshot(current,{historyEpoch:2,nextSeq:3,startHistoryEpoch:1,startNextSeq:3},'conv')!
 expect(current.historyEpoch).toBe(2)
 expect(nextBackwardHistorySnapshot(current,{historyEpoch:1,nextSeq:5},'conv')).toBe(current)
 expect(nextBackwardHistorySnapshot(current,{conversationId:'other',historyEpoch:3,nextSeq:9},'conv')).toBe(current)
 expect(nextBackwardHistorySnapshot(current,{historyEpoch:3},'conv')).toBe(current)
})

it('does not bless unseen device rows before this tab sends its own turn',()=>{
 const current={conversationId:'conv',historyEpoch:1,nextSeq:5}
 const terminal={conversationId:'conv',historyEpoch:1,nextSeq:9,startHistoryEpoch:1,startNextSeq:7}
 expect(nextBackwardHistorySnapshot(current,terminal,'conv')).toBe(current)
})
it('does not adopt a terminal fence without an admission origin',()=>{
 const current={conversationId:'conv',historyEpoch:1,nextSeq:5}
 expect(nextBackwardHistorySnapshot(current,{historyEpoch:2,nextSeq:7},'conv')).toBe(current)
})

it('only an authoritative history read initializes or catches up an unseen branch',()=>{
 const page={historyEpoch:2,nextSeq:9}
 expect(nextBackwardHistorySnapshot(null,page,'conv')).toBeNull()
 expect(nextBackwardHistorySnapshot(null,page,'conv',true)).toEqual({conversationId:'conv',...page})
})
it('chains regenerate cleanup and generation only from an exact local origin',()=>{
 const local={conversationId:'conv',historyEpoch:2,nextSeq:5}
 const cleaned=nextBackwardHistorySnapshot(local,{historyEpoch:3,nextSeq:5,startHistoryEpoch:2,startNextSeq:5},'conv')
 expect(cleaned).toEqual({conversationId:'conv',historyEpoch:3,nextSeq:5})
 expect(nextBackwardHistorySnapshot(cleaned,{historyEpoch:3,nextSeq:7,startHistoryEpoch:3,startNextSeq:5},'conv')).toEqual({conversationId:'conv',historyEpoch:3,nextSeq:7})
})
