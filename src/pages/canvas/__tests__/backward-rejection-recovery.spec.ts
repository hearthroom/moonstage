import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it, vi as mock } from 'vitest'
import { classifyBackwardOperationResponse, normalizeBackwardOperationEntry } from '../chat-operation-ui-state'
import { isChatOperationVisibleOutcomeExpired } from '../chat-transport-ownership'
const chat = fs.readFileSync(path.join(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
const start = chat.indexOf('function schedulePendingBackwardOperation(')
const end = chat.indexOf('function postPendingBackwardOperation(', start)
if (start < 0 || end < 0) throw new Error('Backward scheduler not found')
const SOURCE = ts.transpile(chat.slice(start, end), { target: ts.ScriptTarget.ES2020 })

const postStart = chat.indexOf('function postPendingBackwardOperation(')
const postEnd = chat.indexOf('function resumePendingBackwardOperation(', postStart)
const POST_SOURCE = ts.transpile(chat.slice(postStart, postEnd), { target: ts.ScriptTarget.ES2020 })
const CONVERSATION = { value: 'fixture-conversation' }

describe('Backward rejection and waiting bounds', () => {
  it.each([400, 401, 403, 404, 410, 422])('releases a rejected request (%s) instead of replaying it forever', status => {
    expect(classifyBackwardOperationResponse(status, { error: 'request_rejected' })).toBe('terminal_failure')
  })
  it.each([408, 429, 500, 503, -1])('keeps transient failure %s retryable', status => {
    expect(classifyBackwardOperationResponse(status, {})).toBe('retry')
  })
  it('preserves completed, repair-pending and old-server fallback responses', () => {
    expect(classifyBackwardOperationResponse(200, { status: 'success' })).toBe('success')
    expect(classifyBackwardOperationResponse(409, { errorCode: 'mutation_in_progress' })).toBe('pending')
    expect(classifyBackwardOperationResponse(202, { status: 'repair_pending' })).toBe('pending')
    expect(classifyBackwardOperationResponse(409, { errorCode: 'rollback_client_unsupported' })).toBe('legacy_fallback')
  })
  it('expires an old Backward even when generation uses agent mode', () => {
    const fail = mock.fn()
    const write = mock.fn(() => true)
    const env = {
      isPendingBackwardOperationCurrent: () => true,
      resolveAgentTurnForOwnership: () => true,
      failPendingBackwardOperation: fail,
      writePendingBackwardOperation: write,
      cancelPendingBackwardRetryTimer: () => {},
      backwardOperationRetryDelay: () => 60_000,
      isChatOperationVisibleOutcomeExpired,
      BACKWARD_OPERATION_SLOW_RETRY_DELAY_MS: 60_000,
      operationStatusSlowNoticeKey: 'rollback-fixture',
      backwardOperationRetryTimer: null,
      setTimeout: mock.fn(),
    }
    const run = new Function(...Object.keys(env), SOURCE + '\nreturn schedulePendingBackwardOperation;')(...Object.values(env))
    const entry = { operationId: 'rollback-fixture', createdAt: Date.now() - 600_000, attempt: 10 }
    expect(run.call(env, entry)).toBe(false)
    expect(fail).toHaveBeenCalledWith(entry, 'chat.rollbackTimedOut')
    expect(write).not.toHaveBeenCalled()
    expect(env.setTimeout).not.toHaveBeenCalled()
    // Agent generation itself keeps its exemption; only Backward is bounded.
    expect(isChatOperationVisibleOutcomeExpired({ localStartedAt: entry.createdAt, now: Date.now(), agentTurn: true })).toBe(false)
  })
  it('releases a rejected HTTP promise through the same failure path', async () => {
    const fail = mock.fn()
    const retry = mock.fn()
    const env = {
      isPendingBackwardOperationCurrent: () => true,
      normalizeBackwardOperationEntry,
      classifyBackwardOperationResponse,
      conversationId: CONVERSATION,
      unref: value => value && typeof value === 'object' ? value.value : value,
      backwardOperationRequestKey: '',
      rollbackPending: { value: true },
      failPendingBackwardOperation: fail,
      schedulePendingBackwardOperation: retry,
      console: { error: () => {} },
      http: { post: () => Promise.reject({ statusCode: 403, data: { error: 'forbidden' } }) },
      requestUrl: { loadConversation: '/fixture/backward' },
    }
    env._this = env
    const post = new Function(...Object.keys(env), POST_SOURCE + '\nreturn postPendingBackwardOperation;')(...Object.values(env))
    post.call(env, { version: 1, operationId: 'rollback-fixture', conversationId: 'fixture-conversation', targetChatId: 'fixture-target', createdAt: Date.now(), updatedAt: Date.now(), attempt: 0 })
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(fail).toHaveBeenCalledTimes(1)
    expect(retry).not.toHaveBeenCalled()
  })

})
