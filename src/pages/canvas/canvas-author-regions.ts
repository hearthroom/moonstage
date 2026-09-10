/**
 * 作者接管了畫布的哪幾塊。
 *
 * ── 為什麼需要這個 ──
 * 我們的預設外觀跟 MMD 的預設外觀不是同一套。作者的卡在 MMD 那邊只畫了他要畫的
 * 部分，其餘留白——留白處 MMD 是素的，我們卻有東西。於是同一張卡在我們這裡多出
 * 一層宿主的顏色，看起來像兩個設計疊在一起（owner 2026-09-10：面板的淺色格子裡
 * 包一顆作者畫的深色藥丸）。
 *
 * 不能用卡片格式當判據：沒宣告一律當 MMD，那等於「幾乎所有卡」，改預設值的風險
 * 一點都沒縮小。真正的判據是「作者有沒有伸手碰這一塊」——碰了就整塊交給他，
 * 沒碰就完全維持現狀。什麼都沒寫的卡一個位元組都不會變。
 *
 * ── 為什麼掃字串就夠 ──
 * 這裡要回答的不是「這條規則會不會生效」，是「作者心裡有沒有這一塊」。作者只要
 * 在選擇器裡寫過那個名字，就代表他認為那塊歸他管。所以只看選擇器、不看宣告，
 * 也不需要解析特異性。
 *
 * 掃描刻意只走選擇器區段：宣告區裡的字串（背景圖檔名之類）不算數。
 */

/** 一塊可以整塊讓位的區域。加新的一塊：在這裡加一行，CSS 那邊加一條 :not()。 */
export type AuthorRegion = 'panel'

/**
 * 每塊的認領標記。作者的選擇器裡出現其中任一個名字，這塊就算他的。
 *
 * 只收「MMD 卡真的會寫、而且寫了就代表要自己畫這塊」的名字。像 `.item` 這種
 * 到處都有的通用名不收，否則一張只改了指令列的卡會意外把面板也接管過去。
 */
const REGION_MARKERS: Record<AuthorRegion, string[]> = {
  panel: ['more-scope', 'item-icon'],
}

const STYLE_TAG = /<style\b[^>]*>([\s\S]*?)<\/style>/gi

/** class 名的邊界：前後不能再接 CSS 識別字元，否則 `.item-iconography` 會誤判。 */
function mentionsName(selectorText: string, name: string): boolean {
  const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${name}([^A-Za-z0-9_-]|$)`)
  return pattern.test(selectorText)
}

/**
 * 取出一段 CSS 裡所有的選擇器文字（宣告區不取）。
 *
 * 手寫掃描而不是丟給 CSSOM：卡片的 CSS 常帶瀏覽器前綴與新語法，CSSOM 看不懂就
 * 整條丟掉，我們會因此少認幾塊而查不出原因。@media 這類條件群組的前言不是選擇器，
 * 但裡面的規則是，所以只跳過前言、繼續往內走。
 */
function collectSelectors(css: string): string[] {
  const source = String(css == null ? '' : css)
  const out: string[] = []
  let buf = ''
  let i = 0
  while (i < source.length) {
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2)
      i = end < 0 ? source.length : end + 2
      continue
    }
    const ch = source[i]
    if (ch === '{') {
      const head = buf.trim()
      buf = ''
      i++
      if (head.startsWith('@')) continue // 條件群組的前言：跳過它，內層規則照走
      if (head) out.push(head)
      // 一般規則的宣告區整段跳掉：裡面的字串不是選擇器
      let depth = 1
      while (i < source.length && depth > 0) {
        if (source.startsWith('/*', i)) {
          const end = source.indexOf('*/', i + 2)
          i = end < 0 ? source.length : end + 2
          continue
        }
        if (source[i] === '{') depth++
        else if (source[i] === '}') depth--
        i++
      }
      continue
    }
    if (ch === '}') { buf = ''; i++; continue }
    buf += ch
    i++
  }
  return out
}

/**
 * 這段作者 HTML 接管了哪幾塊。回傳的順序是固定的，可以直接寫進屬性做比對。
 */
export function detectAuthorOwnedRegions(html: string): AuthorRegion[] {
  const text = String(html == null ? '' : html)
  if (text.indexOf('<style') < 0) return []

  const selectors: string[] = []
  STYLE_TAG.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = STYLE_TAG.exec(text)) !== null) selectors.push(...collectSelectors(m[1]))
  const joined = selectors.join('\n')

  const owned: AuthorRegion[] = []
  for (const region of Object.keys(REGION_MARKERS) as AuthorRegion[]) {
    if (REGION_MARKERS[region].some((name) => mentionsName(joined, name))) owned.push(region)
  }
  return owned
}
