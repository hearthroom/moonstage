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
