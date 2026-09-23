import { describe, expect, it } from 'vitest'
import { prepareChatPayload } from './chat-transport-ownership'

describe('prepareChatPayload mention', () => {
  const base = { conversationId: 'c1', message: 'hi', supportsOperationOutcome: true, clientOperationId: 'op1' }
  it('carries a world-card mention and leaves ordinary payloads byte-identical', () => {
    const plain = prepareChatPayload(base).payload as any
    expect('mention' in plain).toBe(false)
    const withMention = prepareChatPayload({ ...base, mention: ' ren ' }).payload as any
    expect(withMention.mention).toBe('ren')
    const empty = prepareChatPayload({ ...base, mention: '' }).payload as any
    expect('mention' in empty).toBe(false)
  })
})
