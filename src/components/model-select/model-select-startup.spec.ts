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

it('renders at most four lanes for a crowded model with the server-sent tags', async () => {
  const live = JSON.parse(JSON.stringify((await import('../../pages/canvas/__tests__/fixtures/model-catalog-live.json')).default))
  const deepseek = live[0].families.find((f: any) => f.family === 'DeepSeek V4 Flash')
  deepseek.variants[0].laneTag = 'value'
  deepseek.variants[1].laneTag = 'value'
  deepseek.variants[9].laneTag = 'official'
  const get = vi.fn(async (url: string) => url === '/models'
    ? { statusCode: 200, data: live }
    : { statusCode: 200, data: [] })
  const wrapper = shallowMount(ModelSelectPanel, {
    props: { open: true, roleId: 'fixture-role', selectModel: 'deepseek-v4-flash-ripple' },
    global: { config: { globalProperties: { http: { get }, requestUrl: { playerAgentMode: '/agent-mode', getModelListV2: '/models' } } } },
  })
  try {
    await flushPromises()
    const rows = wrapper.findAll('.ms-opt')
    expect(rows).toHaveLength(4)
    const tags = rows.map(r => r.text().includes('modelSelect.laneValue') ? 'value'
      : r.text().includes('modelSelect.laneOfficial') ? 'official' : '')
    expect(tags).toEqual(['value', 'value', '', 'official'])
    expect(rows[3].find('.ms-badge.is-official').exists()).toBe(true)
    expect(rows[0].find('.ms-badge.is-accent').exists()).toBe(true)
    expect(wrapper.find('.ms-more').text()).toContain('modelSelect.laneShowMore')

    await wrapper.find('.ms-more').trigger('click')
    expect(wrapper.findAll('.ms-opt').length).toBeGreaterThan(4)
  } finally { wrapper.unmount() }
})

it('hides a model whose every lane is dead, unless the player is using it', async () => {
  const live = JSON.parse(JSON.stringify((await import('../../pages/canvas/__tests__/fixtures/model-catalog-live.json')).default))
  const deadStatus = { status: 'red', uptime: { percent24h: 0, samples24h: 90 } }
  const claude = live.flatMap((g: any) => g.families).filter((f: any) => f.family === 'Claude Sonnet 4.5')
  claude.forEach((f: any) => f.variants.forEach((v: any) => { v.status = deadStatus }))
  const get = vi.fn(async (url: string) => url === '/models'
    ? { statusCode: 200, data: live }
    : { statusCode: 200, data: [] })
  const mount = (selectModel: string) => shallowMount(ModelSelectPanel, {
    props: { open: true, roleId: 'fixture-role', selectModel },
    global: { config: { globalProperties: { http: { get }, requestUrl: { playerAgentMode: '/agent-mode', getModelListV2: '/models' } } } },
  })
  const names = (w: any) => (w.vm as any).displayFamilies.map((f: any) => f.family)
  const hidden = mount('deepseek-v4-flash-ripple')
  try {
    await flushPromises()
    expect(names(hidden)).not.toContain('Claude Sonnet 4.5')
    expect(names(hidden)).toContain('DeepSeek V4 Flash')
  } finally { hidden.unmount() }
  const using = mount('relay-claude-sonnet-4-5-ripple')
  try {
    await flushPromises()
    expect(names(using)).toContain('Claude Sonnet 4.5')
  } finally { using.unmount() }
})
