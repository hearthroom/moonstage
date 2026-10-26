import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CanvasTextarea from '../components/canvas-textarea'
import { CanvasTextField } from '../components/canvas-field'
import CanvasComposer from '../components/canvas-composer.vue'
import ResponseSettings from '../components/canvas-response-settings.vue'

describe('free text does not request contact autofill', () => {
  it.each([CanvasTextarea, CanvasTextField])('opts the native textarea out of form completion', (component) => {
    const wrapper = mount(component, { props: { value: 'Synthetic draft' } })
    const field = wrapper.get('textarea')
    expect(field.attributes('autocomplete')).toBe('off')
    expect((field.element as HTMLTextAreaElement).readOnly).toBe(false)
    wrapper.unmount()
  })

  it('keeps the composer opt-out and author selector through focus and composition', async () => {
    const wrapper = mount(CanvasComposer, { props: { value: 'Synthetic draft', placeholder: 'Message', sendState: 'send', generating: false } })
    const field = wrapper.get('textarea#send_textarea.uni-textarea-textarea')
    expect(field.attributes('autocomplete')).toBe('off')
    await field.trigger('focus')
    await field.trigger('compositionstart')
    await field.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('send')).toBeUndefined()
    await field.trigger('compositionend')
    await field.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('send')).toHaveLength(1)
    expect(field.attributes('autocomplete')).toBe('off')
    wrapper.unmount()
  })

  it('opts custom style and per-axis response notes out on their native controls', async () => {
    const wrapper = mount(ResponseSettings, { props: {
      conversationId: 'fixture', t: (key: string) => key,
      load: async () => ({ conversationId: 'fixture', scope: 'conversation', schemaVersion: 1, revision: 0, overrides: {}, effective: { agency: 'coauthor', style: 'card', perspective: 'card', length: 'auto', pace: 'natural' } }),
      save: async () => ({}),
    } })
    await flushPromises()
    await wrapper.get('[data-axis="style"][data-value="custom"]').trigger('click')
    const fields = wrapper.findAll('textarea')
    expect(fields.length).toBeGreaterThan(1)
    for (const field of fields) expect(field.attributes('autocomplete')).toBe('off')
    wrapper.unmount()
  })
})
