/*
  幾何除錯面板：帶 ?sdkDebug=1 開頁時，在宿主與沙箱殼各疊一塊唯讀的數值（視窗、視覺視窗、
  鍵盤、捲動、根與輸入區的矩形），讓沒有接上 inspector 的手機也能用截圖回報版面問題。
  owner 2026-09-22：iOS 鍵盤前後版面錯位、Android 全螢幕鍵盤蓋住輸入框，都是模擬器重現不了的。
  不帶旗標時什麼都不做；面板 pointer-events:none，不影響操作。
*/
type KeyboardLike = { boundingRect?: { top: number; height: number }; overlaysContent?: boolean }

export function mountGeometryDebug(
  doc: Document,
  win: Window,
  label: string,
  extra: () => Record<string, unknown>,
  intervalMs = 300,
): () => void {
  const el = doc.createElement('pre')
  el.setAttribute('data-lt', 'geometry-debug')
  el.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;margin:0;padding:4px 6px;max-width:100%;box-sizing:border-box;'
    + 'font:10px/1.3 ui-monospace,Menlo,monospace;color:#9f9;background:rgba(0,0,0,.72);pointer-events:none;white-space:pre-wrap;word-break:break-all'
  const r = (b: { top: number; bottom: number; height: number } | null | undefined) => (b ? `${Math.round(b.top)}..${Math.round(b.bottom)} h${Math.round(b.height)}` : '-')
  const render = () => {
    const vv = win.visualViewport
    const kb = (win.navigator as Navigator & { virtualKeyboard?: KeyboardLike }).virtualKeyboard
    const se = doc.scrollingElement || doc.documentElement
    const ae = doc.activeElement
    const base: Record<string, unknown> = {
      inner: `${win.innerWidth}x${win.innerHeight}`,
      vv: vv ? `top${Math.round(vv.offsetTop)} h${Math.round(vv.height)} s${vv.scale.toFixed(2)}` : '-',
      scrollY: Math.round(win.scrollY),
      docSH: `${se.scrollHeight}/${se.clientHeight}`,
      fs: !!doc.fullscreenElement,
      kb: kb && kb.boundingRect ? `top${Math.round(kb.boundingRect.top)} h${Math.round(kb.boundingRect.height)} ov${kb.overlaysContent ? 1 : 0}` : '-',
      active: ae ? `${ae.tagName.toLowerCase()}${ae.id ? '#' + ae.id : ''}${(ae as HTMLElement).getAttribute?.('data-chat') ? '[' + (ae as HTMLElement).getAttribute('data-chat') + ']' : ''}` : '-',
    }
    let more: Record<string, unknown> = {}
    try { more = extra() } catch (e) { more = { extraError: String(e) } }
    const all = { ...base, ...more }
    el.textContent = `[${label}] ` + Object.entries(all).map(([k, v]) => `${k}=${v}`).join('  ')
  }
  const rectOf = (node: Element | null | undefined) => r(node ? node.getBoundingClientRect() : null)
  ;(el as HTMLElement & { rectOf?: typeof rectOf }).rectOf = rectOf
  render()
  ;(doc.body || doc.documentElement).appendChild(el)
  const timer = win.setInterval(render, intervalMs)
  return () => { win.clearInterval(timer); el.remove() }
}

/** 給 extra() 用：一個節點的矩形字串 */
export function rectText(node: Element | null | undefined): string {
  if (!node) return '-'
  const b = node.getBoundingClientRect()
  return `${Math.round(b.top)}..${Math.round(b.bottom)} h${Math.round(b.height)}`
}
