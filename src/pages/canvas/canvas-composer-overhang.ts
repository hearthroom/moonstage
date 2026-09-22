/*
  輸入區「往上侵入捲動區」的量。

  MMD 卡常在畫面底部放自己的固定工具列，然後用腳本把我們的輸入區整塊往上推
  （實測某張 MMD 匯入卡：`.composer-scope` 被加了 `transform: translateY(-52px)`）。
  推是推上去了，但捲動區的高度沒有跟著縮——輸入區蓋住捲動區最底下的 52px，
  最後一則訊息的結尾永遠捲不出來（owner 2026-09-04 回報：行動端最底部沒有
  padding、內容被吃掉）。

  這裡不猜作者用的是 transform、relative 還是 margin：直接量輸入區畫出來的
  top 跟捲動區 bottom 的差，差多少就給對話欄多少底部內距。
*/
export type OverhangInput = {
  /** 捲動區（.scroll-view）畫出來的下緣 */
  scrollBottom: number
  /** 捲動區畫出來的高度；侵入量不可能比它還大 */
  scrollHeight: number
  /** 輸入區畫出來的上緣（含 transform） */
  composerTop: number
  /** 輸入區畫出來的高度；0 = 被藏起來，那就沒有侵入 */
  composerHeight: number
}

export function composerOverhang(input: OverhangInput): number {
  const { scrollBottom, scrollHeight, composerTop, composerHeight } = input
  if (!(composerHeight > 0) || !(scrollHeight > 0)) return 0
  const raw = scrollBottom - composerTop
  if (!(raw > 0)) return 0
  // 作者把輸入區整個丟到畫面上半部這種極端狀況不當侵入處理：
  // 那不是「蓋住底部」，補內距只會把對話欄撐出一大片空白。
  if (raw > scrollHeight / 2) return 0
  return Math.round(raw)
}

export type PaintedRect = {
  top: number
  height: number
  width: number
  /** getComputedStyle(el).position；absolute／fixed 的子節點（浮在輸入區上方的選單、面板）不算輸入區本體 */
  position?: string
}

/*
  輸入區「畫出來的上緣」：整棵子樹裡最高的那個節點，而不只是最外層容器。

  作者腳本推輸入區時挑的是哪一層並不固定——實測那張 MMD 卡從 textarea 往上走，挑
  「寬過半、高不到 190、貼底」的最後一個祖先來套 translateY；同一張卡在不同機器上
  可能挑到 .composer-scope，也可能挑到它的子節點 .chat-bottom（owner 2026-09-22 的
  Android 截圖就是後者：玻璃那層推上去了，最外層沒動，侵入量量成 0，動作列壓在
  玻璃底下只露一半）。只看最外層就會漏掉這種情況。
*/
export function paintedTop(rects: PaintedRect[]): number {
  let top = Number.POSITIVE_INFINITY
  for (const r of rects) {
    if (!(r.height > 0) || !(r.width > 0)) continue
    if (r.position === 'absolute' || r.position === 'fixed') continue
    if (r.top < top) top = r.top
  }
  return top
}
