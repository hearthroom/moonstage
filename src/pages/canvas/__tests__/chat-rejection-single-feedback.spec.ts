import {readFileSync} from 'node:fs'
import {describe,it,expect,vi} from 'vitest'
import ts from 'typescript'
import path from 'node:path'
const chat=readFileSync(path.resolve(__dirname,'../canvas.vue'),'utf8')
const take=(start:string,end:string)=>chat.slice(chat.indexOf(start),chat.indexOf(end,chat.indexOf(start)))

describe('unaccepted rejection feedback',()=>{
 it('restores the draft and inserts one error with its operation metadata',()=>{
  const pending:any={socketToken:1,userBubbleId:1,aiBubbleId:2,draft:'Synthetic draft',preAdmissionErrorType:'insufficient_credits'}
  const talkList={value:[{id:1},{id:2}]}
  const content={value:''}
  const bubbles=vi.fn((_type,_msg,metadata)=>talkList.value.push({id:3,...metadata}))
  const scope:any={pendingChatTurn:pending,talkList,content,chatTransport:{shouldRecoverTransientTurn:()=>true},
   messageQueue:{value:[]},tempContent:{value:''},replyContent:{value:''},thinkingContent:{value:''},
   rewrite:{value:false},contine:{value:false},clearStreamState:vi.fn(),appendChatErrorBubble:bubbles,
   resolveChatErrorMessage:()=> 'Insufficient credits',t:(s:string)=>s,message:{warning:vi.fn()},
   createPreAdmissionOperationErrorProjection:()=>({clientOperationId:'synthetic-rejection'}),
   operationStatusPollScheduler:{cancel:vi.fn()},operationStatusRequestKey:'',durableAckProbeKey:'',
   discardPendingChatOperationCandidate:vi.fn(),pendingResendPayload:{value:null},removeOrphanPlaceholder:vi.fn(),closeWebSocket:vi.fn(),
   isReplacementOperationKind:(kind:unknown)=>kind==='rewrite'||kind==='retry_generation'}
  const source=take('function recoverPendingChatTurnBeforeAccepted(', 'function markPendingChatTurnAccepted(')
   +take('function restoreRefusedReplacement(', 'function settleFrozenLegacyStreamError(')
   +'\nreturn settleConfirmedPreAdmissionFailure(pendingChatTurn, "Synthetic draft");'
  const js=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None})
  expect(new Function(...Object.keys(scope),js)(...Object.values(scope))).toBe(true)
  expect(content.value).toBe('Synthetic draft')
  expect(bubbles).toHaveBeenCalledTimes(1)
  expect(bubbles).toHaveBeenCalledWith('insufficient_credits','Insufficient credits',{clientOperationId:'synthetic-rejection'})
  expect(scope.closeWebSocket).toHaveBeenCalledOnce()
 })

 // A regenerate refused before it started (for credits) left the server's turn alone:
 // the previous reply comes back and the line is not turned into an unsent draft.
 it('puts the previous reply back for a refused regenerate and keeps the composer empty',()=>{
  const snapshot={userBubble:{id:1,content:'Original line'},aiBubble:{id:2,content:'Old reply'},userIndex:0,aiIndex:1}
  const pending:any={socketToken:1,aiBubbleId:9,draft:'Original line',operationKind:'rewrite',rewriteSnapshot:snapshot,
   payload:{supportsOperationOutcome:true},preAdmissionErrorType:'insufficient_credits',preAdmissionTurnKept:true}
  const talkList={value:[{id:1,content:'Original line'},{id:9,operationBubbleId:9}]}
  const content={value:''}
  const bubbles=vi.fn()
  const discard=vi.fn(()=>{talkList.value=[{id:1,content:'Original line'},{id:2,content:'Old reply'}];return true})
  const recover=vi.fn()
  const scope:any={pendingChatTurn:pending,talkList,content,chatTransport:{shouldRecoverTransientTurn:()=>true},
   messageQueue:{value:[]},tempContent:{value:''},replyContent:{value:''},thinkingContent:{value:''},
   rewrite:{value:true},contine:{value:false},clearStreamState:vi.fn(),appendChatErrorBubble:bubbles,
   resolveChatErrorMessage:()=> 'Insufficient credits',t:(s:string)=>s,message:{warning:vi.fn()},
   createPreAdmissionOperationErrorProjection:()=>({}),
   operationStatusPollScheduler:{cancel:vi.fn()},operationStatusRequestKey:'',durableAckProbeKey:'',
   discardPendingChatOperationCandidate:discard,pendingResendPayload:{value:null},removeOrphanPlaceholder:vi.fn(),closeWebSocket:vi.fn(),
   isReplacementOperationKind:(kind:unknown)=>kind==='rewrite'||kind==='retry_generation',recoverPendingChatTurnBeforeAccepted:recover}
  const source=take('function restoreRefusedReplacement(', 'function settleFrozenLegacyStreamError(')
   +'\nreturn settleConfirmedPreAdmissionFailure(pendingChatTurn, "Original line");'
  const js=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None})
  expect(new Function(...Object.keys(scope),js)(...Object.values(scope))).toBe(true)
  expect(discard).toHaveBeenCalledWith(pending)
  expect(recover).not.toHaveBeenCalled()
  expect(talkList.value.map((m:any)=>m.content)).toEqual(['Original line','Old reply'])
  expect(content.value).toBe('')
  expect(bubbles).toHaveBeenCalledTimes(1)
  expect(bubbles.mock.calls[0][0]).toBe('insufficient_credits')
  expect(scope.closeWebSocket).toHaveBeenCalledOnce()
 })

 function settleRegenerate(pending:any,talk:any[]){
  const talkList={value:talk}
  const content={value:''}
  const bubbles=vi.fn()
  const discard=vi.fn(()=>true)
  const recover=vi.fn(()=>true)
  const scope:any={pendingChatTurn:pending,talkList,content,chatTransport:{shouldRecoverTransientTurn:()=>true},
   messageQueue:{value:[]},tempContent:{value:''},replyContent:{value:''},thinkingContent:{value:''},
   rewrite:{value:true},contine:{value:false},clearStreamState:vi.fn(),appendChatErrorBubble:bubbles,
   resolveChatErrorMessage:()=> 'Insufficient credits',t:(s:string)=>s,message:{warning:vi.fn()},
   createPreAdmissionOperationErrorProjection:()=>({}),
   operationStatusPollScheduler:{cancel:vi.fn()},operationStatusRequestKey:'',durableAckProbeKey:'',
   discardPendingChatOperationCandidate:discard,pendingResendPayload:{value:null},removeOrphanPlaceholder:vi.fn(),closeWebSocket:vi.fn(),
   isReplacementOperationKind:(kind:unknown)=>kind==='rewrite'||kind==='retry_generation',recoverPendingChatTurnBeforeAccepted:recover}
  const source=take('function restoreRefusedReplacement(', 'function settleFrozenLegacyStreamError(')
   +'\nreturn settleConfirmedPreAdmissionFailure(pendingChatTurn, pendingChatTurn.draft);'
  const js=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None})
  new Function(...Object.keys(scope),js)(...Object.values(scope))
  return {content,discard,recover}
 }

 // Edit-and-resend refused for credits: the bubble goes back to the old line, and the
 // edit the player typed waits in the composer instead of being thrown away.
 it('keeps an edited line in the composer when the edit-and-resend is refused',()=>{
  const snapshot={userBubble:{id:1,content:'Original line'},aiBubble:{id:2,content:'Old reply'},userIndex:0,aiIndex:1}
  const r=settleRegenerate({socketToken:1,aiBubbleId:9,draft:'Edited line',operationKind:'rewrite',rewriteSnapshot:snapshot,
   payload:{supportsOperationOutcome:true},preAdmissionErrorType:'insufficient_credits',preAdmissionTurnKept:true},
   [{id:1,content:'Edited line'},{id:9,operationBubbleId:9}])
  expect(r.discard).toHaveBeenCalled()
  expect(r.content.value).toBe('Edited line')
 })

 // Without the server's promise the turn may already be gone (agent, world, fixed price,
 // or a refusal after it was cleared): keep handing the line back as a draft.
 it('keeps the old handling when the server did not say the turn was kept',()=>{
  const snapshot={userBubble:{id:1,content:'Original line'},aiBubble:{id:2,content:'Old reply'},userIndex:0,aiIndex:1}
  const r=settleRegenerate({socketToken:1,aiBubbleId:9,draft:'Original line',operationKind:'rewrite',rewriteSnapshot:snapshot,
   payload:{supportsOperationOutcome:true},preAdmissionErrorType:'insufficient_credits'},
   [{id:1,content:'Original line'},{id:9,operationBubbleId:9}])
  expect(r.discard).not.toHaveBeenCalled()
  expect(r.recover).toHaveBeenCalled()
 })

 // send() trims the line it sends; a plain regenerate of a line with edge spaces is not an edit.
 it('does not mistake a trimmed plain regenerate for an edit',()=>{
  const snapshot={userBubble:{id:1,content:'Original line  '},aiBubble:{id:2,content:'Old reply'},userIndex:0,aiIndex:1}
  const r=settleRegenerate({socketToken:1,aiBubbleId:9,draft:'Original line',operationKind:'rewrite',rewriteSnapshot:snapshot,
   payload:{supportsOperationOutcome:true},preAdmissionErrorType:'insufficient_credits',preAdmissionTurnKept:true},
   [{id:1,content:'Original line  '},{id:9,operationBubbleId:9}])
  expect(r.discard).toHaveBeenCalled()
  expect(r.content.value).toBe('')
 })
})
