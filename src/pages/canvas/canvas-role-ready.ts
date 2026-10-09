import { watch, type WatchSource } from 'vue'

/**
 * 等角色細節到手（或逾時）再往下做。
 *
 * 沙箱殼只在握手時收一次 hello，裡面的卡名、頭像與卡片語言都讀角色細節；作者資產與角色細節
 * 是兩個並行的請求，殼又可能從快取秒開——不等的話 hello 會帶著空值送出，整個 session 都用不到
 * 卡片語言（簡繁方向退回只看介面語言）。store 裡的角色可能還是上一張卡，所以要比對卡片 ID。
 * 角色細節讀不到時不能讓殼永遠掛不上，逾時就照現有資料走。
 */
export function whenRoleDetail(
  current: WatchSource<any>,
  read: () => any,
  targetRoleId: string,
  timeoutMs = 3000,
): Promise<void> {
  const matches = () => {
    const role = read()
    return !!role && String(role.characterRoleId || '').toLowerCase() === targetRoleId.toLowerCase()
  }
  if (!targetRoleId || matches()) return Promise.resolve()
  return new Promise((resolve) => {
    let done = false
    let stop: (() => void) | null = null
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (stop) stop()
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    stop = watch(current, () => { if (matches()) finish() })
  })
}
