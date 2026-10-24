import { describe, expect, it, vi } from 'vitest'
import { copyMessageText } from '../message-copy'
import { browserHost } from '@/host/stage-host'

describe('data-only message copy', () => {
  it('writes through the host with no DOM event and reports success only after completion', async () => {
    let complete!: () => void
    const write = vi.fn(() => new Promise<void>(resolve => { complete = resolve }))
    const toast = vi.fn(); const host = browserHost({ clipboard: { write }, ui: { toast } as any })
    const result = copyMessageText(host, 'a\nb', 'Copied', 'Copy failed')
    expect(write).toHaveBeenCalledWith('a\nb'); expect(toast).not.toHaveBeenCalled()
    complete(); await expect(result).resolves.toBe(true)
    expect(toast).toHaveBeenCalledWith('Copied', 'success')
  })
  it.each([() => Promise.reject(new Error('denied')), () => { throw new Error('sync failure') }])('reports write failure without an unhandled exception', async write => {
    const toast = vi.fn(); const host = browserHost({ clipboard: { write }, ui: { toast } as any })
    await expect(copyMessageText(host, 'text', 'Copied', 'Copy failed')).resolves.toBe(false)
    expect(toast).toHaveBeenCalledWith('Copy failed', 'error')
    expect(toast).not.toHaveBeenCalledWith('Copied', 'success')
  })
})
