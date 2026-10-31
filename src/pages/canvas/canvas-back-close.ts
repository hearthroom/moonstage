let sequence = 0
const MARKER = '__moonstageOverlay'

/** Same-URL history entries cover browser Back as well as Android/iOS gestures.
 * Keep the host router's state and position bookkeeping intact. CloseWatcher
 * handles platform close requests, but cannot intercept the browser Back button.
 */
export function createCanvasBackClose(options: { window: Window; close: () => void | Promise<void> }) {
  const win = options.window
  // Route departure preserves entries beneath the destination. On remount (or
  // refresh), there are no open panels: adopt and consume our old temporary steps.
  const previous = win.history.state?.[MARKER]
  const inheritedDepth = previous && typeof previous.token === 'string'
    && Number.isSafeInteger(previous.depth) && previous.depth > 0 ? previous.depth : 0
  const token = inheritedDepth ? previous.token : `overlay-${Date.now()}-${++sequence}`
  const url = win.location.href
  let desired = 0
  let depth = inheritedDepth
  let disposed = false
  let removing = false
  let responding = false
  const ownsEntry = () => win.location.href === url && win.history.state?.[MARKER]?.token === token

  function reconcile() {
    if (disposed || responding || removing || win.location.href !== url) return
    if (desired < depth && ownsEntry()) {
      removing = true
      win.history.go(desired - depth)
      return
    }
    while (depth < desired) {
      const state = win.history.state || {}
      depth++
      win.history.pushState({
        ...state, [MARKER]: { token, depth },
        ...(Number.isFinite(state.position) ? { position: state.position + 1, back: state.current, forward: null, replaced: false } : {}),
      }, '', url)
    }
  }
  function sync(nextDepth: number) {
    desired = Math.max(0, nextDepth)
    reconcile()
  }
  const onPop = () => {
    if (win.location.href !== url) return
    const next = ownsEntry() ? win.history.state[MARKER].depth : 0
    const steps = depth - next
    depth = next
    if (removing) { removing = false; reconcile(); return }
    if (steps <= 0) {
      // Forward must not resurrect a dismissed overlay or leave an empty step.
      reconcile()
      return
    }
    responding = true
    // Do not await a discard decision: its dialog must itself accept Back.
    const close = async () => {
      for (let i = 0; i < steps && !disposed; i++) {
        const before = desired
        await options.close()
        if (desired >= before) break
      }
    }
    const pending = close()
    responding = false
    reconcile()
    void pending.catch(() => console.warn('[canvas] 無法關閉面板，保留目前畫面')).finally(reconcile)
  }
  win.addEventListener('popstate', onPop)
  return {
    sync,
    dispose() {
      if (disposed) return
      disposed = true
      win.removeEventListener('popstate', onPop)
      if (!removing && depth && ownsEntry()) win.history.go(-depth)
    },
  }
}
