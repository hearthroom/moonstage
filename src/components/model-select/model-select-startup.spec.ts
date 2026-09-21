import { expect, it, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import ModelSelectPanel from './ModelSelectPanel.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

it('does not fetch preferences while closed; opening and changing a model each fetch once', async () => {
  const get = vi.fn(async () => ({ statusCode: 200, data: [] }))
  const wrapper = shallowMount(ModelSelectPanel, {
    props: { open: false, roleId: 'fixture-role', selectModel: '' },
    global: { config: { globalProperties: { http: { get }, requestUrl: { playerAgentMode: '/agent-mode', getModelListV2: '/models' } } } },
  })
  try {
    await wrapper.setProps({ selectModel: 'fixture-model' })
    await flushPromises()
    expect(get).not.toHaveBeenCalled()
    await wrapper.setProps({ open: true })
    await flushPromises()
    expect(get.mock.calls.filter(call => call[0] === '/agent-mode')).toHaveLength(1)
    get.mockClear()
    // Model choices are local form state until the player confirms the panel.
    ;(wrapper.vm as any).formData.selectModel = 'another-model'
    await flushPromises()
    expect(get.mock.calls.filter(call => call[0] === '/agent-mode')).toHaveLength(1)
  } finally { wrapper.unmount() }
})
