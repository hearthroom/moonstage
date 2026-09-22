import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bindComposerOverhang, composerOverhang, paintedTop } from '../canvas-composer-overhang'

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

  it('量到之後把它寫成 CSS 變數，解綁時清掉（量法搬進 canvas-composer-overhang.ts，畫布與殼共用）', () => {
    const mod = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas-composer-overhang.ts'), 'utf8')
    expect(mod).toMatch(/setProperty\(COMPOSER_OVERHANG_VAR/)
    expect(mod).toMatch(/removeProperty\(COMPOSER_OVERHANG_VAR/)
    expect(mod).toMatch(/composerOverhang\(\{/)
    expect(mod).toMatch(/subtree: true/)
    expect(vue).toMatch(/bindComposerOverhang\(\{/)
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

  it('一般畫布與沙箱殼都用同一個 bindComposerOverhang，各自在自己的文件上量', () => {
    const vue = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
    const shell = readFileSync(resolve(process.cwd(), 'src/sandbox/shell.ts'), 'utf8')
    expect(vue).toMatch(/bindComposerOverhang\(\{/)
    expect(shell).toMatch(/bindComposerOverhang\(\{/)
    // 殼在 dispose 時要解綁
    expect(shell).toMatch(/disposeComposerOverhang\(\)/)
  })

})

// @vitest-environment jsdom 不在檔頭：這組自己用 jsdom 的 document（vitest 預設環境已是 jsdom，見 vitest.config）。
describe('bindComposerOverhang：量、寫變數、盯子樹', () => {
  const rectOf = (el: Element, r: { top: number; height: number; width: number }) => {
    ;(el as HTMLElement).getBoundingClientRect = () => ({ top: r.top, bottom: r.top + r.height, height: r.height, width: r.width, left: 0, right: r.width, x: 0, y: r.top, toJSON() {} } as DOMRect)
  }
  const tick = () => new Promise((r) => setTimeout(r, 40))

  it('作者只推子節點（.chat-bottom）時也量得到，變數寫在 target 上；解綁後清掉', async () => {
    document.body.innerHTML = '<div class="scroll-view"></div><div class="composer-scope"><div class="chat-bottom"><div class="row"></div></div></div>'
    const scroll = document.querySelector('.scroll-view') as HTMLElement
    const composer = document.querySelector('.composer-scope') as HTMLElement
    const child = document.querySelector('.chat-bottom') as HTMLElement
    rectOf(scroll, { top: 54, height: 738, width: 412 })      // 捲動區 54–792
    rectOf(composer, { top: 792, height: 123, width: 412 })   // 最外層沒動
    rectOf(child, { top: 740, height: 123, width: 412 })      // 子節點被推上去 52px
    rectOf(document.querySelector('.row')!, { top: 748, height: 50, width: 412 })
    const dispose = bindComposerOverhang({ doc: document, win: window, scroll, composer, target: document.documentElement })
    await tick()
    expect(document.documentElement.style.getPropertyValue('--lt-canvas-composer-overhang')).toBe('52px')
    // 作者把子節點放回去（裡面的列也跟著回去）：style 變了 → 觀察器重量 → 變數清掉
    rectOf(child, { top: 792, height: 123, width: 412 })
    rectOf(document.querySelector('.row')!, { top: 800, height: 50, width: 412 })
    child.style.transform = 'none'
    await tick()
    expect(document.documentElement.style.getPropertyValue('--lt-canvas-composer-overhang')).toBe('')
    // 再推一次，然後解綁
    rectOf(child, { top: 740, height: 123, width: 412 })
    rectOf(document.querySelector('.row')!, { top: 748, height: 50, width: 412 })
    child.style.transform = 'translateY(-52px)'
    await tick()
    expect(document.documentElement.style.getPropertyValue('--lt-canvas-composer-overhang')).toBe('52px')
    dispose()
    expect(document.documentElement.style.getPropertyValue('--lt-canvas-composer-overhang')).toBe('')
  })

  it('沒有捲動區或輸入區就什麼都不做', () => {
    document.body.innerHTML = ''
    expect(() => bindComposerOverhang({ doc: document, win: window, scroll: null, composer: null, target: document.documentElement })()).not.toThrow()
  })
})
