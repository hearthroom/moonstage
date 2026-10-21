import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCanvasBackClose } from '../canvas-back-close'

afterEach(() => vi.unstubAllGlobals())

describe('system Back closes canvas overlays', () => {
  it('owns a native close watcher only while a panel is open, and never changes history', async () => {
    class Watcher extends EventTarget {
      static all: Watcher[] = []
      destroy = vi.fn()
      constructor() { super(); Watcher.all.push(this) }
    }
    const push = vi.spyOn(window.history, 'pushState')
    vi.stubGlobal('CloseWatcher', Watcher)
    const close = vi.fn(() => guard.sync(false))
    const guard = createCanvasBackClose({ window, close })
    guard.sync(false)
    expect(Watcher.all).toHaveLength(0)
    guard.sync(true)
    guard.sync(true)
    expect(Watcher.all).toHaveLength(1)
    Watcher.all[0].dispatchEvent(new Event('close'))
    await Promise.resolve()
    expect(close).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
    guard.dispose()
    push.mockRestore()
  })

  it('rearms when a dirty settings panel declines to close, and destroys on departure', async () => {
    class Watcher extends EventTarget {
      static all: Watcher[] = []
      destroy = vi.fn()
      constructor() { super(); Watcher.all.push(this) }
    }
    vi.stubGlobal('CloseWatcher', Watcher)
    const guard = createCanvasBackClose({ window, close: async () => {} })
    guard.sync(true)
    Watcher.all[0].dispatchEvent(new Event('close'))
    await Promise.resolve(); await Promise.resolve()
    expect(Watcher.all).toHaveLength(2)
    guard.dispose()
    expect(Watcher.all[1].destroy).toHaveBeenCalledTimes(1)
  })

  it('keeps native Back available while a discard decision is pending', async () => {
    class Watcher extends EventTarget {
      static all: Watcher[] = []
      destroy = vi.fn()
      constructor() { super(); Watcher.all.push(this) }
    }
    vi.stubGlobal('CloseWatcher', Watcher)
    let answer!: () => void
    const pending = new Promise<void>(resolve => { answer = resolve })
    const close = vi.fn().mockImplementationOnce(() => pending).mockImplementationOnce(() => answer())
    const guard = createCanvasBackClose({ window, close })
    guard.sync(true)
    Watcher.all[0].dispatchEvent(new Event('close'))
    await Promise.resolve()
    expect(Watcher.all).toHaveLength(2)
    Watcher.all[1].dispatchEvent(new Event('close'))
    await Promise.resolve(); await Promise.resolve()
    expect(close).toHaveBeenCalledTimes(2)
    expect(Watcher.all).toHaveLength(3)
    guard.dispose()
  })

  it('uses one same-URL entry on older browsers, closes first, then permits departure', async () => {
    const win = new EventTarget() as any
    let entries: any[] = [{ current: '/cards' }, { current: '/play', position: 4, host: 'kept' }]
    let at = 1
    win.location = { href: 'https://example.test/play' }
    win.history = {
      get state() { return entries[at] },
      pushState: vi.fn((state: any) => { entries = entries.slice(0, at + 1); entries.push(state); at++ }),
      back: vi.fn(() => { at--; win.dispatchEvent(new Event('popstate')) }),
    }
    const close = vi.fn(() => guard.sync(false))
    const guard = createCanvasBackClose({ window: win, close })
    guard.sync(true); guard.sync(true)
    expect(win.history.pushState).toHaveBeenCalledTimes(1)
    expect(win.history.state.host).toBe('kept')
    expect(win.history.state.position).toBe(5)
    win.history.back()
    await Promise.resolve()
    expect(close).toHaveBeenCalledTimes(1)
    expect(at).toBe(1)
    win.history.back()
    expect(at).toBe(0)
    expect(close).toHaveBeenCalledTimes(1)
    guard.dispose()
  })

  it('keeps the same-URL fallback armed while awaiting a discard answer', async () => {
    const win = new EventTarget() as any
    let entries: any[] = [{ current: '/cards' }, { current: '/play', position: 4, host: 'kept' }]
    let at = 1
    win.location = { href: 'https://example.test/play' }
    win.history = {
      get state() { return entries[at] },
      pushState: vi.fn((state: any) => { entries = entries.slice(0, at + 1); entries.push(state); at++ }),
      back: vi.fn(() => { at--; win.dispatchEvent(new Event('popstate')) }),
    }
    let answer!: () => void
    const pending = new Promise<void>(resolve => { answer = resolve })
    const close = vi.fn().mockImplementationOnce(() => pending).mockImplementationOnce(() => answer())
    const guard = createCanvasBackClose({ window: win, close })
    guard.sync(true)
    win.history.back()
    await Promise.resolve()
    expect(at).toBe(2)
    win.history.back()
    await Promise.resolve(); await Promise.resolve()
    expect(close).toHaveBeenCalledTimes(2)
    expect(at).toBe(2)
    expect(win.history.state.host).toBe('kept')
    guard.dispose()
    expect(at).toBe(1)
  })
})
