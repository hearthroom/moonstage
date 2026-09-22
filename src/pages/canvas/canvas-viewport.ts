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

/*
  鍵盤收起後把視覺視窗捲回原點。iOS Safari 為了露出（iframe 裡的）輸入框會把視覺視窗往上平移，
  鍵盤收起後不一定平移回來：固定定位的畫布整個往上偏、底下留一條空白（owner 2026-09-22 iOS 面板數值：
  iframe=-49..747，視窗高 796）。文件本身不可捲，scrollTo(0,0) 在 iOS 上仍會把視覺視窗的偏移歸零。
  只在視覺視窗高度回到整個視窗（鍵盤已收）而且有偏移時做，鍵盤開著時不動——那時的平移是為了讓玩家看到輸入框。
*/
export function restoreAfterKeyboard(win: Window) {
  const vv = win.visualViewport
  if (!vv || win.document.fullscreenElement) return
  if (vv.height < win.innerHeight - 2) return
  if ((vv.offsetTop || 0) > 0 || (win.scrollY || 0) > 0) { try { win.scrollTo(0, 0) } catch { /* 舊環境沒有 scrollTo */ } }
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
    restoreAfterKeyboard(win)
  }
  const unobserve = observeViewport(win, update)
  update()
  return () => {
    unobserve()
    if (keyboard) keyboard.overlaysContent = !!previousOverlay
    names.forEach((name, index) => previous[index] ? root.style.setProperty(name, previous[index]) : root.style.removeProperty(name))
  }
}
