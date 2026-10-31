import { describe, expect, it, vi } from 'vitest'
import { createCanvasBackClose } from '../canvas-back-close'

function browser(native = false) {
  const win = new EventTarget() as any
  let entries: any[] = [{ current: '/cards', position: 3 }, { current: '/play', position: 4, host: 'kept' }]
  let at = 1
  let pending: number | null = null
  win.location = { href: 'https://example.test/play' }
  if (native) win.CloseWatcher = class extends EventTarget { destroy() {} }
  win.history = {
    get state() { return entries[at] },
    pushState: vi.fn((state: any) => { entries = entries.slice(0, at + 1); entries.push(state); at++ }),
    go: vi.fn((delta: number) => { pending = delta }),
    back: vi.fn(() => { pending = -1 }),
  }
  function flush() {
    if (pending === null) return
    at += pending; pending = null
    win.dispatchEvent(new Event('popstate'))
  }
  return { win, flush, get at() { return at } }
}

describe('system and browser Back close canvas layers', () => {
  it.each([false, true])('closes nested layers one at a time, preserving router state (native=%s)', async native => {
    const b = browser(native)
    let depth = 2
    const close = vi.fn(() => guard.sync(--depth))
    const guard = createCanvasBackClose({ window: b.win, close })
    guard.sync(depth)
    expect(b.at).toBe(3)
    expect(b.win.history.state).toMatchObject({ host: 'kept', position: 6 })
    b.win.history.back(); b.flush(); await Promise.resolve()
    expect(depth).toBe(1); expect(b.at).toBe(2)
    b.win.history.back(); b.flush(); await Promise.resolve()
    expect(depth).toBe(0); expect(b.at).toBe(1)
    b.win.history.back(); b.flush()
    expect(b.at).toBe(0); expect(close).toHaveBeenCalledTimes(2)
    guard.dispose()
  })

  it('programmatic close removes every temporary step and tolerates a reopen before popstate', () => {
    const b = browser()
    const guard = createCanvasBackClose({ window: b.win, close: vi.fn() })
    guard.sync(3)
    guard.sync(0)
    guard.sync(1)
    b.flush()
    expect(b.at).toBe(2)
    guard.sync(0); b.flush()
    expect(b.at).toBe(1)
    b.win.history.back(); b.flush()
    expect(b.at).toBe(0)
    guard.dispose()
  })

  it('rearms a refused close while a discard answer is pending', async () => {
    const b = browser()
    let answer!: () => void
    const pending = new Promise<void>(resolve => { answer = resolve })
    const close = vi.fn().mockImplementationOnce(() => pending).mockImplementationOnce(() => answer())
    const guard = createCanvasBackClose({ window: b.win, close })
    guard.sync(1)
    b.win.history.back(); b.flush()
    expect(b.at).toBe(2)
    b.win.history.back(); b.flush()
    await Promise.resolve(); await Promise.resolve()
    expect(close).toHaveBeenCalledTimes(2)
    expect(b.at).toBe(2)
    guard.dispose(); b.flush()
    expect(b.at).toBe(1)
  })

  it('does not change another route history during teardown', () => {
    const b = browser()
    const guard = createCanvasBackClose({ window: b.win, close: vi.fn() })
    guard.sync(1)
    b.win.location.href = 'https://example.test/library'
    guard.dispose()
    expect(b.win.history.go).not.toHaveBeenCalled()
    expect(b.win.history.back).not.toHaveBeenCalled()
  })
  it('cleans stale overlay steps when a route return or refresh mounts a new canvas', () => {
    const b = browser()
    const old = createCanvasBackClose({ window: b.win, close: vi.fn() })
    old.sync(2)
    b.win.location.href = 'https://example.test/me/presets'
    old.dispose()
    b.win.location.href = 'https://example.test/play'
    const close = vi.fn()
    const fresh = createCanvasBackClose({ window: b.win, close })
    fresh.sync(0); b.flush()
    expect(b.at).toBe(1)
    expect(close).not.toHaveBeenCalled()
    b.win.history.back(); b.flush()
    expect(b.at).toBe(0)
    fresh.dispose()
  })

})
