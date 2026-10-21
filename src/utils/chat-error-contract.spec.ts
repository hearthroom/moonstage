import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { operationFailureTitle, operationFailureSub } from './operation-failure-copy'
import { normalizeChatOperationStatus, operationProjectionMetadata, operationStatusFromProjectionRow, projectionFinishReason, mergeOperationStatusIntoStreamEntry, operationResumeIdentity } from '../pages/canvas/chat-transport-ownership'
import { resolveChatActionButtonState } from '../pages/canvas/chat-operation-ui-state'
import { resolveChatErrorMessage, resolveChatErrorTypeFromFailure, resolveCreditsShortfall } from './chat-error-message'
const t = (key: string) => key

it('keeps the outcome-unconfirmed fallbacks consistent with the approved R26 copy', () => {
 const canvas = readFileSync('src/pages/canvas/canvas.vue', 'utf8')
 expect(canvas).toContain("t('chat.operationStatusUnavailable') || '正在確認回覆狀態'")
 expect(canvas).toContain("t('chat.operationStatusUnavailableSub') || '確認完成後會自動更新。'")
})

describe('bounded content restriction presentation', () => {
 for (const [reason, suffix] of Object.entries({input_policy:'InputPolicy',safety:'Safety',prohibited:'Safety',blocklist:'Safety',privacy:'Privacy',recitation:'Recitation',refusal:'Refusal',unknown:'Unknown'})) {
  it(`retains ${reason} across status, history and recovery, with the same copy`, () => {
   const status = normalizeChatOperationStatus({operationId:'op',state:'failed_retryable',kind:'send',failureCause:'content_filter',filterReason:reason,outputDisposition:'none'})!
   expect(status.filterReason).toBe(reason)
   const row = operationProjectionMetadata(status)
   expect(operationStatusFromProjectionRow(row)?.filterReason).toBe(reason)
   const stored = mergeOperationStatusIntoStreamEntry({updatedAt:0}, status, 1)
   expect(operationResumeIdentity(stored).filterReason).toBe(reason)
   expect(operationFailureTitle('content_filter',t,reason)).toBe(`systemMsg.filter${suffix}`)
   expect(operationFailureSub('content_filter',t,{filterReason:reason})).toBe(`systemMsg.filter${suffix}Sub`)
   if (reason !== 'input_policy') expect(projectionFinishReason(status)).not.toBe('content_filter_input')
  })
 }
 it('does not render untrusted filter details or inherited object keys', () => {
  for (const reason of ['private body','__proto__','toString']) {
   expect(operationFailureTitle('content_filter',t,reason)).toBe('systemMsg.filterUnknown')
   expect(normalizeChatOperationStatus({operationId:'op',state:'failed_retryable',filterReason:reason})?.filterReason).toBe('unknown')
  }
 })
})

it('disables send and resume during pending reconciliation, but keeps a live Stop available', () => {
 for (const pending of [{isConnecting:true},{pendingChatTurn:{}},{pendingResendPayload:{}},{sendBlocked:true}]) {
  expect(resolveChatActionButtonState({...pending,content:'draft'})).toBe('send-disabled')
  expect(resolveChatActionButtonState({...pending,content:'draft',isStreamActive:true})).toBe('stop')
 }
})
it('maps typed conflicts and unknown errors without rendering raw details or inventing a network cause', () => {
 expect(resolveChatErrorTypeFromFailure({status:409,data:{error:'chat_operation_conflict'}})).toBe('chat_operation_conflict')
 expect(resolveChatErrorMessage('chat_operation_conflict',t)).toBe('chat.operationPending')
 expect(resolveChatErrorMessage('private-error',t)).toBe('error.serverError')
})

it('uses charge copy only after the same operation settled with zero credits, and keeps reasoning evidence', () => {
 expect(operationFailureSub('internal_error',t,{settled:false,chargeCredits:0})).toBe('')
 expect(operationFailureSub('internal_error',t,{settled:true,chargeCredits:5})).toBe('')
 expect(operationFailureSub('internal_error',t,{settled:true,chargeCredits:0})).toBe('systemMsg.ourErrorSub')
 expect(operationFailureTitle('no_final_answer',t,undefined,true)).toBe('chat.noFinalAnswer')
 expect(operationFailureSub('no_final_answer',t,{hasReasoning:true})).toBe('chat.noFinalAnswerSub')
 expect(operationFailureSub('content_filter',t,{filterReason:'safety',canSwitch:false})).toBe('systemMsg.filterSafetySubNoSwitch')
})

it('keeps the quoted minimum from an explicit insufficient-credit response', () => {
 expect(resolveCreditsShortfall({error_type:'insufficient_credits',credits_min:30,credits_needed:170,credits_available:100})).toEqual({minimum:30,needed:170,available:100})
 expect(resolveCreditsShortfall({error_type:'insufficient_credits',credits_min:null,credits_needed:170,credits_available:100})).toEqual({needed:170,available:100})
})
