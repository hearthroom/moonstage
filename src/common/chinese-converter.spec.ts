import { beforeEach, expect, it, vi } from 'vitest'

const { factory } = vi.hoisted(() => ({ factory: vi.fn(() => (text: string) => text) }))
vi.mock('./chinese-preset', () => ({ Converter: factory }))
beforeEach(() => { vi.resetModules(); factory.mockClear() })

it('does not build a dictionary for a display that needs no conversion', async () => {
  const { createDisplayScriptConverter } = await import('../pages/canvas/canvas-display-script')
  const convert = createDisplayScriptConverter('s2t')
  expect(convert('Hello')).toBe('Hello')
  expect(convert('台北')).toBe('台北')
  expect(convert('小栗帽')).toBe('小栗帽')
  expect(factory).not.toHaveBeenCalled()
})

it('shares one dictionary per direction across card fields and display instances', async () => {
  const { default: fui } = await import('./fui-app')
  const { createDisplayScriptConverter } = await import('../pages/canvas/canvas-display-script')
  fui.tify('这是测试')
  fui.tify('欢迎来到这里')
  createDisplayScriptConverter('s2t')('这是测试')
  createDisplayScriptConverter('s2t')('欢迎来到这里')
  expect(factory).toHaveBeenCalledTimes(1)
  expect(factory).toHaveBeenLastCalledWith({ from: 'cn', to: 'tw' })
  fui.sify('這是測試')
  createDisplayScriptConverter('t2s')('這是測試')
  expect(factory).toHaveBeenCalledTimes(2)
  expect(factory).toHaveBeenLastCalledWith({ from: 'tw', to: 'cn' })
})
