/**
 * 首屏就緒：宿主在舞台畫出東西之前蓋著自己的載入畫面（stageHost.ui.contentReady），
 * 這裡決定什麼時候叫它收掉。每個畫布只通知一次。
 *
 * 一般卡等兩件事：作者版面規則到手（沒到就收，下一刻版面才套上去，整頁會跳）與第一則訊息上畫面
 * （開場白、接續的歷史、或歷史載入失敗的那一則錯誤都算）。沙箱卡的畫面在殼裡：本頁的訊息列表
 * 早就有東西了，殼卻可能還在載，要等殼畫好喊 ready；殼握手逾時也算，逾時提示要露出來。
 */
export interface ContentState {
  sandboxCard: boolean
  sandboxShellReady: boolean
  sandboxFailed: boolean
  authorAssetSettled: boolean
  messageCount: number
}

export function contentShown(s: ContentState): boolean {
  if (s.sandboxCard) return s.sandboxShellReady || s.sandboxFailed
  return s.authorAssetSettled && s.messageCount > 0
}

/**
 * mark() 之後隔兩個影格才通知：第一個影格是這次更新排進去，第二個才確定已經畫上螢幕。
 * dispose() 之後不再通知（換卡時舊畫布的影格晚到）。
 */
export function createContentReady(
  notify: (() => void) | undefined,
  frame: (cb: () => void) => void = (cb) => requestAnimationFrame(() => cb()),
) {
  let done = false
  let disposed = false
  return {
    mark() {
      if (done) return
      done = true
      frame(() => frame(() => { if (!disposed) notify?.() }))
    },
    dispose() { disposed = true },
  }
}
