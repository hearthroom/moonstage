import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { composerOverhang, paintedTop } from '../canvas-composer-overhang'

describe('輸入區侵入捲動區的量', () => {
  it('作者把輸入區往上推 52px 時，對話欄要多 52px 底部內距', () => {
    // 實測 一張 MMD 匯入卡 卡（390×844）：捲動區 54–728，輸入區被 translateY(-52px) 推到 676
    expect(composerOverhang({ scrollBottom: 728, scrollHeight: 674, composerTop: 676, composerHeight: 117 })).toBe(52)
  })

  it('沒有被推（輸入區剛好接在捲動區底下）就是 0', () => {
    expect(composerOverhang({ scrollBottom: 728, scrollHeight: 674, composerTop: 728, composerHeight: 117 })).toBe(0)
    expect(composerOverhang({ scrollBottom: 728, scrollHeight: 674, composerTop: 740, composerHeight: 117 })).toBe(0)
  })

  it('輸入區被藏起來時沒有侵入——不然 top=0 會算出整片捲動區的高', () => {
    expect(composerOverhang({ scrollBottom: 728, scrollHeight: 674, composerTop: 0, composerHeight: 0 })).toBe(0)
  })

  it('推到畫面上半部這種極端狀況不當侵入處理', () => {
    expect(composerOverhang({ scrollBottom: 728, scrollHeight: 674, composerTop: 200, composerHeight: 117 })).toBe(0)
  })

  it('小數四捨五入成整數像素', () => {
    expect(composerOverhang({ scrollBottom: 728.4, scrollHeight: 674, composerTop: 676.1, composerHeight: 117 })).toBe(52)
  })
})

describe('對話欄的底部內距吃這個量', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.css'), 'utf8')
  const vue = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')

  it('桌機與手機兩條 #chat 的底部內距變數都加上 --lt-canvas-composer-overhang', () => {
    // 內距改從 --lt-chat-pad-bottom 讀（哨兵要吃同一個量，見下一組），所以這裡驗的是變數定義。
    const hits = css.match(/#chat \{[^}]*--lt-chat-pad-bottom:[^;]*var\(--lt-canvas-composer-overhang, 0px\)/g) || []
    expect(hits.length).toBe(2)
  })

  it('畫布量到之後把它寫成 CSS 變數，卸載時清掉', () => {
    expect(vue).toContain("setProperty('--lt-canvas-composer-overhang'")
    expect(vue).toContain("removeProperty('--lt-canvas-composer-overhang')")
    expect(vue).toMatch(/composerOverhang\(\{/)
  })
})

describe('捲底要把這段內距一起捲出來', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.css'), 'utf8')
  const vue = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
  const body = () => {
    const i = vue.indexOf('function scrollAnchorIntoView()')
    return vue.slice(i, vue.indexOf('\n}\n', i))
  }

  // 哨兵住在內距之上：用 scrollIntoView 把哨兵貼到容器下緣，內距永遠留在視窗外，
  // 最後一則的動作列（重新生成／上下文／…）就一直躺在被推上來的輸入區底下
  // （owner 2026-09-22 手機回報）。第一版用 scroll-margin-bottom 補，結果 iOS Safari
  // 連文件一起捲：鍵盤一彈整頁被推上去露白底、拖到底被拉回。所以捲底只動容器的
  // scrollTop——內距本來就在 scrollHeight 裡。
  it('捲底直接把 #scrollview 的 scrollTop 設到 scrollHeight，只動容器', () => {
    expect(body()).toMatch(/getElementById\('scrollview'\)/)
    expect(body()).toMatch(/scrollTop = root\.scrollHeight/)
  })

  it('哨兵不掛 scroll-margin-bottom（那會讓 scrollIntoView 去捲文件）', () => {
    const anchor = css.match(/\.chat-scroll-anchor \{[^}]*\}/)?.[0] || ''
    expect(anchor).not.toMatch(/scroll-margin-bottom:/)
  })

  it('底部內距變數在桌機與手機兩條 #chat 上都含 --lt-canvas-composer-overhang，內距只從它讀', () => {
    const defs = css.match(/#chat \{[^}]*--lt-chat-pad-bottom:\s*calc\(\d+px \+ var\(--lt-canvas-composer-overhang, 0px\)\)/g) || []
    expect(defs.length).toBe(2)
    const pads = css.match(/#chat \{[^}]*padding:[^;]*var\(--lt-chat-pad-bottom\)/g) || []
    expect(pads.length).toBe(2)
  })
})

describe('作者推的是輸入區的子節點時，一樣要量到', () => {
  // owner 2026-09-22 Android 截圖：那張 MMD 卡的腳本從 textarea 往上找「寬過半、高不到 190、
  // 貼底」的祖先套 translateY，在那台機器上挑到 .chat-bottom 而不是 .composer-scope。
  // 最外層沒動、玻璃那層推上去了，只量最外層會得到 0，動作列壓在玻璃底下只露一半。
  it('畫出來的上緣取整棵子樹裡最高的節點', () => {
    expect(paintedTop([
      { top: 792, height: 123, width: 412, position: 'relative' }, // .composer-scope 沒動
      { top: 740, height: 123, width: 412, position: 'static' },   // .chat-bottom 被推上去 52px
      { top: 748, height: 50, width: 412, position: 'static' },
    ])).toBe(740)
  })

  it('浮在輸入區上方的 absolute／fixed 子節點（選單、面板）不算本體；沒尺寸的也不算', () => {
    expect(paintedTop([
      { top: 792, height: 123, width: 412, position: 'relative' },
      { top: 500, height: 240, width: 400, position: 'absolute' },
      { top: 100, height: 0, width: 412, position: 'static' },
    ])).toBe(792)
  })

  it('全都沒尺寸時回 Infinity，讓呼叫端退回最外層的 top', () => {
    expect(paintedTop([{ top: 792, height: 0, width: 0 }])).toBe(Number.POSITIVE_INFINITY)
  })

  it('畫布量的是子樹最高點，觀察器也盯子樹', () => {
    const vue = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
    const measure = vue.slice(vue.indexOf('function measureComposerOverhang()'), vue.indexOf('function scheduleComposerOverhang()'))
    expect(measure).toMatch(/paintedTop\(/)
    expect(measure).toMatch(/composer\.querySelectorAll\('\*'\)/)
    const observe = vue.slice(vue.indexOf('function observeComposerOverhang()'), vue.indexOf('function disposeComposerOverhang()'))
    expect(observe).toMatch(/subtree: true/)
  })
})
