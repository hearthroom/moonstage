import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { fixSolidClippedText } from '../canvas-composer-text-paint'
import CanvasComposer from '../components/canvas-composer.vue'

const gold = 'rgb(232, 168, 80)'
function textarea(overrides: Record<string, string> = {}) {
  const el = document.createElement('textarea')
  const values = { 'background-clip': 'text', '-webkit-background-clip': 'text', 'background-image': 'none', 'background-color': gold, '-webkit-text-fill-color': 'rgba(0, 0, 0, 0)', ...overrides }
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: (key: string) => values[key] || '' } as CSSStyleDeclaration)
  return el
}
afterEach(() => vi.restoreAllMocks())

describe('solid clipped composer text', () => {
  it('keeps the author color as real glyphs so native textarea scrolling paints the new lines', () => {
    const el = textarea()
    fixSolidClippedText(el)
    expect(el.style.getPropertyValue('-webkit-text-fill-color')).toBe(gold)
    expect(el.style.color).toBe(gold)
    expect(el.style.backgroundColor).toBe('transparent')
    expect(el.style.getPropertyPriority('background-color')).toBe('important')
  })
  it.each([
    { 'background-image': 'linear-gradient(red, blue)' },
    { 'background-clip': 'border-box', '-webkit-background-clip': 'border-box' },
    { 'background-color': 'rgba(0, 0, 0, 0)' },
    { '-webkit-text-fill-color': 'rgb(10, 20, 30)' },
    { '-webkit-text-fill-color': 'rgb(255, 0, 0)' },
  ])('preserves non-equivalent decorations: %j', (style) => {
    const el = textarea(style)
    fixSolidClippedText(el)
    expect(el.style.cssText).toBe('')
  })
  it('keeps opaque colors whose final RGB channel is zero', () => {
    const el = textarea({ 'background-color': 'rgb(255, 0, 0)' })
    fixSolidClippedText(el)
    expect(el.style.color).toBe('rgb(255, 0, 0)')
  })
  it('restores existing inline declarations and priorities after editing', () => {
    const el = textarea()
    el.style.setProperty('color', 'red', 'important')
    el.style.setProperty('background-color', 'blue')
    const original = el.style.cssText
    fixSolidClippedText(el)()
    expect(el.style.cssText).toBe(original)
  })
  it('does not overwrite a later author inline change during cleanup', () => {
    const el = textarea()
    const restore = fixSolidClippedText(el)
    el.style.setProperty('color', 'green', 'important')
    restore()
    expect(el.style.color).toBe('green')
  })
  it('applies to the mounted composer on focus and restores on collapse or unmount', async () => {
    vi.useFakeTimers()
    const wrapper = mount(CanvasComposer, {
      attachTo: document.body,
      props: { value: 'Synthetic draft', placeholder: 'Message', sendState: 'send', generating: false },
    })
    const el = wrapper.find('textarea').element as HTMLTextAreaElement
    const original = window.getComputedStyle.bind(window)
    const values: Record<string, string> = {
      'background-clip':'text', 'background-image':'none', 'background-color':gold,
      '-webkit-text-fill-color':'rgba(0, 0, 0, 0)',
    }
    vi.spyOn(window, 'getComputedStyle').mockImplementation((node) => node === el
      ? { getPropertyValue:(key:string) => values[key] || '' } as CSSStyleDeclaration
      : original(node))
    try {
      await wrapper.find('textarea').trigger('focus')
      expect(el.style.color).toBe(gold)
      await wrapper.find('textarea').trigger('blur')
      vi.advanceTimersByTime(150)
      await wrapper.vm.$nextTick()
      expect(el.style.color).toBe('')
      await wrapper.find('textarea').trigger('focus')
      expect(el.style.color).toBe(gold)
      wrapper.unmount()
      expect(el.style.color).toBe('')
    } finally {
      if (wrapper.exists()) wrapper.unmount()
      vi.useRealTimers()
    }
  })
})
