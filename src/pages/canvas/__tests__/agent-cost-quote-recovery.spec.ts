import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, it, expect, vi } from 'vitest'
import { isDefinitivePreAdmissionRejection } from '../chat-transport-ownership'
const source = readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')
const take = (a: string, b: string) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)))
describe('Agent quote changed before admission', () => {
  it('is definitive only before a new operation was accepted', () => {
    const pending = { operationKind: 'send', payload: { supportsOperationOutcome: true } }
    expect(isDefinitivePreAdmissionRejection(pending, 'quote_changed')).toBe(true)
    expect(isDefinitivePreAdmissionRejection({ ...pending, accepted: true }, 'quote_changed')).toBe(false)
    expect(isDefinitivePreAdmissionRejection({ ...pending, operationId: 'started' }, 'quote_changed')).toBe(false)
    expect(isDefinitivePreAdmissionRejection({ ...pending, operationOutcomeCapability: 'legacy' }, 'quote_changed')).toBe(false)
  })
  it('restores the unsent draft and opens the model sheet with updated-cost guidance', () => {
    const pending = { userBubbleId: 1, aiBubbleId: 2, draft: 'Unsent story choice', preAdmissionErrorType: 'quote_changed' }
    const content = { value: '' }, quoteChanged = { value: false }
    const openModelSelect = vi.fn(), appendChatErrorBubble = vi.fn()
    const scope: any = { pendingChatTurn: pending, content, modelCostQuoteChanged: quoteChanged, openModelSelect,
      ownershipRevision: { value: 0 }, talkList: { value: [{ id: 1 }, { id: 2 }] },
      chatTransport: { shouldRecoverTransientTurn: () => true }, messageQueue: { value: [] },
      tempContent: { value: '' }, replyContent: { value: '' }, thinkingContent: { value: '' }, rewrite: { value: false }, contine: { value: false },
      clearStreamState: vi.fn(), appendChatErrorBubble, resolveChatErrorMessage: () => '', t: (s: string) => s, message: { warning: vi.fn() },
      createPreAdmissionOperationErrorProjection: () => ({}), operationStatusPollScheduler: { cancel: vi.fn() }, operationStatusRequestKey: '', durableAckProbeKey: '',
      discardPendingChatOperationCandidate: vi.fn(), pendingResendPayload: { value: null }, removeOrphanPlaceholder: vi.fn(), closeWebSocket: vi.fn(),
      isReplacementOperationKind: () => false,
    }
    const js = ts.transpile(take('function recoverPendingChatTurnBeforeAccepted(', 'function markPendingChatTurnAccepted(')
      + take('function restoreRefusedReplacement(', 'function settleFrozenLegacyStreamError(')
      + '\nreturn settleConfirmedPreAdmissionFailure(pendingChatTurn, pendingChatTurn.draft);', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None })
    expect(new Function(...Object.keys(scope), js)(...Object.values(scope))).toBe(true)
    expect(content.value).toBe('Unsent story choice')
    expect(quoteChanged.value).toBe(true)
    expect(openModelSelect).toHaveBeenCalledOnce()
    expect(appendChatErrorBubble).not.toHaveBeenCalled()
  })
})
