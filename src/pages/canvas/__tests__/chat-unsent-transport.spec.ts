import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChatTransportOwnership, createPendingStreamEntry, decideStreamResume } from '../chat-transport-ownership'

const chat = readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')
function take(start: string, end: string) {
  const offset = chat.indexOf(start)
  if (offset < 0) throw new Error(`Missing function: ${start}`)
  return chat.slice(offset, chat.indexOf(end, offset))
}
const payload = { conversationId: 'synthetic-conversation', message: 'Synthetic draft', supportsOperationOutcome: true, clientOperationId: 'synthetic-intent' }

function terminationHarness(queued: boolean, pollingAvailable: boolean) {
  const transport = createChatTransportOwnership()
  const token = transport.openSocketGeneration()
  const pending = { socketToken: token, draft: payload.message, payload, userBubbleId: 1, aiBubbleId: 2 }
  const scope: any = {
    chatTransport: transport, activeSocketToken: token, pendingChatTurn: pending,
    ownershipRevision: { value: 0 },
    messageQueue: { value: queued ? [{ socketToken: token, payload }] : [] },
    isConnecting: { value: true }, socket: { value: {} },
    heartbeatManager: { stop: vi.fn() }, sseParser: { reset: vi.fn() },
    clearCompactWatchdog: vi.fn(), isCompacting: false, unref: (v: any) => v?.value ?? v,
    store: { commit: vi.fn() }, isStreamActive: { value: false }, streamId: { value: '' },
    requestPendingOperationReconciliation: vi.fn(() => true),
    discardPendingChatOperationCandidate: vi.fn(() => false),
    clearStreamState: vi.fn(() => { scope.persisted = null; scope.isStreamActive.value = false }),
    closeWebSocket: vi.fn(() => { transport.invalidateSocketGeneration(token); scope.messageQueue.value = [] }),
    content: { value: '' }, t: (s: string) => s, message: { warning: vi.fn() },
    talkList: { value: [{ id: 1 }, { id: 2, chatLoading: true }] }, removeOrphanPlaceholder: vi.fn(),
    tempContent: { value: payload.message }, replyContent: { value: '' }, thinkingContent: { value: '' },
    rewrite: { value: false }, contine: { value: false },
    persisted: { ...createPendingStreamEntry(payload), chatPayloadDispatched: !queued },
    readLsEntry: () => scope.persisted, writeLsEntry: (entry: any) => { scope.persisted = entry },
    probePendingTurnAfterDurableAckTimeout: vi.fn(), socketsAwaitingReady: new Map(),
  }
  scope._this = { http: { get: vi.fn(() => pollingAvailable ? Promise.resolve({ data: [] }) : Promise.reject(new Error('offline'))) } }
  // Use the real reconciliation entry point. The probe stands in for an empty
  // or unavailable HTTP endpoint; neither may be reached for an unsent frame.
  const source = take('function recoverPendingChatTurnBeforeAccepted(', 'function markPendingChatTurnAccepted(')
    + take('function requestPendingOperationReconciliation(', 'function resumePendingOperationReconciliationOnForeground(')
    + take('function handleOwnedSocketTermination(', 'function handleModExpiryAckRequired(')
    + take('function handleChatTransportDeadline(', 'function handleOwnedSocketTermination(')
    + '\nreturn { terminate: handleOwnedSocketTermination, deadline: handleChatTransportDeadline, sendQueued: sendQueuedChatPayload, getPending: () => pendingChatTurn };'
  scope.requestAuthoritativeOperationReconciliation = () => false
  scope.canUseChatOperationOutcome = () => true
  scope.prepareChatPayload = (v: any) => ({ ok: true, payload: v })
  scope.CHAT_ACCEPTED_DEADLINE_MS = 15000
  scope.rewriteTargetChatId = { value: '' }
  delete scope.requestPendingOperationReconciliation
  const js = ts.transpile(source, { target: ts.ScriptTarget.ES2022 })
  const runtime = new Function(...Object.keys(scope), js)(...Object.values(scope))
  return { scope, token, transport, ...runtime }
}

afterEach(() => vi.useRealTimers())

describe('WS never ready', () => {
  for (const polling of [true, false]) {
    for (const kind of ['error', 'close']) {
      it(`restores an unsent turn on ${kind}, HTTP polling ${polling ? 'available' : 'unavailable'}`, () => {
        const h = terminationHarness(true, polling)
        h.terminate(kind, {}, h.token)
        expect(h.scope.probePendingTurnAfterDurableAckTimeout).not.toHaveBeenCalled()
        expect(h.scope.content.value).toBe(payload.message)
        expect(h.scope.talkList.value).toEqual([])
        expect(h.getPending()).toBeNull()
        expect(h.scope.persisted).toBeNull()
        expect(h.scope.message.warning).toHaveBeenCalledWith('chat.messageNotSentDraftSaved')
        expect(h.scope.closeWebSocket).toHaveBeenCalledOnce()
      })
    }
  }

  it('keeps reconciling a dispatched turn instead of calling it unsent', () => {
    const h = terminationHarness(false, true)
    h.terminate('error', {}, h.token)
    expect(h.scope.probePendingTurnAfterDurableAckTimeout).toHaveBeenCalledOnce()
    expect(h.scope.content.value).toBe('')
    expect(h.scope.persisted).not.toBeNull()
  })

  it('marks dispatch before sending, sends once, and reconciles a later disconnect', () => {
    const h = terminationHarness(true, true)
    const send = vi.fn(() => expect(h.scope.persisted.chatPayloadDispatched).toBe(true))
    h.sendQueued({ send }, h.token)
    h.sendQueued({ send }, h.token)
    expect(send).toHaveBeenCalledOnce()
    h.terminate('close', {}, h.token)
    expect(h.scope.probePendingTurnAfterDurableAckTimeout).toHaveBeenCalledOnce()
    expect(h.scope.content.value).toBe('')
  })

  it('recovers without polling when no socket sender exists', () => {
    const h = terminationHarness(true, true)
    h.sendQueued({}, h.token)
    expect(h.scope.content.value).toBe(payload.message)
    expect(h.scope.persisted).toBeNull()
    expect(h.scope.probePendingTurnAfterDurableAckTimeout).not.toHaveBeenCalled()
  })

  for (const kind of ['rewrite', 'retry_generation', 'continue']) {
    it(`restores the previous candidate when ${kind} never dispatches`, () => {
      const h = terminationHarness(true, true)
      const pending = h.getPending()
      pending.operationKind = kind
      pending.rewriteSnapshot = { userBubble: { content: payload.message } }
      pending.draft = kind === 'continue' ? '' : 'Edited synthetic draft'
      h.scope.discardPendingChatOperationCandidate.mockImplementation(() => {
        h.scope.talkList.value = [{ id: 9, content: 'Previous reply', chatFinish: true }]
        return true
      })
      h.terminate('error', {}, h.token)
      expect(h.scope.talkList.value[0].content).toBe('Previous reply')
      expect(h.scope.content.value).toBe(kind === 'continue' ? '' : 'Edited synthetic draft')
      expect(h.scope.persisted).toBeNull()
      expect(h.scope.closeWebSocket).toHaveBeenCalledOnce()
    })
  }

  for (const phase of ['ticket', 'auth ready']) {
    it(`bounds waiting for ${phase} to ten seconds and fences late callbacks`, async () => {
      vi.useFakeTimers()
      const h = terminationHarness(true, false)
      const callbacks: any = {}
      let resolveTicket: (ticket: string) => void = () => {}
      const ticket = new Promise<string>(resolve => { resolveTicket = resolve })
      const socket = { send: vi.fn(), onOpen: (fn: any) => { callbacks.open = fn }, onMessage: vi.fn(), onClose: vi.fn(), onError: vi.fn() }
      const scope: any = { ...h.scope, fetchChatWsTicket: () => phase === 'ticket' ? ticket : Promise.resolve('synthetic-ticket'),
        activeSocketToken: h.token, conversationGeneration: { value: 1 },
        conversationId: { value: 'synthetic-conversation' },
        isOwnedSocketCallback: (token: number) => h.transport.isCurrentSocket(token),
        handleChatTransportDeadline: h.deadline,
        handleOwnedSocketTermination: h.terminate,
        resolveChatWebSocketBase: () => 'ws://localhost.invalid/ws', WS_BASE: '', stageHost: {},
        CHAT_OPEN_DEADLINE_MS: 10000, PROTOCOL_VERSION: '2',
        uni: { connectSocket: vi.fn(() => socket) }, from: { value: '' }, version: { value: '' },
        detachGlobalSocketListeners: vi.fn(), globalSocketHandlers: null, handlerMessage: vi.fn(),
      }
      const connection = take('async function connectWebSocket(', '// Phase 2a：斷線自動重連').replaceAll('import.meta.env.VITE_CHAT_API_BASE', 'undefined')
      const js = ts.transpile(connection + '\nreturn connectWebSocket;', { target: ts.ScriptTarget.ES2022 })
      const connect = new Function(...Object.keys(scope), js)(...Object.values(scope))
      // The actual connect routine should see an empty socket at entry.
      scope.socket.value = null
      const connecting = connect(undefined, h.token)
      await Promise.resolve()
      if (phase === 'auth ready') { await connecting; callbacks.open() }
      await vi.advanceTimersByTimeAsync(10000)
      expect(h.scope.content.value).toBe(payload.message)
      expect(h.scope.persisted).toBeNull()
      expect(h.scope.closeWebSocket).toHaveBeenCalledOnce()
      if (phase === 'ticket') { resolveTicket('late-ticket'); await connecting }
      else callbacks.open()
      expect(scope.uni.connectSocket).toHaveBeenCalledTimes(phase === 'ticket' ? 0 : 1)
      expect(socket.send).toHaveBeenCalledTimes(phase === 'ticket' ? 0 : 1) // auth only
    })
  }

  it('recovers a draft immediately after refresh before dispatch', () => {
    const entry = { ...createPendingStreamEntry(payload, 1000), chatPayloadDispatched: false }
    expect(decideStreamResume(entry, 1001)).toMatchObject({ kind: 'recoverDraft', draft: payload.message })
    expect(decideStreamResume({ ...entry, chatPayloadDispatched: true }, 1001).kind).toBe('byClientOperationId')
    const { chatPayloadDispatched: _omitted, ...oldEntry } = entry
    expect(decideStreamResume(oldEntry, 1001).kind).toBe('byClientOperationId')
  })

  it('keeps the connection deadline until authenticated ready, not merely socket open', () => {
    const connection = take('async function connectWebSocket(', '// Phase 2a：斷線自動重連')
    const onOpen = connection.slice(connection.indexOf('const onOpen ='), connection.indexOf('const onMessage ='))
    expect(onOpen).not.toContain('markSocketOpened(')
    const ready = chat.slice(chat.indexOf("if (event.event === 'ready')"), chat.indexOf("if (event.event === 'error'"))
    expect(ready).toContain('markSocketOpened(socketToken)')
    // Ticket acquisition is part of the same bounded connection attempt.
    expect(connection.indexOf('armOpenDeadline(')).toBeLessThan(connection.indexOf('await fetchChatWsTicket'))
  })
})
