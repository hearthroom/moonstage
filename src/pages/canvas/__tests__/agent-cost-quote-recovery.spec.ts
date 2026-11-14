import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, it, expect, vi } from 'vitest'
import { isDefinitivePreAdmissionRejection } from '../chat-transport-ownership'
import { adoptInterruptedAgentBubbleForResume, createRewriteSnapshotForTarget, restoreRewriteCandidate, removeOperationCandidate, keepInterruptedAgentBubble } from '../chat-operation-ui-state'
import { findResumableAgentOperation, resolveAgentResumeTarget } from '@/utils/agent-composer-action'
const source = readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')
const take = (a: string, b: string) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)))
describe('Agent quote changed before admission', () => {
  it('is definitive only before a new operation was accepted', () => {
    const pending = { operationKind: 'send', payload: { supportsOperationOutcome: true } }
    expect(isDefinitivePreAdmissionRejection(pending, 'quote_changed')).toBe(true)
    expect(isDefinitivePreAdmissionRejection({ ...pending, accepted: true }, 'quote_changed')).toBe(false)
    expect(isDefinitivePreAdmissionRejection({ ...pending, operationId: 'started' }, 'quote_changed')).toBe(false)
    expect(isDefinitivePreAdmissionRejection({ ...pending, operationOutcomeCapability: 'legacy' }, 'quote_changed')).toBe(false)
    // 世界模式卡選了按次線：伺服器在建立這一輪之前就拒絕，原因當場給玩家，不等空探測。
    expect(isDefinitivePreAdmissionRejection(pending, 'per_turn_world_unsupported')).toBe(true)
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

describe('applying model settings with an unknown Agent preference', () => {
  it('keeps the canvas Agent state when the saved payload omitted the mode', async () => {
    const applyMultiPassPreference = vi.fn()
    const scope: any = {
      selectedVariantValue: { value: 'shown-model' }, formData: { selectModel: 'stored-model' }, modelGroups: { value: [] },
      settingsRoleId: { value: 'fixture-role' }, conversationId: { value: 'fixture-conversation' }, unref: (v: any) => v.value,
      findVariant: () => null, composeModelDisplayName: () => '', thinkingDepthForVariant: () => '',
      roleSettingsSnapshot: {}, currentRoleSettings: () => ({}), modelCostQuoteChanged: { value: false },
      applyMultiPassPreference, multiPassRuntimeEnabled: { value: true }, multiPassModelSupported: { value: true },
      persistRoleSettings: vi.fn(), loadModelCatalog: vi.fn(), loadMultiPassPreference: vi.fn(),
    }
    const js = ts.transpile(take('async function onApplyModelSettings(', '// ── 這張卡的遊玩設定')
      + '\nreturn onApplyModelSettings({ persisted: true, selectModel: "shown-model", context: 3 });', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None })
    await new Function(...Object.keys(scope), js)(...Object.values(scope))
    expect(scope.formData.context).toBe(3)
    expect(applyMultiPassPreference).not.toHaveBeenCalled()
  })
})

it('keeps the canvas mode if its post-save preference refresh returns503', async () => {
  const applyMultiPassPreference = vi.fn()
  const scope: any = {
    stageHost: { capabilities: { agentMode: true } }, settingsRoleId: { value: 'fixture-role' }, formData: { selectModel: 'shown-model' },
    unref: (value: any) => value?.value ?? value,
    _this: { http: { get: vi.fn(async () => ({ statusCode: 503, data: {} })) }, requestUrl: { playerAgentMode: '/agent' } },
    applyMultiPassPreference, normalizeMultiPassPreference: () => ({ multiPassEnabled: false }), isTransportFailure: () => false,
  }
  const js = ts.transpile(take('async function loadMultiPassPreference(', 'function onMultiPassPreferenceUpdated(')
    + '\nreturn loadMultiPassPreference();', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None })
  await new Function(...Object.keys(scope), js)(...Object.values(scope))
  expect(applyMultiPassPreference).not.toHaveBeenCalled()
})

describe('Agent Continue quote rejection preserves the composer', () => {
  it.each([
    { resume: false, draft: '', recoverable: true, expected: 'Submitted story choice' },
    { resume: true, draft: '', recoverable: true, expected: '' },
    { resume: true, draft: 'Unsent player note', recoverable: true, expected: 'Unsent player note' },
    { resume: true, draft: '', recoverable: false, expected: '' },
    { resume: true, draft: 'Unsent player note', recoverable: false, expected: 'Unsent player note' },
  ])('resume=$resume draft="$draft" recoverable=$recoverable', ({ resume, draft, recoverable, expected }) => {
    const pending = { operationKind: resume ? 'retry_generation' : 'send', aiBubbleId: 'candidate',
      draft: 'Submitted story choice', preAdmissionErrorType: 'quote_changed',
      payload: { message: 'Submitted story choice', ...(resume ? { resumeFromOperationId: 'saved-agent-operation' } : {}) } }
    const content = { value: draft }, openModelSelect = vi.fn(), appendChatErrorBubble = vi.fn()
    const scope: any = { pendingChatTurn: pending, content, modelCostQuoteChanged: { value: false }, openModelSelect,
      ownershipRevision: { value: 0 }, talkList: { value: [{ id: 'original-user' }, { id: 'candidate' }] },
      chatTransport: { shouldRecoverTransientTurn: () => recoverable }, messageQueue: { value: [] },
      tempContent: { value: '' }, replyContent: { value: '' }, thinkingContent: { value: '' }, rewrite: { value: true }, contine: { value: false },
      clearStreamState: vi.fn(), appendChatErrorBubble, resolveChatErrorMessage: () => '', t: (s: string) => s, message: { warning: vi.fn() },
      createPreAdmissionOperationErrorProjection: () => ({}), operationStatusPollScheduler: { cancel: vi.fn() }, operationStatusRequestKey: '', durableAckProbeKey: '',
      discardPendingChatOperationCandidate: vi.fn(), pendingResendPayload: { value: null }, removeOrphanPlaceholder: vi.fn(), closeWebSocket: vi.fn(),
      isReplacementOperationKind: () => resume,
    }
    const js = ts.transpile(take('function recoverPendingChatTurnBeforeAccepted(', 'function markPendingChatTurnAccepted(')
      + take('function restoreRefusedReplacement(', 'function settleFrozenLegacyStreamError(')
      + '\nreturn settleConfirmedPreAdmissionFailure(pendingChatTurn, pendingChatTurn.draft);', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None })
    expect(new Function(...Object.keys(scope), js)(...Object.values(scope))).toBe(true)
    expect(content.value).toBe(expected)
    expect(openModelSelect).toHaveBeenCalledOnce()
    expect(appendChatErrorBubble).not.toHaveBeenCalled()
    expect(pending.payload.message).toBe('Submitted story choice')
  })
})


describe('Agent Continue quote cancellation keeps its same-page resume target', () => {
  it.each(['', 'Unsent player note'])('restores the interrupted bubble and trail with draft "%s"', (draft) => {
    const originalTrail = ['Looked up the scene', 'Saved the draft']
    const content = { value: draft }
    const talkList = { value: [
      { id: 'saved-user', chatId: 'saved-user', type: 1, content: 'Submitted story choice' },
      { id: 'saved-ai', chatId: 'saved-ai', type: 0, content: '', agentInterrupted: true,
        chatLoading: false, prepTrail: originalTrail, allowedActions: ['continue'] },
    ] }
    const calls: any[] = []
    const scope: any = {
      content, talkList, canGenerate: { value: true }, isTimelineMutationBlocked: () => false,
      knownOperations: { value: [{ operationId: 'saved-operation', reasonCode: 'agent_progress_preserved', sourceChatId: 'saved-user' }] },
      unref: (ref: any) => ref.value, findResumableAgentOperation, resolveAgentResumeTarget,
      createRewriteSnapshotForTarget, adoptInterruptedAgentBubbleForResume, restoreRewriteCandidate, removeOperationCandidate, keepInterruptedAgentBubble,
      prepSteps: { value: originalTrail.slice() }, hasRenderableAssistantOutput: (body: string, thinking: string) => !!(body || thinking),
      ownershipRevision: { value: 0 }, pendingChatTurn: null, pendingRewriteSnapshot: null,
      rewrite: { value: false }, contine: { value: false }, rewriteTargetChatId: { value: '' }, continueTargetChatId: { value: '' },
      resumeFromOperationIdOverride: '', requestedOperationKindOverride: '',
      modelCostQuoteChanged: { value: false }, openModelSelect: vi.fn(),
      chatTransport: { shouldRecoverTransientTurn: () => true }, messageQueue: { value: [] },
      tempContent: { value: '' }, replyContent: { value: '' }, thinkingContent: { value: '' }, lastFinishReason: { value: '' }, pendingMessageMeta: { value: null },
      clearStreamState: vi.fn(), appendChatErrorBubble: vi.fn(), resolveChatErrorMessage: () => '', t: (s: string) => s, message: { warning: vi.fn() },
      createPreAdmissionOperationErrorProjection: () => ({}), operationStatusPollScheduler: { cancel: vi.fn() }, operationStatusRequestKey: '', durableAckProbeKey: '',
      pendingResendPayload: { value: null }, closeWebSocket: vi.fn(),
      operationKindFromPayload: () => 'retry_generation', calls,
    }
    const js = ts.transpile(
      take('function removeOrphanPlaceholder()', 'function removeResumeHistoryDuplicateByMessageAnchor(')
      + take('function isReplacementOperationKind(', 'function recordAuthoritativeOperationStatus(')
      + take('function resumeAgentOperation(): boolean {', 'function onActionBtnClick() {')
      + take('function beginPendingChatTurn(', 'function discardStoppedOperationWithoutDurableTerminal(')
      + take('function recoverPendingChatTurnBeforeAccepted(', 'function markPendingChatTurnAccepted(')
      + take('function restoreRefusedReplacement(', 'function settleFrozenLegacyStreamError(')
      + `
      function send() {
        const message = content.value;
        const adopted = adoptInterruptedAgentBubbleForResume(talkList.value);
        prepSteps.value = adopted ? adopted.trail.slice() : [];
        content.value = '';
        const payload = { message, chatId: rewriteTargetChatId.value,
          resumeFromOperationId: resumeFromOperationIdOverride, supportsOperationOutcome: true };
        calls.push(payload);
        beginPendingChatTurn({ aiBubbleId: adopted?.bubbleId, draft: message, payload,
          operationKind: 'retry_generation', preAdmissionErrorType: 'quote_changed' });
      }
      resumeAgentOperation();
      settleConfirmedPreAdmissionFailure(pendingChatTurn, pendingChatTurn.draft);
      const restored = JSON.parse(JSON.stringify(talkList.value));
      const draftAfterRejection = content.value;
      const callsBeforeManualRetry = calls.length;
      // Cancelling the model sheet does not generate; the same visible target remains.
      const canRetry = resumeAgentOperation();
      return { restored, draftAfterRejection, callsBeforeManualRetry, canRetry };
      `, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None })
    const result = new Function(...Object.keys(scope), js)(...Object.values(scope))
    const restored = result.restored.find((row: any) => row.id === 'saved-ai')
    expect(restored).toBeDefined()
    expect(restored.agentInterrupted).toBe(true)
    expect(restored.prepTrail).toEqual(originalTrail)
    expect(restored.allowedActions).toContain('continue')
    expect(result.restored.filter((row: any) => row.type === 1)).toHaveLength(1)
    expect(result.draftAfterRejection).toBe(draft)
    expect(content.value).toBe(draft)
    expect(result.callsBeforeManualRetry).toBe(1)
    expect(result.canRetry).toBe(true)
    expect(calls.map(p => p.resumeFromOperationId)).toEqual(['saved-operation', 'saved-operation'])
  })
})
