import { afterEach, expect, it, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import ModelSelectPanel from './ModelSelectPanel.vue'
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
afterEach(() => vi.unstubAllGlobals())
async function panel(touch = true, empty = false) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: touch && query.includes('coarse'), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const live = JSON.parse(JSON.stringify((await import('../../pages/canvas/__tests__/fixtures/model-catalog-live.json')).default))
  const buckets = Array.from({ length: 72 }, (_, i) => ({ hourStartMs: i * 3600000, total: !empty && i < 70 ? 10 : 0, percent: 100 }))
  const get = vi.fn(async (url: string) => ({ statusCode: 200, data: url === '/models' ? live : url === '/uptime' ? { buckets, totalSamples: empty ? 0 : 700, percent: 100 } : [] }))
  const w = shallowMount(ModelSelectPanel, { props: { open: true, roleId: 'fixture-role', selectModel: 'deepseek-v4-flash-ripple' }, global: { config: { globalProperties: { http: { get }, requestUrl: { getModelListV2: '/models', modelUptimeHistory: '/uptime' } } } } })
  await flushPromises()
  const vm = w.vm as any
  vm.openLaneDetail(vm.detailFamily, vm.detailFamily.variants[0])
  await flushPromises()
  return w
}
it('defaults to the last sampled hour and navigates through no-data hours', async () => {
  const w = await panel()
  try {
    expect((w.vm as any).laneSelectedIndex).toBe(69)
    const next = w.find('.ms-bucket-next')
    await next.trigger('click'); await next.trigger('click')
    expect((w.vm as any).laneSelectedIndex).toBe(71)
    expect(next.attributes('disabled')).toBeDefined()
    expect(w.find('.ms-bucket-readout').text()).toContain('modelSelect.bucketNoData')
    await w.find('.ms-bucket-prev').trigger('click')
    expect((w.vm as any).laneSelectedIndex).toBe(70)
  } finally { w.unmount() }
})
it('selects across the entire bar and retains selection after release', async () => {
  const w = await panel()
  try {
    const bar = w.find('.ms-buckets')
    vi.spyOn(bar.element, 'getBoundingClientRect').mockReturnValue({ left: 10, width: 300 } as DOMRect)
    await bar.trigger('pointerdown', { clientX: 10, pointerId: 1, button: 0 })
    expect((w.vm as any).laneSelectedIndex).toBe(0)
    await bar.trigger('pointermove', { clientX: 310, pointerId: 1 })
    expect((w.vm as any).laneSelectedIndex).toBe(71)
    await bar.trigger('pointerup', { pointerId: 1 })
    await w.findAll('.ms-bucket')[71].trigger('click')
    await w.findAll('.ms-bucket')[71].trigger('mouseleave')
    expect((w.vm as any).laneSelectedIndex).toBe(71)
    await bar.trigger('pointermove', { clientX: 10, pointerId: 1 })
    expect((w.vm as any).laneSelectedIndex).toBe(71)
  } finally { w.unmount() }
})
it('preserves desktop hover and clearing', async () => {
  const w = await panel(false)
  try {
    expect((w.vm as any).laneSelectedIndex).toBe(-1)
    await w.findAll('.ms-bucket')[5].trigger('mouseenter')
    expect((w.vm as any).laneSelectedIndex).toBe(5)
    await w.findAll('.ms-bucket')[5].trigger('mouseleave')
    expect((w.vm as any).laneSelectedIndex).toBe(-1)
  } finally { w.unmount() }
})
it('shows no-data when the entire window is empty', async () => {
  const w = await panel(true, true)
  try {
    expect((w.vm as any).laneSelectedIndex).toBe(71)
    expect(w.find('.ms-bucket-readout').text()).toContain('modelSelect.bucketNoData')
  } finally { w.unmount() }
})

it('prefers the last meaningful bucket over more recent sparse samples and stops on cancel', async () => {
  const w = await panel()
  try {
    const vm = w.vm as any
    vm.laneHistory = { buckets: [{ hourStartMs: 0, total: 10, percent: 100 }, { hourStartMs: 3600000, total: 2, percent: 100 }] }
    await flushPromises()
    expect(vm.laneSelectedIndex).toBe(0)
    const bar = w.find('.ms-buckets')
    vi.spyOn(bar.element, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 300 } as DOMRect)
    await bar.trigger('pointerdown', { clientX: 300, pointerId: 1, button: 0 })
    await bar.trigger('pointercancel', { pointerId: 1 })
    await bar.trigger('pointermove', { clientX: 0, pointerId: 1 })
    expect(vm.laneSelectedIndex).toBe(1)
    await bar.trigger('keydown', { key: 'Home' })
    expect(vm.laneSelectedIndex).toBe(0)
    await bar.trigger('keydown', { key: 'End' })
    expect(vm.laneSelectedIndex).toBe(1)
    vm.laneHistoryLoading = true
    await flushPromises()
    expect(w.find('.ms-lane-touch-loading .ms-bucket-readout').text()).toContain('modelSelect.speedObserving')
    expect(w.find('.ms-lane-touch-loading > .ms-hint').exists()).toBe(false)
  } finally { w.unmount() }
})
it('steps immediately and repeats only while the arrow is held', async () => {
  const w = await panel()
  vi.useFakeTimers()
  try {
    const prev = w.find('.ms-bucket-prev')
    await prev.trigger('pointerdown', { button: 0 })
    expect((w.vm as any).laneSelectedIndex).toBe(68)
    await vi.advanceTimersByTimeAsync(490)
    expect((w.vm as any).laneSelectedIndex).toBe(66)
    await prev.trigger('pointerup')
    await vi.advanceTimersByTimeAsync(1000)
    expect((w.vm as any).laneSelectedIndex).toBe(66)
    prev.element.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }))
    expect((w.vm as any).laneSelectedIndex).toBe(66)
  } finally { w.unmount(); vi.useRealTimers() }
})
