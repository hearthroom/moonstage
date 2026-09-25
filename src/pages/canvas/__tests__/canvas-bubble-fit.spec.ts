import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bubbleCap, clampWideBubble, FIT_ATTR, resetBubbleFit } from '../canvas-bubble-fit'

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

  it('一般畫布與沙箱殼都綁上保底', () => {
    expect(vue).toMatch(/bindBubbleFit\(\{/)
    expect(shell).toMatch(/bindBubbleFit\(\{/)
  })
})
