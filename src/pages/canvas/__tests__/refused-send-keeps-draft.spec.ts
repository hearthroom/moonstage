import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { isDefinitivePreAdmissionRejection } from '../chat-transport-ownership'
import { resolveChatErrorPresentation } from '../../../utils/chat-error-message.js'

// Discord report 2026-10-02: a player without enough credits saw "服务器暂时不稳定",
// then the message, the notice and the typed text all disappeared. A send refused for
// credits never reaches the timeline, so the page must give the text back and say why.
const root = process.cwd()
const readChat = () => fs.readFileSync(path.join(root, 'src/pages/canvas/canvas.vue'), 'utf8')

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

const capablePending = () => ({
  operationKind: 'send',
  clientOperationId: 'client-broke',
  draft: 'A long opening the player typed.',
  payload: { supportsOperationOutcome: true, clientOperationId: 'client-broke' },
})

describe('a send refused for credits', () => {
  it('is settled from the error alone while no turn exists yet', () => {
    expect(isDefinitivePreAdmissionRejection(capablePending(), 'insufficient_credits')).toBe(true)
  })

  it('leaves errors that transport can also produce to the probe path', () => {
    for (const type of ['server_error', 'temporarily_unavailable', 'connection_error', 'content_filter']) {
      expect(isDefinitivePreAdmissionRejection(capablePending(), type)).toBe(false)
    }
  })

  it('applies to a new send and to a regenerate that can put the old reply back', () => {
    const { operationKind: _omitted, ...legacySend } = capablePending()
    expect(isDefinitivePreAdmissionRejection(legacySend, 'insufficient_credits')).toBe(true)
    // The server refuses an unaffordable regenerate before clearing the turn and says
    // so (turn_kept); only then does the page restore the previous reply.
    const snapshot = { userBubble: { id: 'u1' }, aiBubble: { id: 'a1' }, userIndex: 1, aiIndex: 2 }
    for (const kind of ['rewrite', 'retry_generation']) {
      expect(isDefinitivePreAdmissionRejection({ ...capablePending(), operationKind: kind, rewriteSnapshot: snapshot, preAdmissionTurnKept: true }, 'insufficient_credits')).toBe(true)
      // Without that promise the turn may already be gone (agent, world, fixed price).
      expect(isDefinitivePreAdmissionRejection({ ...capablePending(), operationKind: kind, rewriteSnapshot: snapshot }, 'insufficient_credits')).toBe(false)
    }
  })

  it('never applies to an agent Continue or a turn without a snapshot to restore', () => {
    // Continue adopts the interrupted bubble already on screen and the server keeps its
    // turn; removing that bubble would lose the saved progress from view.
    const snapshot = { userBubble: { id: 'u1' }, aiBubble: { id: 'a1' }, userIndex: 1, aiIndex: 2 }
    const resume = { ...capablePending(), operationKind: 'retry_generation', rewriteSnapshot: snapshot, preAdmissionTurnKept: true }
    resume.payload = { ...resume.payload, resumeFromOperationId: 'op-paused' } as any
    expect(isDefinitivePreAdmissionRejection(resume, 'insufficient_credits')).toBe(false)
    for (const kind of ['retry_generation', 'rewrite', 'continue']) {
      expect(isDefinitivePreAdmissionRejection({ ...capablePending(), operationKind: kind }, 'insufficient_credits')).toBe(false)
    }
  })

  it('puts the previous reply back when a regenerate is refused before it starts', () => {
    // Both routes end here: the immediate settle above and the confirmation after
    // repeated empty probes (pages loaded before this change take that one).
    const chat = readChat()
    const settle = sliceBetween(chat, 'function settleConfirmedPreAdmissionFailure(', 'function settleFrozenLegacyStreamError(')
    const notAccepted = settle.slice(settle.indexOf('if (capturedPending.accepted === true)'))
    const restore = notAccepted.indexOf('restoreRefusedReplacement(capturedPending)')
    const recover = notAccepted.indexOf('recoverPendingChatTurnBeforeAccepted(false')
    expect(restore).toBeGreaterThan(-1)
    expect(recover).toBeGreaterThan(restore)
    const helper = sliceBetween(chat, 'function restoreRefusedReplacement(', '\n}\n')
    expect(helper).toContain('pending.preAdmissionTurnKept !== true')
    expect(helper).toContain('isReplacementOperationKind(pending.operationKind)')
    expect(helper).toContain('pending.rewriteSnapshot')
    expect(helper).toContain('resumeFromOperationId')
    expect(helper).toContain('discardPendingChatOperationCandidate(pending)')
  })

  it('does not apply once the server has named the turn', () => {
    expect(isDefinitivePreAdmissionRejection({ ...capablePending(), operationId: 'op-1' }, 'insufficient_credits')).toBe(false)
    expect(isDefinitivePreAdmissionRejection({ ...capablePending(), accepted: true }, 'insufficient_credits')).toBe(false)
    expect(isDefinitivePreAdmissionRejection({ ...capablePending(), operationOutcomeCapability: 'legacy' }, 'insufficient_credits')).toBe(false)
    expect(isDefinitivePreAdmissionRejection(null, 'insufficient_credits')).toBe(false)
  })

  it('records the server promise that the turn was kept before deciding', () => {
    const errorEvent = sliceBetween(readChat(), "case 'error':", '// 滚动节流定时器')
    const kept = errorEvent.indexOf('event.data?.turn_kept === true')
    const gate = errorEvent.indexOf('isDefinitivePreAdmissionRejection(pendingChatTurn, errorType)')
    expect(kept).toBeGreaterThan(-1)
    expect(gate).toBeGreaterThan(kept)
    expect(errorEvent.slice(kept, gate)).toContain('preAdmissionTurnKept = true')
  })

  it('gives the text back and shows the reason before any reconciliation reload', () => {
    const errorEvent = sliceBetween(readChat(), "case 'error':", '// 滚动节流定时器')
    const gate = errorEvent.indexOf('isDefinitivePreAdmissionRejection(pendingChatTurn, errorType)')
    const settle = errorEvent.indexOf('settleConfirmedPreAdmissionFailure(', gate)
    const reconcile = errorEvent.indexOf('requestPendingOperationReconciliation(')
    expect(gate).toBeGreaterThan(-1)
    expect(settle).toBeGreaterThan(gate)
    expect(reconcile).toBeGreaterThan(settle)
    // The draft comes from the turn itself or the persisted payload, never left empty.
    expect(errorEvent.slice(settle, reconcile)).toContain('pendingChatTurn?.draft || readLsEntry()?.pendingPayload?.message')
  })
})

describe('the provider code for a turn it could not serve', () => {
  it('reads as a server error, not a lost connection', () => {
    expect(resolveChatErrorPresentation('temporarily_unavailable', (k: string) => k)).toMatchObject({
      message: 'error.serverError',
      finishReason: 'server_error',
    })
  })
})
