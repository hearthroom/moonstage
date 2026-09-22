import { afterEach, expect, it, vi } from 'vitest'
import { bindCanvasViewport, visibleViewport } from '../canvas-viewport'

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
