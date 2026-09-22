import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasHeader from '../components/canvas-header.vue'
import { createFullscreenController } from '../canvas-fullscreen'

afterEach(() => vi.restoreAllMocks())

describe('player fullscreen', () => {
  it('uses the top document, updates from browser events, and handles rejection', async () => {
    const doc = new EventTarget() as Document
    Object.defineProperties(doc, {
      fullscreenEnabled: { value: true },
      fullscreenElement: { value: null, configurable: true },
      documentElement: { value: { requestFullscreen: vi.fn().mockResolvedValue(undefined) } },
      exitFullscreen: { value: vi.fn().mockResolvedValue(undefined) },
    })
    const changed = vi.fn(), failed = vi.fn()
    const control = createFullscreenController(doc, changed, failed)
    expect(control.supported).toBe(true)
    await control.toggle()
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' })
    Object.defineProperty(doc, 'fullscreenElement', { value: doc.documentElement })
    doc.dispatchEvent(new Event('fullscreenchange'))
    expect(changed).toHaveBeenLastCalledWith(true)
    await control.toggle()
    expect(doc.exitFullscreen).toHaveBeenCalledOnce()
    Object.defineProperty(doc, 'fullscreenElement', { value: null })
    vi.mocked(doc.documentElement.requestFullscreen).mockRejectedValueOnce(new Error('denied'))
    await control.toggle()
    expect(failed).toHaveBeenCalledOnce()
    control.dispose()
    changed.mockClear()
    doc.dispatchEvent(new Event('fullscreenchange'))
    expect(changed).not.toHaveBeenCalled()
  })
  it('does not offer an unsupported browser action', async () => {
    const control = createFullscreenController(new EventTarget() as Document, vi.fn(), vi.fn())
    expect(control.supported).toBe(false)
    await control.toggle()
    control.dispose()
  })
  it('exposes the action inside the author-styled header, including exit state', async () => {
    const wrapper = mount(CanvasHeader, { props: {
      roleName: 'Example', avatar: '', modelName: 'Provider / A very long model name', fullscreenSupported: true,
      fullscreenActive: false, fullscreenLabel: 'Enter fullscreen',
    } })
    const button = wrapper.get('[data-lt="header-actions"] .header-meun[data-lt="fullscreen"]')
    expect(button.attributes('aria-label')).toBe('Enter fullscreen')
    expect(button.attributes('aria-pressed')).toBe('false')
    // The fullscreen action stays at the trailing edge, regardless of model-name length.
    expect(wrapper.findAll('[data-lt="header-actions"] [role="button"]').at(-1)?.attributes('data-lt')).toBe('fullscreen')
    await button.trigger('click')
    expect(wrapper.emitted('fullscreen')).toHaveLength(1)
    await wrapper.setProps({ fullscreenActive: true, fullscreenLabel: 'Exit fullscreen' })
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.attributes('aria-label')).toBe('Exit fullscreen')
    await wrapper.setProps({ fullscreenSupported: false })
    expect(wrapper.find('[data-lt="fullscreen"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
