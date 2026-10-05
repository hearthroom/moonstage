import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bindBubbleFit, bubbleCap, clampWideBubble, FIT_ATTR, resetBubbleFit } from '../canvas-bubble-fit'

type R = { left: number; right: number; top?: number; bottom?: number }
const rect = (el: Element, r: R) => {
  ;(el as HTMLElement).getBoundingClientRect = () => ({ top: 0, bottom: 10, width: r.right - r.left, height: 10, x: r.left, y: 0, ...r }) as DOMRect
}

// 手機 430 寬：對話欄 0–430，兩側各留 8px 當上限
const limit = { left: 8, right: 422 }

describe('氣泡的寬度上限', () => {
  it('沒超出就是 null（什麼都不做）', () => {
    // #100076 的面板撐開後：34–408
    expect(bubbleCap({ left: 34, right: 408 }, limit)).toBeNull()
  })

  it('靠左的 AI 氣泡往右超出：上限到右界', () => {
    expect(bubbleCap({ left: 34, right: 762 }, limit)).toBe(388)
  })

  it('靠右的玩家氣泡往左超出：上限到左界', () => {
    expect(bubbleCap({ left: -33, right: 395 }, limit)).toBe(387)
  })

  it('兩邊都超出：整個對話欄寬', () => {
    expect(bubbleCap({ left: -50, right: 800 }, limit)).toBe(414)
  })
})

describe('把超出的氣泡鎖回畫面內', () => {
  function build() {
    document.body.innerHTML = `
      <div class="mes_text" id="b" style="padding:0 14px">
        <p id="text">文字</p>
        <div id="wrap"><div id="panel"><div id="inner"></div></div></div>
        <div id="deco" style="position:absolute"></div>
      </div>`
    return {
      b: document.getElementById('b')!,
      text: document.getElementById('text')!,
      wrap: document.getElementById('wrap')!,
      panel: document.getElementById('panel')!,
      inner: document.getElementById('inner')!,
      deco: document.getElementById('deco')!,
    }
  }

  it('沒超出的氣泡一個屬性都不動', () => {
    const n = build()
    rect(n.b, { left: 34, right: 408 })
    expect(clampWideBubble(n.b, limit, window)).toBe(false)
    expect(n.b.getAttribute('style')).toBe('padding:0 14px')
    expect(n.b.hasAttribute(FIT_ATTR)).toBe(false)
  })

  it('超出的：氣泡寬度釘在上限；伸出氣泡內容區的最外層元素收進 100%，底下不再往下改；絕對定位的裝飾不動', () => {
    const n = build()
    n.b.style.boxSizing = 'border-box' // 一般畫布的 .mes_text（實測 #100076）
    rect(n.b, { left: 34, right: 762 })
    rect(n.text, { left: 48, right: 300 })
    rect(n.wrap, { left: 48, right: 748 })
    rect(n.panel, { left: 48, right: 748 })
    rect(n.inner, { left: 48, right: 748 })
    rect(n.deco, { left: 400, right: 900 })
    expect(clampWideBubble(n.b, limit, window)).toBe(true)
    expect(n.b.style.width).toBe('388px')
    expect(n.b.style.maxWidth).toBe('388px')
    expect(n.b.hasAttribute(FIT_ATTR)).toBe(true)
    expect(n.wrap.style.maxWidth).toBe('100%')
    expect(n.wrap.style.minWidth).toBe('0px')
    expect(n.panel.style.maxWidth).toBe('')
    expect(n.text.style.maxWidth).toBe('')
    expect(n.deco.style.maxWidth).toBe('')
  })

  it('沙箱殼的氣泡是 content-box：寬度扣掉內距再寫，外框才會正好停在上限', () => {
    const n = build()
    n.b.style.boxSizing = 'content-box'
    rect(n.b, { left: 34, right: 762 })
    rect(n.wrap, { left: 48, right: 408 })
    rect(n.panel, { left: 48, right: 748 })
    expect(clampWideBubble(n.b, limit, window)).toBe(true)
    expect(n.b.style.width).toBe('360px')
    expect(n.b.style.maxWidth).toBe('360px')
    // 外層包裝沒伸出（48–408 正好是內容區），往下找到真正伸出去的那個
    expect(n.wrap.style.maxWidth).toBe('')
    expect(n.panel.style.maxWidth).toBe('100%')
  })

  it('重設時只拿掉自己加的，作者原本的 inline 樣式留著', () => {
    const n = build()
    n.b.style.boxSizing = 'border-box'
    n.wrap.style.color = 'red'
    rect(n.b, { left: 34, right: 762 })
    rect(n.wrap, { left: 48, right: 748 })
    clampWideBubble(n.b, limit, window)
    resetBubbleFit(document.body)
    expect(n.b.getAttribute('style')).toBe('padding: 0px 14px; box-sizing: border-box;')
    expect(n.wrap.style.maxWidth).toBe('')
    expect(n.wrap.style.color).toBe('red')
    expect(n.b.hasAttribute(FIT_ATTR)).toBe(false)
  })
})

describe('接線', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.css'), 'utf8')
  const vue = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
  const shell = readFileSync(resolve(process.cwd(), 'src/sandbox/shell.ts'), 'utf8')

  it('氣泡那一列撐到內容的最小寬度（寫死寬度的面板不再伸出氣泡）', () => {
    expect(css).toMatch(/\.mes_turn \{[^}]*min-width: min-content;/)
  })

  // 程式碼框裡的長行在框內左右滑，不把氣泡撐寬（否則每則帶程式碼的回覆都要靠上面的保底釘寬）。
  // grid + minmax(0,1fr)：短程式碼照原寬、長的封頂在氣泡上限；width:0 那種寫法會把短訊息的框擠窄。
  it('一般畫布與沙箱殼的程式碼框都在框內左右滑', () => {
    const shellCss = readFileSync(resolve(process.cwd(), 'src/sandbox/shell.css'), 'utf8')
    for (const sheet of [css, shellCss]) {
      expect(sheet).toMatch(/\.mes_text pre:not\(\.lt-frontend\) \{ display: grid; grid-template-columns: minmax\(0, 1fr\); \}/)
      expect(sheet).toMatch(/\.mes_text pre:not\(\.lt-frontend\) > code \{ overflow-x: auto; \}/)
    }
  })

  it('一般畫布與沙箱殼都綁上保底', () => {
    expect(vue).toMatch(/bindBubbleFit\(\{/)
    expect(shell).toMatch(/bindBubbleFit\(\{/)
  })
})

/*
  2026-10-05 玩家回報「沒法捲到最下邊，上下都不行」：對話裡有一則很長程式碼行的 AI 回覆（氣泡被釘寬），
  前面一則玩家貼的卡片代碼在跑每 400ms 一顆的花瓣動畫。舊版每次變動都把最後三則先拿掉寬度再量，
  拿掉的那一瞬間氣泡被長行撐寬、文字換行變少、整頁變矮，瀏覽器把捲動位置往回夾；釘回去之後頁面
  變高，位置卻回不來——停在底部的人每 0.4 秒被往上拉約 300px。jsdom 沒有版面，這裡用假的外框與
  「拿掉寬度就夾捲動位置」模擬瀏覽器。
*/
describe('重量氣泡不能動到讀者的捲動位置', () => {
  const tick = () => new Promise((r) => setTimeout(r, 40))
  const SCROLL_MAX = 3390
  const CLAMPED = 3094

  function mount() {
    document.body.innerHTML = `
      <div id="scroller" style="overflow-y:auto">
        <div id="chat">
          <div class="mes_text" id="m1"><div id="petals"></div></div>
          <div class="mes_text" id="m2">前一則回覆</div>
          <div class="mes_text" id="m3">玩家第16則</div>
          <div class="mes_text" id="m4" style="box-sizing:border-box"><pre id="code"><code>很長的一行</code></pre></div>
        </div>
      </div>`
    const scroller = document.getElementById('scroller')!
    const chat = document.getElementById('chat')!
    const wide = document.getElementById('m4')!
    let top = 0
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v } })
    rect(chat, { left: 0, right: 430 })
    for (const id of ['m1', 'm2', 'm3']) rect(document.getElementById(id)!, { left: 12, right: 300 })
    let measured = 0
    // 沒釘寬時被長行撐到 1121px：此時頁面變矮，捲在底部的位置被夾回去（瀏覽器在量版面時做的事）
    wide.getBoundingClientRect = () => {
      measured++
      if (!wide.style.width) { top = Math.min(top, CLAMPED); return { left: 12, right: 1133, top: 0, bottom: 10, width: 1121, height: 10, x: 12, y: 0 } as DOMRect }
      const w = parseFloat(wide.style.width)
      return { left: 12, right: 12 + w, top: 0, bottom: 10, width: w, height: 10, x: 12, y: 0 } as DOMRect
    }
    rect(document.getElementById('code')!, { left: 26, right: 1119 })
    return { scroller, chat, wide, measured: () => measured, setTop: (v: number) => { top = v }, top: () => top }
  }

  it('別則訊息裡的動畫不會讓已經釘好的氣泡重量', async () => {
    const n = mount()
    const stop = bindBubbleFit({ doc: document, win: window, chat: n.chat, observe: n.chat })
    await tick()
    expect(n.wide.hasAttribute(FIT_ATTR)).toBe(true)
    n.setTop(SCROLL_MAX)
    const before = n.measured()
    const petals = document.getElementById('petals')!
    for (let i = 0; i < 3; i++) { petals.appendChild(document.createElement('div')); await tick() }
    expect(n.measured()).toBe(before)
    expect(n.top()).toBe(SCROLL_MAX)
    stop()
  })

  it('那則氣泡自己有變動、非重量不可時，量完把捲動位置放回原處', async () => {
    const n = mount()
    const stop = bindBubbleFit({ doc: document, win: window, chat: n.chat, observe: n.chat })
    await tick()
    n.setTop(SCROLL_MAX)
    n.wide.appendChild(document.createElement('span'))
    await tick()
    expect(n.wide.hasAttribute(FIT_ATTR)).toBe(true)
    expect(n.top()).toBe(SCROLL_MAX)
    stop()
  })

  it('視窗尺寸改變全部重量時，也把捲動位置放回原處', async () => {
    const n = mount()
    const stop = bindBubbleFit({ doc: document, win: window, chat: n.chat, observe: n.chat })
    await tick()
    n.setTop(SCROLL_MAX)
    window.dispatchEvent(new Event('resize'))
    await tick()
    expect(n.top()).toBe(SCROLL_MAX)
    stop()
  })

  it('新訊息掛上來（變動不在任何氣泡裡）仍會量最後幾則', async () => {
    const n = mount()
    const stop = bindBubbleFit({ doc: document, win: window, chat: n.chat, observe: n.chat })
    await tick()
    const added = document.createElement('div')
    added.className = 'mes_text'
    rect(added, { left: 12, right: 900 })
    n.chat.appendChild(added)
    await tick()
    expect(added.hasAttribute(FIT_ATTR)).toBe(true)
    stop()
  })
})
