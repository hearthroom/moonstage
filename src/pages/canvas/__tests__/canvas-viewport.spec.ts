import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bindCanvasViewport, settleVisualViewport, visibleViewport } from '../canvas-viewport'

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

// 畫布跟著可見視窗走：鍵盤開著時視覺視窗變矮，畫布跟著縮，輸入區才在鍵盤上方（owner 2026-09-22 iOS
// 面板數值：可見 447、畫布仍 796、輸入框 655 被蓋住）。之前限制成只在全螢幕才跟，是誤判。
describe('畫布跟著可見視窗走', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.css'), 'utf8')
  it('.canvas-root 無條件讀 --lt-viewport-top／height；沒有 is-fullscreen 限定的版本', () => {
    const root = css.match(/\.canvas-root \{[^}]*\}/)?.[0] || ''
    expect(root).toMatch(/top: var\(--lt-viewport-top, 0px\)/)
    expect(root).toMatch(/height: var\(--lt-viewport-height, 100%\)/)
    expect(css).not.toMatch(/\.canvas-root\.is-fullscreen \{/)
  })
})

// iOS Safari 聚焦輸入框時可能把視覺視窗往上平移（鍵盤開著或收起後都可能殘留）；畫布永遠跟著可見視窗高，
// 平移從來不是必要的（owner 2026-09-22 iOS：兩三成機率整頁黑、先前 iframe=-49..747）。偵測到就歸零。
describe('視覺視窗有平移就捲回原點', () => {
  const fake = (over: { vvHeight: number; offsetTop: number; scrollY?: number; fullscreen?: boolean }) => {
    const scrollTo = vi.fn()
    const win = { innerHeight: 796, scrollY: over.scrollY ?? 0, scrollTo, visualViewport: { height: over.vvHeight, offsetTop: over.offsetTop, scale: 1 }, document: { fullscreenElement: over.fullscreen ? {} : null } }
    return { win: win as unknown as Window, scrollTo }
  }
  it('鍵盤開著、視覺視窗被平移 349px → scrollTo(0,0)；鍵盤收起仍偏移 49px → 也歸零', () => {
    for (const over of [{ vvHeight: 447, offsetTop: 349 }, { vvHeight: 796, offsetTop: 49 }]) {
      const { win, scrollTo } = fake(over)
      settleVisualViewport(win)
      expect(scrollTo).toHaveBeenCalledWith(0, 0)
    }
  })
  it('沒有偏移不動；全螢幕不動', () => {
    for (const over of [{ vvHeight: 447, offsetTop: 0 }, { vvHeight: 796, offsetTop: 49, fullscreen: true }]) {
      const { win, scrollTo } = fake(over)
      settleVisualViewport(win)
      expect(scrollTo).not.toHaveBeenCalled()
    }
  })
  it('綁定後每次視窗變化除了當下，60ms 與 300ms 後再各檢查一次（Safari 的平移可能晚於 resize）', () => {
    vi.useFakeTimers()
    try {
      const { win, vv } = browser(), root = document.createElement('div')
      const scrollTo = vi.fn()
      Object.assign(win as unknown as Record<string, unknown>, { scrollTo, scrollY: 0, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
      const dispose = bindCanvasViewport(win, root)
      vv.height = 447; vv.dispatchEvent(new Event('resize'))
      expect(scrollTo).not.toHaveBeenCalled()          // 還沒平移
      vv.offsetTop = 349                                 // Safari 之後才平移
      vi.advanceTimersByTime(70)
      expect(scrollTo).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(300)
      expect(scrollTo).toHaveBeenCalledTimes(2)
      dispose()
    } finally { vi.useRealTimers() }
  })
  it('殼不再自己聽 iframe 的 visualViewport（宿主是唯一來源）', () => {
    const main = readFileSync(resolve(process.cwd(), 'src/sandbox/main.ts'), 'utf8')
    expect(main).not.toMatch(/visualViewport\.addEventListener|vv\.addEventListener/)
  })
})

// iOS Safari 聚焦字級小於 16px 的欄位會把整頁自動放大（owner 2026-09-22 面板數值 scale 1.07），
// 收鍵盤後不縮回來，整個畫布上偏、殼的根縮短。觸控裝置上輸入欄位一律 ≥16px。
describe('觸控裝置上輸入欄位字級不小於 16px（擋 iOS 自動放大）', () => {
  it('canvas.css 在 (hover: none) and (pointer: coarse) 下把 .uni-textarea 與 textarea／input 設成 max(16px, 1em)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.css'), 'utf8')
    const block = css.match(/@media \(hover: none\) and \(pointer: coarse\) \{[\s\S]*?\n\}/)?.[0] || ''
    expect(block).toMatch(/\.canvas-root \.uni-textarea,/)
    expect(block).toMatch(/\.canvas-root textarea,/)
    expect(block).toMatch(/font-size: max\(16px, 1em\)/)
  })
})

// Android Chrome 全螢幕實測（owner 2026-09-22 面板數值）：kb=top0 h340，視窗 622——高度對、top 是 0。
// 只信 top 會把鍵盤當不存在，畫布維持 622、輸入框被蓋住。鍵盤貼底，用視窗高減鍵盤高推回 282。
it('鍵盤矩形 top 為 0 但有高度：以視窗高減鍵盤高當鍵盤上緣', () => {
  const { win, vk } = browser()
  Object.defineProperty(win, 'innerHeight', { value: 622, configurable: true })
  vk.overlaysContent = true // 這個矩形只在輸入法蓋在頁面上（全螢幕）時才有意義
  vk.boundingRect = { top: 0, height: 340 }
  expect(visibleViewport(win)).toEqual({ top: 0, bottom: 282, height: 282 })
  vk.boundingRect = { top: 282, height: 340 }
  expect(visibleViewport(win)).toEqual({ top: 0, bottom: 282, height: 282 })
})

// 防呆：瀏覽器若已經為鍵盤縮過視窗，拿縮短後的視窗高再減鍵盤高就是扣兩次。
it('全螢幕、矩形 top 為 0、視窗已先縮短：鍵盤不扣兩次', () => {
  const { win, vv, vk, doc } = browser()
  Object.assign(win as unknown as Record<string, unknown>, { screen: { height: 800 } })
  doc.fullscreenElement = {}
  vk.overlaysContent = true
  Object.defineProperty(win, 'innerHeight', { value: 500, configurable: true })
  vv.height = 500
  vk.boundingRect = { top: 0, height: 300 }
  expect(visibleViewport(win)).toEqual({ top: 0, bottom: 500, height: 500 })
  // 視窗沒縮（原本 09-22 的情況）：照樣扣到鍵盤上緣
  Object.defineProperty(win, 'innerHeight', { value: 800, configurable: true })
  vv.height = 800
  expect(visibleViewport(win)).toEqual({ top: 0, bottom: 500, height: 500 })
  // Chrome 只縮視覺視窗、版面視窗不動：同樣不能再扣
  vv.height = 500
  expect(visibleViewport(win)).toEqual({ top: 0, bottom: 500, height: 500 })
  // 瀏海讓全螢幕視窗比螢幕矮 30、鍵盤還沒被扣：仍以視窗高減鍵盤高
  Object.defineProperty(win, 'innerHeight', { value: 770, configurable: true })
  vv.height = 770
  expect(visibleViewport(win)).toEqual({ top: 0, bottom: 470, height: 470 })
})

// owner 2026-09-26 面板數值（Android 全螢幕，視窗沒縮）：inner 859、kb=top220 h319 ov1、root 0..220。
// 高度對、上緣卻是錯的非零值（鍵盤實際在 540）；信了它輸入區只剩 220 高、下面一大塊黑。
// 上緣報 0 與報錯值都見過，只有高度一直對：鍵盤貼底，上緣一律用「視窗高 − 鍵盤高」算。
it('全螢幕矩形上緣是錯的非零值：只信高度', () => {
  const { win, vv, vk, doc } = browser()
  Object.assign(win as unknown as Record<string, unknown>, { screen: { height: 859 } })
  doc.fullscreenElement = {}
  vk.overlaysContent = true
  Object.defineProperty(win, 'innerHeight', { value: 859, configurable: true })
  vv.height = 860
  vk.boundingRect = { top: 220, height: 319 }
  expect(visibleViewport(win)).toEqual({ top: 0, bottom: 540, height: 540 })
})

// 小米使用者 2026-09-25（classic 卡）：鍵盤收起後輸入區停在半空、下方空一塊鍵盤高，點畫面也縮不回去。
// 鍵盤矩形只有輸入法蓋在頁面上時瀏覽器才會更新；離開全螢幕後它停在最後的值。非全螢幕時瀏覽器
// 自己會縮視窗，再扣一次這個舊矩形就是永遠多扣一塊鍵盤高。
it('離開全螢幕後殘留的鍵盤矩形不再扣：非覆蓋模式只看視窗', () => {
  const { win, vv, vk, doc } = browser(), root = document.createElement('div')
  Object.defineProperty(win, 'innerHeight', { value: 622, configurable: true })
  vv.height = 622
  const dispose = bindCanvasViewport(win, root)
  doc.fullscreenElement = {}; doc.dispatchEvent(new Event('fullscreenchange'))
  vk.boundingRect = { top: 0, height: 340 }; vk.dispatchEvent(new Event('geometrychange'))
  expect(root.style.getPropertyValue('--lt-viewport-height')).toBe('282px')
  // 鍵盤開著離開全螢幕；之後覆蓋關掉，瀏覽器不再更新矩形
  doc.fullscreenElement = null; doc.dispatchEvent(new Event('fullscreenchange'))
  vv.height = 622; vv.dispatchEvent(new Event('resize'))
  expect(root.style.getPropertyValue('--lt-viewport-height')).toBe('622px')
  expect(visibleViewport(win)).toEqual({ top: 0, bottom: 622, height: 622 })
  dispose()
})

// owner 2026-09-22 Android：鍵盤開著切後台（系統收鍵盤）再切回來，後台收不到幾何事件，畫布卡在縮短狀態。
// 切回可見時重新量、把焦點從輸入框移開，稍後再量一次。
it('從後台切回來：重新量、把焦點移開，60ms 後再量一次', () => {
  vi.useFakeTimers()
  try {
    const { win, vk, doc } = browser(), root = document.createElement('div')
    const ta = document.createElement('textarea'); document.body.appendChild(ta); ta.focus()
    Object.assign(win as unknown as Record<string, unknown>, { scrollTo: vi.fn(), scrollY: 0, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
    let visibility = 'visible'
    Object.assign(doc, { activeElement: ta, body: document.body })
    Object.defineProperty(doc, 'visibilityState', { get: () => visibility, configurable: true })
    Object.defineProperty(win, 'innerHeight', { value: 622, configurable: true })
    doc.fullscreenElement = {}
    const dispose = bindCanvasViewport(win, root)
    vk.boundingRect = { top: 0, height: 340 }; vk.dispatchEvent(new Event('geometrychange'))
    expect(root.style.getPropertyValue('--lt-viewport-height')).toBe('282px')
    // 切到後台：系統收鍵盤，但沒有事件
    visibility = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'))
    vk.boundingRect = { top: 0, height: 0 }
    // 切回來
    visibility = 'visible'; doc.dispatchEvent(new Event('visibilitychange'))
    expect(document.activeElement).not.toBe(ta)
    expect(root.style.getPropertyValue('--lt-viewport-height')).toBe('622px')
    // 鍵盤矩形晚一點才歸零的情況：60ms 後再量
    vk.boundingRect = { top: 0, height: 340 }; vk.dispatchEvent(new Event('geometrychange'))
    vk.boundingRect = { top: 0, height: 0 }
    vi.advanceTimersByTime(70)
    expect(root.style.getPropertyValue('--lt-viewport-height')).toBe('622px')
    dispose(); ta.remove()
  } finally { vi.useRealTimers() }
})
