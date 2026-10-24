import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CanvasModelPanel from '../components/canvas-model-panel.vue'
import catalog from './fixtures/model-catalog.json'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

async function panel(costWarning = true) {
  const get = vi.fn(async (url: string) => ({ statusCode: 200, data: url === '/models' ? catalog : {
    runtimeEnabled: true, modelSupported: true, multiPassEnabled: true, costWarning,
  } }))
  const wrapper = mount(CanvasModelPanel, {
    attachTo: document.body,
    props: { open: true, roleId: 'fixture-role', selectedValue: 'deepseek-v4-flash-mist', contextValue: 5 },
    global: { config: { globalProperties: {
      http: { get }, requestUrl: { playerAgentMode: '/agent-mode', getModelListV2: '/models' },
    } } },
  })
  await flushPromises()
  return wrapper
}

describe('Agent cost confirmation from the model sheet', () => {
  it('keeps confirmation and its actions outside the masked model scroller', async () => {
    const wrapper = await panel()
    try {
      await wrapper.get('.bottom .btn').trigger('click')
      await flushPromises()
      const confirmation = document.querySelector('.ms-cost.confirm-scope')!
      expect(confirmation).not.toBeNull()
      expect(confirmation.closest('.mp-setting-body')).toBeNull()
      expect(confirmation.closest('.model-setting-scope')).toBe(wrapper.element)
      expect(wrapper.emitted('apply')).toBeUndefined()

      ;(confirmation.querySelector('.cancel-btn') as HTMLElement).click()
      await flushPromises()
      expect(document.querySelector('.ms-cost-mask')).toBeNull()
      expect(wrapper.emitted('apply')).toBeUndefined()

      await wrapper.get('.bottom .btn').trigger('click')
      await flushPromises()
      ;(document.querySelector('.ms-cost .ok-btn') as HTMLElement).click()
      await flushPromises()
      expect(wrapper.emitted('apply')).toHaveLength(1)
      expect(wrapper.emitted('apply')![0][0]).toMatchObject({ context: 5 })
      expect(document.querySelector('.ms-cost-mask')).toBeNull()
    } finally { wrapper.unmount() }
  })

  it('applies directly when the server does not require the warning', async () => {
    const wrapper = await panel(false)
    try {
      await wrapper.get('.bottom .btn').trigger('click')
      await flushPromises()
      expect(document.querySelector('.ms-cost-mask')).toBeNull()
      expect(wrapper.emitted('apply')).toHaveLength(1)
    } finally { wrapper.unmount() }
  })
})
