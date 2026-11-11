import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasComposer from '../components/canvas-composer.vue'

const mounted: ReturnType<typeof mount>[] = []
afterEach(() => { mounted.splice(0).forEach(wrapper => wrapper.unmount()) })

for (const chat of [false, true]) {
  describe(`opening attention (${chat ? 'sandbox' : 'classic'})`, () => {
    function composer(choices: { title: string; items: string[] } | null = { title: 'Choose an opening', items: ['First line'] }) {
      const wrapper = mount(CanvasComposer, {
        props: { chat, value: '', placeholder: '', sendState: 'send', generating: false, choices },
      })
      mounted.push(wrapper)
      return wrapper
    }

    it('draws attention until the player opens the list, including after closing it', async () => {
      const wrapper = composer()
      const toggle = wrapper.get('[data-lt="prologue"]')
      expect(toggle.classes()).toContain('is-attention')
      await toggle.trigger('click')
      expect(toggle.attributes('aria-expanded')).toBe('true')
      expect(toggle.classes()).not.toContain('is-attention')
      await toggle.trigger('keydown', { key: 'Escape' })
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(toggle.classes()).not.toContain('is-attention')
    })

    it('resets for new opening choices after the previous choices disappear', async () => {
      const wrapper = composer()
      await wrapper.get('[data-lt="prologue"]').trigger('keydown', { key: 'Enter' })
      await wrapper.setProps({ choices: null })
      expect(wrapper.find('[data-lt="prologue"]').exists()).toBe(false)
      await wrapper.setProps({ choices: { title: 'Choose an opening', items: ['New opening'] } })
      expect(wrapper.get('[data-lt="prologue"]').classes()).toContain('is-attention')
    })

    it('does not show an opening toggle when no choices are available', () => {
      expect(composer(null).find('[data-lt="prologue"]').exists()).toBe(false)
      expect(composer({ title: 'Choose an opening', items: [] }).find('[data-lt="prologue"]').exists()).toBe(false)
    })
  })
}
