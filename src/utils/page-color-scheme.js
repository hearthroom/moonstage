/**
 * 向瀏覽器聲明「這一頁自己處理深淺色」。
 *
 * 為什麼只在對話頁做：Android Chrome 的「自動深色網頁」、小米／三星瀏覽器的「強制深色」
 * 會把沒有聲明配色方案的頁面整頁反轉——淺色底變深、圖片不動、帶色文字保留。對話頁的
 * 外觀由卡片作者決定，作者做了白底狀態列就該是白底；被瀏覽器反轉之後，玩家看到的是
 * 「日夜切換把狀態列蓋掉了」，而作者和我們的程式都沒有這條路徑（owner 2026-09-07 對照截圖）。
 * 這些瀏覽器的規則一致：頁面的 color-scheme 含 dark 就當它自己支援深色、不再插手。
 * 其他頁面要跟著系統走，所以這裡是「進頁面掛、離開就撤」，不是全站的 meta。
 *
 * 用 <meta name="color-scheme"> 而不是 html 的行內樣式：卡片腳本會動 <html> 的 class 與
 * style，離開頁面時那些會整批還原，把聲明混進去只會互相踩。
 */
export function claimPageColorScheme(value = 'light dark', doc = typeof document !== 'undefined' ? document : null) {
  const head = doc && doc.head
  if (!head) return () => {}
  let meta = head.querySelector('meta[name="color-scheme"]')
  const previous = meta ? meta.getAttribute('content') : null
  if (!meta) {
    meta = doc.createElement('meta')
    meta.setAttribute('name', 'color-scheme')
    head.appendChild(meta)
  }
  meta.setAttribute('content', value)
  let released = false
  return () => {
    if (released) return
    released = true
    if (previous === null) {
      if (meta.parentNode) meta.parentNode.removeChild(meta)
    } else {
      meta.setAttribute('content', previous)
    }
  }
}
