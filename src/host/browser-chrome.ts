/**
 * 把瀏覽器的頂部狀態列與底部工具列染成對話頁頂欄／輸入區的顏色。
 *
 * 各瀏覽器看的東西不一樣：
 *   - Android Chrome 等看 <meta name="theme-color">——宿主自己寫（它知道離開時要還原成什麼）。
 *   - iOS 26 起的 Safari 不看 theme-color。它找「貼著頂端／底端的 fixed 或 sticky 元素」
 *     （離邊緣幾個像素內、寬度約八成以上、至少 3px 高）讀它的 background-color；找不到有顏色的，
 *     就用頁面背景。對話頁唯一貼邊的是畫布根（.canvas-root），它的底色是透明的（顏色在漸層圖裡），
 *     所以 Safari 退回站台淺色的 html 背景，頂上就頂著一條淺灰（2026-09-26 iPhone 截圖）。
 *     這些規則是實測整理出來的，不是官方文件：
 *     https://jahir.dev/blog/safari-toolbar 、https://benfrain.com/ios26-safari-theme-color-tab-tinting-with-fixed-position-elements/
 *
 * 做法：
 *   - html 背景塗成頂欄色：Safari 退回頁面背景時，頂部就是頂欄色。
 *   - 輸入區的顏色跟頂欄不同時，在底邊放一條 3px、同色、不接點擊的 fixed 細條，
 *     讓底部工具列取到輸入區的顏色。從主畫面開的獨立 App 沒有瀏覽器工具列，不放。
 *   - top 為 null（離開對話頁）：細條拿掉、html 背景還原成原本的樣子。
 */
const PROBE_ATTR = 'data-stage-chrome-probe'
const saved = new WeakMap<Document, string>()

function standalone(doc: Document): boolean {
  const view = doc.defaultView as (Window & { navigator: Navigator & { standalone?: boolean } }) | null
  if (!view) return false
  if (view.navigator?.standalone === true) return true
  try { return !!view.matchMedia?.('(display-mode: standalone)').matches } catch { return false }
}

export function paintBrowserChrome(doc: Document, top: string | null, bottom?: string | null): void {
  const html = doc.documentElement
  const probe = doc.querySelector<HTMLElement>(`[${PROBE_ATTR}]`)
  if (!top) {
    probe?.remove()
    if (saved.has(doc)) {
      const original = saved.get(doc)!
      if (original) html.style.setProperty('background-color', original)
      else html.style.removeProperty('background-color')
      saved.delete(doc)
    }
    return
  }
  if (!saved.has(doc)) saved.set(doc, html.style.getPropertyValue('background-color'))
  html.style.setProperty('background-color', top)
  if (!bottom || bottom === top || standalone(doc) || !doc.body) {
    probe?.remove()
    return
  }
  const el = probe || doc.createElement('div')
  if (!probe) {
    el.setAttribute(PROBE_ATTR, 'bottom')
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:3px;pointer-events:none;z-index:1'
    doc.body.appendChild(el)
  }
  el.style.backgroundColor = bottom
}
