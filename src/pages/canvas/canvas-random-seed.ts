/**
 * 作者規則 {{random:a::b}} 的種子：一則訊息一個，在這一頁上固定。
 *
 * 種子的用途是讓同一則訊息裡的隨機選擇不跟著串流每一跳重抽（common/author-rules/rule-job.ts）。
 * 以前直接拿畫布上的訊息 id：新對話的開場白一律是 id 0，每一段新對話的開場白就都抽到同一張
 * （2026-11-04 卡 100256）。沒有自己 id 的（開場白）每一則給一個新的隨機鹽；有 id 的照用 id，
 * 重整後同一則還是同一張。鹽記在那個訊息物件上：開場白重畫幾次都是同一張；換一則（新對話、
 * 換開場白）才重抽。開場白存進對話後帶上自己的 id，重整時改用那個 id，可能換一次。
 */
export function createRandomSeeds(salt: () => string = () => Math.random().toString(36).slice(2)) {
  const seeds = new WeakMap<object, string>()
  return (item: { id?: unknown }): string => {
    let seed = seeds.get(item)
    if (seed) return seed
    const id = item.id
    seed = id == null || id === 0 || id === '0' || id === '' ? `o:${salt()}` : String(id)
    seeds.set(item, seed)
    return seed
  }
}

/** 畫面快取鍵：開場白（沒有自己的 id）按這一則的種子記，換新對話時不拿上一段的畫面；其餘照 id。 */
export function renderCacheKey(item: { id?: unknown }, seedFor: (item: { id?: unknown }) => string): string {
  const id = item.id
  return id == null || id === 0 || id === '0' || id === '' ? seedFor(item) : String(id)
}
