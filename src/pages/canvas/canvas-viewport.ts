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
  把視覺視窗的平移歸零。iOS Safari 聚焦（iframe 裡的）輸入框時，若那一刻輸入框還在可見範圍外
  ——我們把畫布縮到可見視窗高要等下一幀——Safari 會先把視覺視窗往上平移三百多 px；畫布縮好之後
  平移不會自己撤銷，可見視窗看到的是畫布以下的頁面底色（owner 2026-09-22 iOS：兩三成機率整頁黑）。
  畫布永遠跟著可見視窗高、輸入區貼在畫布底部，所以平移從來不是必要的：偵測到就 scrollTo(0,0)，
  Safari 不會再平移回來（輸入框已在可見範圍內）。鍵盤收起後殘留的平移（先前那個 iframe=-49..747）
  也走同一條。文件本身不可捲，scrollTo(0,0) 在 iOS 上仍會把視覺視窗的偏移歸零。全螢幕不動。
*/
export function settleVisualViewport(win: Window) {
  const vv = win.visualViewport
  if (!vv || win.document.fullscreenElement) return
  if ((vv.offsetTop || 0) > 0 || (win.scrollY || 0) > 0) { try { win.scrollTo(0, 0) } catch { /* 舊環境沒有 scrollTo */ } }
}

/** @deprecated 舊名，語意已擴大成任何時候都歸零；留給既有呼叫。 */
export const restoreAfterKeyboard = settleVisualViewport

/** Keep the ordinary canvas and its sandbox iframe inside the same visible rectangle. */
export function bindCanvasViewport(win: Window, root: HTMLElement) {
  const keyboard = keyboardOf(win)
  const previousOverlay = keyboard?.overlaysContent
  const names = ['--lt-viewport-top', '--lt-viewport-height', '--lt-viewport-bottom']
  const previous = names.map(name => root.style.getPropertyValue(name))
  const settleTimers: number[] = []
  const update = () => {
    // Fullscreen Chrome can overlay the IME without resizing either viewport. Opt in to
    // explicit geometry there; retain the browser's normal keyboard policy elsewhere.
    if (keyboard) keyboard.overlaysContent = win.document.fullscreenElement ? true : !!previousOverlay
    const { top, bottom, height } = visibleViewport(win)
    if (height <= 0) return
    const values = [top, height, Math.max(0, win.innerHeight - bottom)]
    names.forEach((name, index) => root.style.setProperty(name, `${Math.round(values[index])}px`))
    // 平移可能在我們縮好畫布之後才發生（Safari 的聚焦捲動晚於 visualViewport resize），
    // 所以除了現在，稍後再看兩次。
    settleVisualViewport(win)
    const later = typeof win.setTimeout === 'function' ? win.setTimeout.bind(win) : globalThis.setTimeout
    const cancel = typeof win.clearTimeout === 'function' ? win.clearTimeout.bind(win) : globalThis.clearTimeout
    for (const timer of settleTimers.splice(0)) cancel(timer)
    for (const delay of [60, 300]) settleTimers.push(later(() => settleVisualViewport(win), delay) as unknown as number)
  }
  const unobserve = observeViewport(win, update)
  update()
  return () => {
    unobserve()
    for (const timer of settleTimers.splice(0)) (typeof win.clearTimeout === 'function' ? win.clearTimeout.bind(win) : globalThis.clearTimeout)(timer)
    if (keyboard) keyboard.overlaysContent = !!previousOverlay
    names.forEach((name, index) => previous[index] ? root.style.setProperty(name, previous[index]) : root.style.removeProperty(name))
  }
}
