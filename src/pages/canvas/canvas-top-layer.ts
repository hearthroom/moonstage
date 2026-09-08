/**
 * 系統彈層與停止鍵進瀏覽器的 top layer（popover API）。
 *
 * 為什麼不比 z-index：舞台的樣式整份包在 @layer 裡、刻意輸給卡片，而卡片常把
 * `position: fixed` 的面板寫成 `z-index: 2147483647 !important`——這場比賽舞台注定輸，
 * 模型設定一打開就被卡片的行動選項、場景卡蓋住（owner 2026-09-08 截圖）。
 * top layer 不看 z-index，也不受任何祖先的 stacking context 或 transform 影響。
 *
 * top layer 裡後進者在上。停止鍵（I-2：生成中永遠按得到）本來靠 z-index 60 浮在彈層之上，
 * 現在彈層每次打開都把它重新抬一次，順序才對。
 *
 * 沒有 popover API 的瀏覽器（Chrome < 114、Safari < 17）什麼都不做，仍是原本 z-index 的老規矩。
 */
type PopoverEl = HTMLElement & { showPopover?: () => void; hidePopover?: () => void }

function isOpen(el: PopoverEl): boolean {
  try { return el.matches(':popover-open') } catch { return false }
}

/** 抬到 top layer 最上面；已經在裡面就先出來再進去（順序才會變最後）。 */
export function raiseToTopLayer(el: HTMLElement | null | undefined): void {
  const target = el as PopoverEl | null | undefined
  if (!target || typeof target.showPopover !== 'function' || !target.isConnected) return
  if (isOpen(target)) target.hidePopover?.()
  target.showPopover()
}

export function leaveTopLayer(el: HTMLElement | null | undefined): void {
  const target = el as PopoverEl | null | undefined
  if (!target || typeof target.hidePopover !== 'function') return
  if (isOpen(target)) target.hidePopover()
}

/** 彈層打開後呼叫：停止鍵若正在 top layer 裡，重新抬到彈層之上。 */
export function raiseStopAboveDialogs(): void {
  if (typeof document === 'undefined') return
  const stop = document.getElementById('mes_stop') as PopoverEl | null
  if (stop && typeof stop.showPopover === 'function' && isOpen(stop)) raiseToTopLayer(stop)
}
