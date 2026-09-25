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
  // 鍵盤矩形只在輸入法蓋在頁面上時才由瀏覽器維護；不覆蓋時瀏覽器自己縮視窗，矩形停在離開全螢幕前的
  // 最後值。照扣就是永遠多扣一塊鍵盤高（小米 2026-09-25：收鍵盤後輸入區停在半空、點畫面也縮不回去）。
  const vk = keyboardOf(win)
  const overlaying = !!vk && (vk.overlaysContent || !!win.document?.fullscreenElement)
  const keyboard = overlaying ? vk.boundingRect : undefined
  if (keyboard && keyboard.height > 0) {
    // Android Chrome 全螢幕實測（owner 2026-09-22 面板數值 kb=top0 h340 ov1）：高度對、top 卻是 0。
    // 鍵盤貼在螢幕底部，top 不可信時用「視窗高 − 鍵盤高」推回來——前提是視窗還沒為鍵盤縮短。
    // owner 2026-09-25（Android App 與 Chrome 全螢幕）：視窗已經縮過、矩形仍報 top 0，照減就扣兩次，
    // 輸入區被推到頂、中間一大塊黑。可見底已經比「螢幕高 − 半個鍵盤」還矮，就當鍵盤已被扣掉。
    const screenHeight = Number(win.screen?.height) || 0
    const alreadyExcluded = keyboard.top <= top && screenHeight > 0 && bottom <= screenHeight - keyboard.height / 2
    const keyboardTop = keyboard.top > top ? keyboard.top : win.innerHeight - keyboard.height
    if (!alreadyExcluded && keyboardTop > top) bottom = Math.min(bottom, keyboardTop)
  }
  return { top, bottom, height: Math.max(0, bottom - top) }
}

export function observeViewport(win: Window, update: () => void) {
  const bindings: [EventTarget | null | undefined, string][] = [
    [win, 'resize'], [win.visualViewport, 'resize'], [win.visualViewport, 'scroll'],
    [keyboardOf(win), 'geometrychange'], [win.document, 'fullscreenchange'],
    // 切到後台時系統會收鍵盤，但後台頁面收不到幾何／視窗事件；切回來要重新量
    // （owner 2026-09-22 Android：鍵盤開著切後台再回來，畫布卡在縮短狀態回不來）。
    [win.document, 'visibilitychange'], [win, 'pageshow'], [win, 'focus'],
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
  let lastVisibility: DocumentVisibilityState = win.document.visibilityState
  const remeasure = () => {
    const { top, bottom, height } = visibleViewport(win)
    if (height <= 0) return
    const values = [top, height, Math.max(0, win.innerHeight - bottom)]
    names.forEach((name, index) => root.style.setProperty(name, `${Math.round(values[index])}px`))
  }
  const update = () => {
    // 頁面剛從後台回來：鍵盤已被系統收掉，但焦點還在輸入框、鍵盤 API 的矩形可能還是舊值。
    // 把焦點移開（跨源 iframe 的話 blur iframe 元素即可讓裡面的輸入框失焦），幾何才會跟著歸零。
    if (win.document.visibilityState === 'visible' && lastVisibility === 'hidden') {
      const active = win.document.activeElement as HTMLElement | null
      if (active && active !== win.document.body && typeof active.blur === 'function') { try { active.blur() } catch { /* 不可聚焦的節點 */ } }
    }
    lastVisibility = win.document.visibilityState
    // Fullscreen Chrome can overlay the IME without resizing either viewport. Opt in to
    // explicit geometry there; retain the browser's normal keyboard policy elsewhere.
    if (keyboard) keyboard.overlaysContent = win.document.fullscreenElement ? true : !!previousOverlay
    remeasure()
    // 平移可能在我們縮好畫布之後才發生（Safari 的聚焦捲動晚於 visualViewport resize），
    // 所以除了現在，稍後再看兩次。
    settleVisualViewport(win)
    const later = typeof win.setTimeout === 'function' ? win.setTimeout.bind(win) : globalThis.setTimeout
    const cancel = typeof win.clearTimeout === 'function' ? win.clearTimeout.bind(win) : globalThis.clearTimeout
    for (const timer of settleTimers.splice(0)) cancel(timer)
    for (const delay of [60, 300]) settleTimers.push(later(() => { settleVisualViewport(win); remeasure() }, delay) as unknown as number)
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
