/** Fullscreen belongs to the host document so dialogs and sandboxed cards stay together. */
export function createFullscreenController(doc: Document, changed: (active: boolean) => void, failed: () => void) {
  const supported = !!doc.fullscreenEnabled && typeof doc.documentElement?.requestFullscreen === 'function'
  const sync = () => changed(!!doc.fullscreenElement)
  doc.addEventListener('fullscreenchange', sync)
  sync()
  let busy = false
  return {
    supported,
    async toggle() {
      if (!supported || busy) return
      busy = true
      try {
        if (doc.fullscreenElement) await doc.exitFullscreen()
        else await doc.documentElement.requestFullscreen({ navigationUI: 'hide' })
      } catch { failed() }
      finally { busy = false; sync() }
    },
    dispose() { doc.removeEventListener('fullscreenchange', sync) },
  }
}
