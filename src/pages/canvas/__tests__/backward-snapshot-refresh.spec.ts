import {expect,it} from 'vitest'
import {normalizeChatOperationStatus} from '../chat-transport-ownership'
it('retains the server timeline snapshot through terminal operation normalization',()=>{
 const status=normalizeChatOperationStatus({operationId:'op',conversationId:'conv',kind:'send',state:'completed',historyEpoch:2,nextSeq:5})
 expect(status).toMatchObject({historyEpoch:2,nextSeq:5})
})

import {nextBackwardHistorySnapshot} from '../chat-operation-ui-state'
it('advances the first backward snapshot after same-page terminal or edit without a second click',()=>{
 let current={conversationId:'conv',historyEpoch:1,nextSeq:1}
 const terminal=normalizeChatOperationStatus({operationId:'op',conversationId:'conv',kind:'send',state:'completed',historyEpoch:1,nextSeq:3})
 current=nextBackwardHistorySnapshot(current,terminal,'conv')!
 expect(current.nextSeq).toBe(3)
 current=nextBackwardHistorySnapshot(current,{historyEpoch:2,nextSeq:3},'conv')!
 expect(current.historyEpoch).toBe(2)
 expect(nextBackwardHistorySnapshot(current,{historyEpoch:1,nextSeq:5},'conv')).toBe(current)
 expect(nextBackwardHistorySnapshot(current,{conversationId:'other',historyEpoch:3,nextSeq:9},'conv')).toBe(current)
 expect(nextBackwardHistorySnapshot(current,{historyEpoch:3},'conv')).toBe(current)
})
