// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mountGeometryDebug, rectText } from '../geometry-debug'

describe('幾何除錯面板', () => {
  it('掛上一塊 fixed 的唯讀面板，內容含視窗數值與 extra，解除後移除', async () => {
    const dispose = mountGeometryDebug(document, window, 'host', () => ({ foo: 'bar' }), 20)
    const el = document.querySelector('[data-lt="geometry-debug"]') as HTMLElement
    expect(el).toBeTruthy()
    expect(el.style.pointerEvents).toBe('none')
    expect(el.textContent).toContain('[host]')
    expect(el.textContent).toContain('inner=')
    expect(el.textContent).toContain('foo=bar')
    await new Promise((r) => setTimeout(r, 50))
    dispose()
    expect(document.querySelector('[data-lt="geometry-debug"]')).toBeNull()
  })

  it('rectText 沒節點回 -', () => {
    expect(rectText(null)).toBe('-')
  })
})
