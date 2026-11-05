import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CanvasModelPanel from '../components/canvas-model-panel.vue'
import ModelSelectPanel from '@/components/model-select/ModelSelectPanel.vue'
import catalog from './fixtures/model-catalog.json'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

async function panel(depth: string, manual: boolean) {
  const live = structuredClone(catalog)
  const source = live.flatMap(group => group.families).flatMap(family => family.variants)
    .find(variant => variant.value === 'deepseek-v4-flash-mist')!
  for (const [family, value] of [
    ['DeepSeek V4 Flash', 'deepseek-v4-flash-mist'],
    ['DeepSeek V4.1 Flash', 'deepseek-v4.1-flash-ripple'],
  ]) {
    live[0].families.unshift({ family, description: '', variants: [{
      ...source, name: family, value, thinkingControl: 'toggleable',
      thinkingDepthOptions: [{ value: 'off' }, { value: 'high' }, { value: 'max' }],
      defaultThinkingDepth: 'high',
    }] } as any)
  }
  const get = vi.fn(async (url: string) => ({ statusCode: 200, data: url === '/models' ? live : {
    runtimeEnabled: true, modelSupported: true, multiPassEnabled: false, costWarning: false,
  } }))
  const wrapper = mount(CanvasModelPanel, {
    attachTo: document.body,
    props: { open: true, roleId: 'fixture-role', selectedValue: 'deepseek-v4-flash-mist',
      thinkingDepth: depth, thinkingDepthManual: manual },
    global: { config: { globalProperties: {
      http: { get }, requestUrl: { playerAgentMode: '/agent-mode', getModelListV2: '/models' },
    } } },
  })
  await flushPromises()
  return wrapper
}

describe('畫布模型殼保留已存的手選來源', () => {
  it.each([['off', true, 'off'], ['max', true, 'max'], ['off', false, 'high']])(
    '已存 %s/manual=%s 經殼切 V4.1 後為 %s', async (depth, manual, expected) => {
      const wrapper = await panel(depth as string, manual as boolean)
      try {
        const picker = wrapper.findComponent(ModelSelectPanel)
        const vm = picker.vm as any
        const family = vm.displayFamilies.find((item: any) => item.family === 'DeepSeek V4.1 Flash')
        vm.selectVariant(family, family.variants[0])
        await flushPromises()
        expect(vm.formData.thinkingDepth).toBe(expected)
        await wrapper.get('.bottom .btn').trigger('click')
        await flushPromises()
        expect(wrapper.emitted('apply')?.at(-1)?.[0]).toMatchObject({
          selectModel: 'deepseek-v4.1-flash-ripple', thinkingDepth: expected, thinkingDepthManual: manual,
        })
      } finally { wrapper.unmount() }
    },
  )
})
