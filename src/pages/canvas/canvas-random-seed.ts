/**
 * 作者規則 {{random:a::b}} 的種子：一則訊息一個，在這一頁上固定。
 *
 * 種子的用途是讓同一則訊息裡的隨機選擇不跟著串流每一跳重抽（common/author-rules/rule-job.ts）。
 * 以前直接拿畫布上的訊息 id：新對話的開場白一律是 id 0，每一段新對話的開場白就都抽到同一張
 * （2026-11-04 卡 100256）。已建立對話的開場白用對話身分，重整後即使取得自己的訊息 id 也不換圖；
 * 還沒建立對話的預覽才使用物件上的隨機鹽。其餘訊息用自己的 id。
 */
export function createRandomSeeds(salt: () => string = () => Math.random().toString(36).slice(2)) {
  const seeds = new WeakMap<object, string>()
  return (item: { id?: unknown }, openingScope = ''): string => {
    let seed = seeds.get(item)
    if (seed) return seed
    const id = item.id
    seed = openingScope ? `o:${openingScope}` : id == null || id === 0 || id === '0' || id === '' ? `o:${salt()}` : String(id)
    seeds.set(item, seed)
    return seed
  }
}

/** 畫面快取鍵：開場白（沒有自己的 id）按這一則的種子記，換新對話時不拿上一段的畫面；其餘照 id。 */
export function renderCacheKey(item: { id?: unknown }, seedFor: (item: { id?: unknown }) => string): string {
  const id = item.id
  return id == null || id === 0 || id === '0' || id === '' ? seedFor(item) : String(id)
}
