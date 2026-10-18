type NativeWatcher = EventTarget & { destroy(): void }
type CloseWindow = Window & { CloseWatcher?: new () => NativeWatcher }
let sequence = 0
const MARKER = '__moonstageOverlay'

/** Android Back/Escape belong to the open overlay, never to the running reply.
 * CloseWatcher leaves browser history alone. Older browsers get one temporary,
 * same-URL entry, preserving the host router's state and position bookkeeping.
 */
export function createCanvasBackClose(options: { window: Window; close: () => void | Promise<void> }) {
  const win = options.window as CloseWindow
  const token = `overlay-${++sequence}`
  let open = false
  let disposed = false
  let watcher: NativeWatcher | null = null
  let armed = false
  let removing = false
  let closing = false
  let armedUrl = ''
  const ownsEntry = () => win.history.state?.[MARKER] === token && win.location.href === armedUrl

  const close = async () => {
    if (disposed || closing) return
    closing = true
    // The callback may ask about unsaved settings. Rearm if it keeps the sheet.
    try { await options.close() }
    catch { console.warn('[canvas] 無法關閉面板，保留目前畫面') }
    finally {
      closing = false
      sync(open)
    }
  }
  function sync(nextOpen: boolean) {
    open = nextOpen
    if (disposed) return
    if (win.CloseWatcher) {
      if (!open) { watcher?.destroy(); watcher = null }
      else if (!watcher && !closing) {
        watcher = new win.CloseWatcher()
        watcher.addEventListener('close', () => { watcher = null; close() }, { once: true })
      }
      return
    }
    if (!open && armed && ownsEntry()) {
      armed = false
      removing = true
      win.history.back()
    } else if (open && !armed && !removing && !closing) {
      const state = win.history.state || {}
      armedUrl = win.location.href
      win.history.pushState({
        ...state, [MARKER]: token,
        ...(Number.isFinite(state.position) ? { position: state.position + 1, back: state.current, forward: null, replaced: false } : {}),
      }, '', armedUrl)
      armed = true
    }
  }
  const onPop = () => {
    if (removing) { removing = false; sync(open); return }
    if (!armed || ownsEntry()) return
    armed = false
    // A multi-entry traversal or a host navigation must still be able to leave.
    if (win.location.href === armedUrl && open) close()
  }
  win.addEventListener('popstate', onPop)
  return {
    sync,
    dispose() {
      disposed = true
      watcher?.destroy()
      watcher = null
      win.removeEventListener('popstate', onPop)
      if (armed && ownsEntry()) win.history.back()
      armed = false
    },
  }
}
