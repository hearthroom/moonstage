/**
 * 作者接管了哪一塊，我們就在那一塊讓位。
 *
 * 由來（owner 2026-09-10）：一張 MMD 卡把「＋」面板的圖示槽畫成深色藥丸，
 * 但沒有畫格子本身——在 MMD 那邊格子沒有底色，所以作者沒有理由去畫它。
 * 到我們這裡格子帶著宿主的淺色底，畫面上就是「淺色格子裡包一顆深色藥丸」。
 *
 * 兩條路都不對：留著底色，MMD 卡永遠對不上；拿掉底色，沒美化的卡也跟著變。
 * 判據不是「這張卡是哪個格式」（沒宣告一律當 mmd，等於全部），是「作者有沒有
 * 伸手碰這一塊」。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { detectAuthorOwnedRegions } from '../canvas-author-regions'

const wrap = (css: string) => `<div>x</div><style class="my-beauty-style">${css}</style>`

describe('detectAuthorOwnedRegions', () => {
  it('沒有 style 就沒有任何接管', () => {
    expect(detectAuthorOwnedRegions('<div>只有內容</div>')).toEqual([])
  })

  it('作者畫了圖示槽＝接管面板', () => {
    const css = '.chat .chat-bottom .more-scope .item .item-icon{background:#182030}'
    expect(detectAuthorOwnedRegions(wrap(css))).toEqual(['panel'])
  })

  it('作者只畫了面板容器也算接管', () => {
    expect(detectAuthorOwnedRegions(wrap('.more-scope{padding:0}'))).toEqual(['panel'])
  })

  it('碰別處不算接管面板', () => {
    expect(detectAuthorOwnedRegions(wrap('.touch-scope .content.left{color:#fff}'))).toEqual([])
  })

  it('名字只是另一個 class 的前綴不算命中', () => {
    expect(detectAuthorOwnedRegions(wrap('.item-iconography{color:red}'))).toEqual([])
  })

  it('宣告區裡出現同名字串不算命中', () => {
    expect(detectAuthorOwnedRegions(wrap('.foo{background:url("item-icon.png")}'))).toEqual([])
  })

  it('@media 裡面的規則照樣算', () => {
    const css = '@media (max-width:768px){.more-scope .item{background:none}}'
    expect(detectAuthorOwnedRegions(wrap(css))).toEqual(['panel'])
  })

  it('多個 style 標籤合併，結果去重且穩定排序', () => {
    const html = wrap('.item-icon{color:red}') + wrap('.more-scope{color:red}')
    expect(detectAuthorOwnedRegions(html)).toEqual(['panel'])
  })
})

/**
 * 讓位是靠 CSS 的 :not() 做的，不是靠 JS 改樣式：作者的規則不分層、天然贏過我們，
 * 我們要做的只是「不要在他畫過的地方先畫一層」。
 */
describe('面板的宿主底色只在沒被接管時生效', () => {
  const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')

  it('面板容器的底色帶著 :not(接管面板)', () => {
    expect(css).toMatch(/\.canvas-root:not\(\[data-lt-author-owns~="panel"\]\)[^{]*\.more-scope\s*\{[^}]*--lt-canvas-panel-bg/)
  })

  it('格子的底色帶著 :not(接管面板)', () => {
    expect(css).toMatch(/\.canvas-root:not\(\[data-lt-author-owns~="panel"\]\)[^{]*\.more-scope \.item\s*\{[^}]*--lt-canvas-panel-item-bg/)
  })

  it('版面規則（grid、間距）不受接管影響，仍留在無條件的那條裡', () => {
    expect(css).toMatch(/\n  \.more-scope \{[^}]*grid-template-columns/)
  })
})

describe('畫布根節點把接管清單掛成屬性', () => {
  const vue = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')

  it('模板上有 data-lt-author-owns', () => {
    expect(vue).toMatch(/:data-lt-author-owns=/)
  })

  it('掛載作者資產時算出接管清單', () => {
    expect(vue).toMatch(/detectAuthorOwnedRegions\(/)
  })
})

describe('離場要把接管清單收回來', () => {
  const vue = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')

  it('disposeAuthorAsset 把清單清空', () => {
    const start = vue.indexOf('function disposeAuthorAsset()')
    expect(start).toBeGreaterThan(-1)
    const body = vue.slice(start, vue.indexOf('\n}', start))
    expect(body).toMatch(/authorOwnedRegions\.value = ''/)
  })
})
