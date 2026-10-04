/**
 * 等第一個字的時候已經等了多久（owner 2026-10-05）。
 *
 * 玩家要分得出「它在想」和「卡住了」：指示器的字照舊輪換，旁邊多一個已經等了幾秒。
 * 不寫「模型還沒回應」——時間久了自己看得出來，要等、要停、要換模型由玩家判斷。
 *
 * 從這顆等回覆的氣泡第一次出現開始算，不是從按下送出：重新整理接回一輪還在跑的
 * 回覆時，畫面上沒有更早的時間可以對；從接回的那一刻算起，至少不會報錯的數字。
 *
 * 宿主只記開始的時間交給指示器，秒數在指示器裡走：每秒改一次訊息資料會讓整頁重畫，
 * 沙箱卡還會每秒收到一次 message.view。
 */
export interface WaitClock {
  /** 這顆氣泡開始等的時間（第一次問到時記下，之後不變）。 */
  startedAt(id: string): number
  /** 只留還在等的那幾顆，其餘忘掉（回覆來了、氣泡換掉）。 */
  keepOnly(ids: Set<string>): void
}

export function createWaitClock(now: () => number): WaitClock {
  const started = new Map<string, number>()
  return {
    startedAt(id) {
      if (!started.has(id)) started.set(id, now())
      return started.get(id) as number
    },
    keepOnly(ids) {
      for (const id of [...started.keys()]) if (!ids.has(id)) started.delete(id)
    },
  }
}

export interface WaitElapsedFormat {
  /** 「{s} 秒」 */
  seconds: string
  /** 「{m} 分 {s} 秒」 */
  minutes: string
}

export function formatWaitElapsed(seconds: number, format: WaitElapsedFormat): string {
  if (!(seconds >= 1) || !format.seconds) return ''
  if (seconds < 60) return format.seconds.replace('{s}', String(seconds))
  const m = Math.floor(seconds / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return (format.minutes || format.seconds).replace('{m}', String(m)).replace('{s}', s)
}
