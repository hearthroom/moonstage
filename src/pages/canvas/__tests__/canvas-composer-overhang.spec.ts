import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { composerOverhang } from '../canvas-composer-overhang'

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

describe('捲底哨兵也要把這段內距捲出來', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.css'), 'utf8')

  // 哨兵住在內距之上：scrollIntoView({block:'end'}) 把哨兵貼到容器下緣，內距永遠留在
  // 視窗外，最後一則的動作列（重新生成／上下文／…）就一直躺在被推上來的輸入區底下。
  // owner 2026-09-22 回報：手機上那一列只露一半，怎麼滑都滑不出來（作者 HUD 一重畫
  // 哨兵就把畫面拉回去）。哨兵要以 scroll-margin-bottom 吃同一個底部內距。
  it('.chat-scroll-anchor 的 scroll-margin-bottom 吃 #chat 同一個底部內距變數', () => {
    const anchor = css.match(/\.chat-scroll-anchor \{[^}]*\}/)?.[0] || ''
    expect(anchor).toMatch(/scroll-margin-bottom:\s*var\(--lt-chat-pad-bottom\)/)
  })

  it('那個變數在桌機與手機兩條 #chat 上都含 --lt-canvas-composer-overhang，內距只從它讀', () => {
    const defs = css.match(/#chat \{[^}]*--lt-chat-pad-bottom:\s*calc\(\d+px \+ var\(--lt-canvas-composer-overhang, 0px\)\)/g) || []
    expect(defs.length).toBe(2)
    const pads = css.match(/#chat \{[^}]*padding:[^;]*var\(--lt-chat-pad-bottom\)/g) || []
    expect(pads.length).toBe(2)
  })
})
