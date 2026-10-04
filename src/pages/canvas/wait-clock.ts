/**
 * 等第一個字的時候已經等了多久（owner 2026-10-05）。
 *
 * 玩家要分得出「它在想」和「卡住了」：指示器的字照舊輪換，旁邊多一個已經等了幾秒。
 * 不寫「模型還沒回應」——時間久了自己看得出來，要等、要停、要換模型由玩家判斷。
 *
 * 從這顆等回覆的氣泡第一次出現開始算，不是從按下送出：重新整理接回一輪還在跑的
 * 回覆時，畫面上沒有更早的時間可以對；從接回的那一刻算起，至少不會報錯的數字。
 */
export interface WaitClock {
  elapsedSeconds(id: string): number
  /** 只留還在等的那幾顆，其餘忘掉（回覆來了、氣泡換掉）。 */
  keepOnly(ids: Set<string>): void
}

export function createWaitClock(now: () => number): WaitClock {
  const started = new Map<string, number>()
  return {
    elapsedSeconds(id) {
      const at = now()
      if (!started.has(id)) started.set(id, at)
      return Math.max(0, Math.floor((at - (started.get(id) as number)) / 1000))
    },
    keepOnly(ids) {
      for (const id of [...started.keys()]) if (!ids.has(id)) started.delete(id)
    },
  }
}

export function formatWaitElapsed(seconds: number, t: (key: string) => string): string {
  if (!(seconds >= 1)) return ''
  if (seconds < 60) return t('chat.waitSeconds').replace('{s}', String(seconds))
  const m = Math.floor(seconds / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return t('chat.waitMinutes').replace('{m}', String(m)).replace('{s}', s)
}
