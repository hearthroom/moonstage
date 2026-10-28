import { describe, expect, it, vi } from 'vitest'
import { syncStartedModelSettings } from '../canvas-model-preference'

describe('new card model preference', () => {
  it('waits for earlier settings before refreshing and announces committed fallback once', async () => {
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    const read = vi.fn(async () => {})
    const notify = vi.fn()
    const sync = syncStartedModelSettings({ historyConversation: false, modelPreferenceFallback: true }, pending, read, notify)
    await Promise.resolve()
    expect(read).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
    finish()
    await sync
    expect(read).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledOnce()
  })
  it('refreshes a successful preference without a fallback notice', async () => {
    const read = vi.fn(async () => {}), notify = vi.fn()
    await syncStartedModelSettings({ historyConversation: false }, null, read, notify)
    expect(read).toHaveBeenCalledOnce()
    expect(notify).not.toHaveBeenCalled()
  })
  it('does not alter resumed cards or trust a fallback flag on them', async () => {
    const read = vi.fn(async () => {}), notify = vi.fn()
    await syncStartedModelSettings({ historyConversation: true, modelPreferenceFallback: true }, null, read, notify)
    expect(read).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})
