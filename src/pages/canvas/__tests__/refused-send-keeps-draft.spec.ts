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

  it('applies only to a new send, never to Continue, Retry or Rewrite', () => {
    // Those reuse a bubble already on screen; the server keeps their turn, so removing
    // the bubble and restoring the line as a draft would duplicate it.
    for (const kind of ['retry_generation', 'continue', 'rewrite']) {
      expect(isDefinitivePreAdmissionRejection({ ...capablePending(), operationKind: kind }, 'insufficient_credits')).toBe(false)
    }
    const { operationKind: _omitted, ...legacySend } = capablePending()
    expect(isDefinitivePreAdmissionRejection(legacySend, 'insufficient_credits')).toBe(true)
  })

  it('does not apply once the server has named the turn', () => {
    expect(isDefinitivePreAdmissionRejection({ ...capablePending(), operationId: 'op-1' }, 'insufficient_credits')).toBe(false)
    expect(isDefinitivePreAdmissionRejection({ ...capablePending(), accepted: true }, 'insufficient_credits')).toBe(false)
    expect(isDefinitivePreAdmissionRejection({ ...capablePending(), operationOutcomeCapability: 'legacy' }, 'insufficient_credits')).toBe(false)
    expect(isDefinitivePreAdmissionRejection(null, 'insufficient_credits')).toBe(false)
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
