import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bindCanvasViewport, restoreAfterKeyboard, visibleViewport } from '../canvas-viewport'

afterEach(() => vi.restoreAllMocks())

function browser() {
  const vv = Object.assign(new EventTarget(), { offsetTop: 0, height: 800, scale: 1 })
  const vk = Object.assign(new EventTarget(), { overlaysContent: false, boundingRect: { top: 800, height: 0 } })
  const doc = Object.assign(new EventTarget(), { fullscreenElement: null as object | null })
  const win = Object.assign(new EventTarget(), { innerHeight: 800, visualViewport: vv,
    navigator: { virtualKeyboard: vk }, document: doc,
    requestAnimationFrame: (fn: FrameRequestCallback) => { fn(0); return 1 }, cancelAnimationFrame: vi.fn() })
  return { win: win as unknown as Window, vv, vk, doc }
}

it('fits the canvas above a keyboard that only shrinks the visual viewport, and restores on close', () => {
  const { win, vv } = browser(), root = document.createElement('div')
  const dispose = bindCanvasViewport(win, root)
  vv.height = 460; vv.offsetTop = 20; vv.dispatchEvent(new Event('resize'))
  expect(root.style.getPropertyValue('--lt-viewport-top')).toBe('20px')
  expect(root.style.getPropertyValue('--lt-viewport-height')).toBe('460px')
  expect(root.style.getPropertyValue('--lt-viewport-bottom')).toBe('320px')
  vv.height = 800; vv.offsetTop = 0; vv.dispatchEvent(new Event('resize'))
  expect(root.style.getPropertyValue('--lt-viewport-height')).toBe('800px')
  dispose()
  expect(root.style.getPropertyValue('--lt-viewport-height')).toBe('')
})

it('handles fullscreen overlay keyboard geometry without double-subtracting a resized viewport', () => {
  const { win, vv, vk, doc } = browser(), root = document.createElement('div')
  const dispose = bindCanvasViewport(win, root)
  expect(vk.overlaysContent).toBe(false)
  doc.fullscreenElement = {}; doc.dispatchEvent(new Event('fullscreenchange'))
  expect(vk.overlaysContent).toBe(true)
  vk.boundingRect = { top: 470, height: 330 }; vk.dispatchEvent(new Event('geometrychange'))
  expect(root.style.getPropertyValue('--lt-viewport-height')).toBe('470px')
  vv.height = 470; vv.dispatchEvent(new Event('resize'))
  expect(visibleViewport(win)).toEqual({ top: 0, bottom: 470, height: 470 })
  doc.fullscreenElement = null; doc.dispatchEvent(new Event('fullscreenchange'))
  expect(vk.overlaysContent).toBe(false)
  dispose()
  vk.boundingRect = { top: 400, height: 400 }; vk.dispatchEvent(new Event('geometrychange'))
  expect(root.style.getPropertyValue('--lt-viewport-height')).toBe('')
})

it('preserves native pinch zoom and falls back when viewport APIs are absent', () => {
  const { win, vv } = browser()
  vv.scale = 2; vv.height = 400
  expect(visibleViewport(win).height).toBe(800)
  Object.defineProperty(win, 'visualViewport', { value: null })
  Object.defineProperty(win, 'navigator', { value: {} })
  expect(visibleViewport(win)).toEqual({ top: 0, bottom: 800, height: 800 })
})

// 一般模式不跟 visualViewport：iOS Safari 在輸入框聚焦、捲動鏈到文件時自己會捲頁，每次
// visualViewport 一變就改寫 fixed 根的 top/height 會跟它打架——拖到底畫面跳回去、鍵盤後面
// 白屏（owner 2026-09-22 iOS 回報，這條上線幾小時後）。變數照寫（沙箱全舞台要用），
// 只有全螢幕的一般畫布才讀它。
describe('一般畫布只在全螢幕時讀視窗變數', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.css'), 'utf8')
  const vue = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
  const block = (sel: string) => css.match(new RegExp(sel.replace(/[.]/g, '\\.') + ' \\{[^}]*\\}'))?.[0] || ''

  it('.canvas-root 的基底是 inset: 0，不含視窗變數', () => {
    const root = block('.canvas-root')
    expect(root).toMatch(/inset: 0;/)
    expect(root).not.toMatch(/--lt-viewport/)
  })

  it('.canvas-root.is-fullscreen 才吃 --lt-viewport-top／height，且模板在全螢幕時掛上這個 class', () => {
    const full = block('.canvas-root.is-fullscreen')
    expect(full).toMatch(/top: var\(--lt-viewport-top, 0px\)/)
    expect(full).toMatch(/height: var\(--lt-viewport-height, 100%\)/)
    expect(vue).toMatch(/'is-fullscreen': fullscreenActive/)
  })
})

// iOS Safari 為了露出 iframe 裡的輸入框把視覺視窗往上平移，鍵盤收起後不平移回來：畫布整個往上偏 49px、
// 底下空白（owner 2026-09-22 面板數值 iframe=-49..747）。鍵盤收起（視覺視窗高度回到整個視窗）且有偏移就捲回原點。
describe('鍵盤收起後把視覺視窗捲回原點', () => {
  const fake = (over: { vvHeight: number; offsetTop: number; scrollY?: number; fullscreen?: boolean }) => {
    const scrollTo = vi.fn()
    const win = { innerHeight: 796, scrollY: over.scrollY ?? 0, scrollTo, visualViewport: { height: over.vvHeight, offsetTop: over.offsetTop, scale: 1 }, document: { fullscreenElement: over.fullscreen ? {} : null } }
    return { win: win as unknown as Window, scrollTo }
  }
  it('鍵盤收起、視覺視窗仍偏移 49px → scrollTo(0,0)', () => {
    const { win, scrollTo } = fake({ vvHeight: 796, offsetTop: 49 })
    restoreAfterKeyboard(win)
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })
  it('鍵盤開著（視覺視窗還短）不動；沒有偏移不動；全螢幕不動', () => {
    for (const over of [{ vvHeight: 456, offsetTop: 300 }, { vvHeight: 796, offsetTop: 0 }, { vvHeight: 796, offsetTop: 49, fullscreen: true }]) {
      const { win, scrollTo } = fake(over)
      restoreAfterKeyboard(win)
      expect(scrollTo).not.toHaveBeenCalled()
    }
  })
  it('殼不再自己聽 iframe 的 visualViewport（宿主是唯一來源）', () => {
    const main = readFileSync(resolve(process.cwd(), 'src/sandbox/main.ts'), 'utf8')
    expect(main).not.toMatch(/visualViewport\.addEventListener|vv\.addEventListener/)
  })
})
