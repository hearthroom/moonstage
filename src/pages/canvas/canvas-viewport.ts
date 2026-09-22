interface KeyboardGeometry extends EventTarget {
  overlaysContent: boolean
  boundingRect: { top: number; height: number }
}
const keyboardOf = (win: Window) => (win.navigator as Navigator & { virtualKeyboard?: KeyboardGeometry })?.virtualKeyboard

/** Layout viewport can stay full-height while Android/iOS only resize the visible area. */
export function visibleViewport(win: Window) {
  const vv = win.visualViewport
  // Let the browser pan/zoom normally rather than reflowing the card on every pinch.
  const useVisual = vv && (vv.scale == null || vv.scale === 1) && vv.height > 0
  const top = useVisual ? Math.max(0, vv.offsetTop || 0) : 0
  let bottom = useVisual ? Math.min(win.innerHeight, top + vv.height) : win.innerHeight
  const keyboard = keyboardOf(win)?.boundingRect
  if (keyboard && keyboard.height > 0 && keyboard.top > top) bottom = Math.min(bottom, keyboard.top)
  return { top, bottom, height: Math.max(0, bottom - top) }
}

export function observeViewport(win: Window, update: () => void) {
  const bindings: [EventTarget | null | undefined, string][] = [
    [win, 'resize'], [win.visualViewport, 'resize'], [win.visualViewport, 'scroll'],
    [keyboardOf(win), 'geometrychange'], [win.document, 'fullscreenchange'],
  ]
  for (const [target, event] of bindings) target?.addEventListener(event, update)
  return () => { for (const [target, event] of bindings) target?.removeEventListener(event, update) }
}

/** Keep the ordinary canvas and its sandbox iframe inside the same visible rectangle. */
export function bindCanvasViewport(win: Window, root: HTMLElement) {
  const keyboard = keyboardOf(win)
  const previousOverlay = keyboard?.overlaysContent
  const names = ['--lt-viewport-top', '--lt-viewport-height', '--lt-viewport-bottom']
  const previous = names.map(name => root.style.getPropertyValue(name))
  const update = () => {
    // Fullscreen Chrome can overlay the IME without resizing either viewport. Opt in to
    // explicit geometry there; retain the browser's normal keyboard policy elsewhere.
    if (keyboard) keyboard.overlaysContent = win.document.fullscreenElement ? true : !!previousOverlay
    const { top, bottom, height } = visibleViewport(win)
    if (height <= 0) return
    const values = [top, height, Math.max(0, win.innerHeight - bottom)]
    names.forEach((name, index) => root.style.setProperty(name, `${Math.round(values[index])}px`))
  }
  const unobserve = observeViewport(win, update)
  update()
  return () => {
    unobserve()
    if (keyboard) keyboard.overlaysContent = !!previousOverlay
    names.forEach((name, index) => previous[index] ? root.style.setProperty(name, previous[index]) : root.style.removeProperty(name))
  }
}
