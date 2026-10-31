import { expect, it, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import ModelSelectPanel from './ModelSelectPanel.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string, p?: { n?: number }) => (p && p.n != null ? `${key}:${p.n}` : key) }) }))

it('counts the lanes on the row the same way the list below draws them', async () => {
  const live = JSON.parse(JSON.stringify((await import('../../pages/canvas/__tests__/fixtures/model-catalog-live.json')).default))
  const deepseek = live[0].families.find((f: any) => f.family === 'DeepSeek V4 Flash')
  deepseek.variants = deepseek.variants.slice(0, 4)
  const deadStatus = { status: 'red', uptime: { percent24h: 0, samples24h: 90 } }
  deepseek.variants[2].status = deadStatus
  deepseek.variants[3].status = deadStatus
  const get = vi.fn(async (url: string) => url === '/models'
    ? { statusCode: 200, data: live }
    : { statusCode: 200, data: [] })
  const mount = (selectModel: string) => shallowMount(ModelSelectPanel, {
    props: { open: true, roleId: 'fixture-role', selectModel },
    global: { config: { globalProperties: { http: { get }, requestUrl: { playerAgentMode: '/agent-mode', getModelListV2: '/models' } } } },
  })
  const hint = (w: any) => w.findAll('.ms-row')
    .find((r: any) => r.find('.ms-name').text() === 'DeepSeek V4 Flash')
    .find('.ms-expand-hint').text()

  const healthy = mount('deepseek-v4-flash-ripple')
  try {
    await flushPromises()
    expect(healthy.findAll('.ms-opt')).toHaveLength(2)
    expect(hint(healthy)).toBe('modelSelect.expandLanes:2')
  } finally { healthy.unmount() }

  // 玩家正在用的那條壞了還是列出來，數字也算它。
  const onDead = mount(deepseek.variants[2].value)
  try {
    await flushPromises()
    expect(onDead.findAll('.ms-opt')).toHaveLength(3)
    expect(hint(onDead)).toBe('modelSelect.expandLanes:3')
  } finally { onDead.unmount() }
})

it('counts every lane the expanded list would show, not just the four drawn collapsed', async () => {
  const live = JSON.parse(JSON.stringify((await import('../../pages/canvas/__tests__/fixtures/model-catalog-live.json')).default))
  const deepseek = live[0].families.find((f: any) => f.family === 'DeepSeek V4 Flash')
  const deadStatus = { status: 'red', uptime: { percent24h: 0, samples24h: 90 } }
  deepseek.variants.slice(-4).forEach((v: any) => { v.status = deadStatus })
  const get = vi.fn(async (url: string) => url === '/models'
    ? { statusCode: 200, data: live }
    : { statusCode: 200, data: [] })
  const wrapper = shallowMount(ModelSelectPanel, {
    props: { open: true, roleId: 'fixture-role', selectModel: 'deepseek-v4-flash-ripple' },
    global: { config: { globalProperties: { http: { get }, requestUrl: { playerAgentMode: '/agent-mode', getModelListV2: '/models' } } } },
  })
  try {
    await flushPromises()
    const row = wrapper.findAll('.ms-row').find((r: any) => r.find('.ms-name').text() === 'DeepSeek V4 Flash')!
    await wrapper.find('.ms-more').trigger('click')
    const shown = wrapper.findAll('.ms-opt').length
    expect(shown).toBe(deepseek.variants.length - 4)
    expect(row.find('.ms-expand-hint').text()).toBe(`modelSelect.expandLanes:${shown}`)
  } finally { wrapper.unmount() }
})
