import { describe, expect, it, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import ModelSelectPanel from './ModelSelectPanel.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

// Gemini 的思考深度是「自動」（空字串，不送參數）＋「高」，目錄預設是自動。
// 空字串是玩家選的值，不是「沒選」：換線路時不能被當成空位補上「高」。
const depthOptions = [
  { value: '', labelKey: 'modelSelect.thinkingAuto', descriptionKey: 'modelSelect.thinkingAutoTips' },
  { value: 'high', labelKey: 'modelSelect.thinkingHigh', descriptionKey: 'modelSelect.thinkingHighTips' },
]
const lane = (value: string, channel: string) => ({
  name: 'Gemini 3.8 Flash', value, channel, channelLabel: channel, description: '',
  thinkingControl: 'adaptive', thinkingDepthOptions: depthOptions, defaultThinkingDepth: '',
  billingType: 'dynamic', estMinScore: 1, estMaxScore: 10, contextBudgetOptions: [],
})

async function mountOnGemini(thinkingDepth: string) {
  const live = JSON.parse(JSON.stringify((await import('../../pages/canvas/__tests__/fixtures/model-catalog-live.json')).default))
  live[0].families.unshift({
    family: 'Gemini 3.8 Flash', description: '',
    variants: [lane('fixture-gemini-dew', 'lane:dew'), lane('fixture-gemini-dawn', 'lane:dawn')],
  })
  const get = vi.fn(async (url: string) => url === '/models'
    ? { statusCode: 200, data: live }
    : { statusCode: 200, data: [] })
  const wrapper = shallowMount(ModelSelectPanel, {
    props: { open: true, roleId: 'fixture-role', selectModel: 'fixture-gemini-dew', thinkingDepth },
    global: { config: { globalProperties: { http: { get }, requestUrl: { playerAgentMode: '/agent-mode', getModelListV2: '/models' } } } },
  })
  await flushPromises()
  const vm = wrapper.vm as any
  const family = vm.displayFamilies.find((f: any) => f.family === 'Gemini 3.8 Flash')
  return { wrapper, vm, family }
}

describe('換線路時的思考深度', () => {
  it('選了自動，換到另一條線路仍是自動', async () => {
    const { wrapper, vm, family } = await mountOnGemini('')
    try {
      expect(vm.formData.thinkingDepth).toBe('')
      vm.selectVariant(family, family.variants.find((v: any) => v.value === 'fixture-gemini-dawn'))
      await flushPromises()
      expect(vm.formData.selectModel).toBe('fixture-gemini-dawn')
      expect(vm.formData.thinkingDepth).toBe('')
    } finally { wrapper.unmount() }
  })

  it('選了高，換到另一條線路仍是高', async () => {
    const { wrapper, vm, family } = await mountOnGemini('high')
    try {
      vm.selectVariant(family, family.variants.find((v: any) => v.value === 'fixture-gemini-dawn'))
      await flushPromises()
      expect(vm.formData.thinkingDepth).toBe('high')
    } finally { wrapper.unmount() }
  })

  it('原選擇在新線路沒有時退回目錄預設的自動，不是第一個非空項', async () => {
    const { wrapper, vm, family } = await mountOnGemini('max')
    try {
      vm.selectVariant(family, family.variants.find((v: any) => v.value === 'fixture-gemini-dawn'))
      await flushPromises()
      expect(vm.formData.thinkingDepth).toBe('')
    } finally { wrapper.unmount() }
  })
})
