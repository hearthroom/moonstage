/**
 * 「結果還在確認中」什麼時候可以說出口。
 *
 * 一輪還在進行時，等待指示器已經在說「還在處理」；改成這張卡沒有給玩家任何新資訊，
 * 只是把可忽略的狀態換成看起來像出事的東西。所以一輪進行中最多壓住五分鐘（產品邊界
 * I-1），到期才真的宣告。
 *
 * 由來（owner 2026-10-01）：送出後底下顯示「整理劇情中…」，上面同時跳出「結果還在
 * 確認中」。壓住的起點原本是一個全域時間戳，只在宣告或收到準備步驟時歸零。某一輪
 * 壓過一次、之後正常完成，時間戳就一直留著；五分鐘後的下一輪第一次走到這裡，就被
 * 判成「已經壓了五分鐘」而直接宣告。
 *
 * 現在起點綁在「哪一輪」上：換了一輪就重新計時，上一輪的時間不會被帶過來。
 */
export function createOutcomeUnconfirmedHold<Turn extends object>(limitMs: number) {
  let heldTurn: Turn | null = null
  let heldSince = 0

  return {
    // true：這次先不宣告。turn 為 null 表示沒有進行中的一輪，沒有東西可等。
    shouldHold(turn: Turn | null, now: number): boolean {
      if (!turn) return false
      if (heldTurn !== turn) {
        heldTurn = turn
        heldSince = now
      }
      return now - heldSince < limitMs
    },
    reset(): void {
      heldTurn = null
      heldSince = 0
    },
  }
}
