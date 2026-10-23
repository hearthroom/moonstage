import { describe, expect, it } from 'vitest'
import { prepareChatPayload } from './chat-transport-ownership'

describe('prepareChatPayload resendIntent', () => {
  const base = { conversationId: 'c1', message: '我們', rewrite: true, chatId: 'u1', supportsOperationOutcome: true, clientOperationId: 'op1' }
  it('carries the traditional-conversion resend tag and leaves other payloads byte-identical', () => {
    expect('resendIntent' in (prepareChatPayload(base).payload as any)).toBe(false)
    expect((prepareChatPayload({ ...base, resendIntent: 'to_traditional' }).payload as any).resendIntent).toBe('to_traditional')
  })
  it('drops anything outside the known set instead of sending it', () => {
    for (const resendIntent of ['', 'TO_TRADITIONAL', 'to_simplified', 1, null]) {
      expect('resendIntent' in (prepareChatPayload({ ...base, resendIntent }).payload as any)).toBe(false)
    }
  })
})
