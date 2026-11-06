import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import ModelSelectPanel from './ModelSelectPanel.vue'
import { normalizeMultiPassPreference } from '@/utils/multi-pass'
import { updateStorageScope } from '@/common/author-rules/storage-scope'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string, vars?: any) => vars ? `${key} ${Object.values(vars).join(' ')}` : key, locale: { value: 'en' } }) }))
const quote = (key = 'selection-a', high = 1500) => ({ status: 'estimated', typicalCredits: 700, highCredits: high, normalTypicalCredits: 200, reason: 'bootstrap', presentation: high >= 1000 ? 'confirm' : 'inline', selectionKey: key, ruleVersion: 'v1', generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), sampleCount: 0 })
const pref = (estimate = quote()) => ({ multiPassEnabled: false, runtimeEnabled: true, modelSupported: true, costWarning: estimate.presentation === 'confirm', costEstimate: estimate })
const mounted: any[] = []
beforeEach(() => { vi.stubGlobal('uni', { showToast: vi.fn(), $emit: vi.fn() }) })
afterEach(() => { mounted.splice(0).forEach(w => w.unmount()); updateStorageScope(null); vi.unstubAllGlobals() })
async function setup(options: { enabled?: boolean; estimate?: any; save?: any } = {}) {
  const catalog = JSON.parse(JSON.stringify((await import('../../pages/canvas/__tests__/fixtures/model-catalog-live.json')).default))
  const selected = catalog[0].families[0].variants[0].value
  const get = vi.fn(async (url: string) => url === '/models' ? { statusCode: 200, data: catalog } : { statusCode: 200, data: { ...pref(options.estimate || quote()), multiPassEnabled: options.enabled === true } })
  const post = vi.fn(async (url: string) => url === '/settings' ? options.save || { statusCode: 200, data: { multiPassEnabled: true } } : { statusCode: 200, data: {} })
  const w = shallowMount(ModelSelectPanel, { props: { open: true, roleId: 'fixture-role', selectModel: selected }, global: { config: { globalProperties: { http: { get, post }, requestUrl: { playerAgentMode: '/agent', playerRoleSettingsSave: '/settings', playerAgentCostAction: '/action', getModelListV2: '/models' } } } } })
  mounted.push(w)
  await flushPromises()
  return { w, vm: w.vm as any, get, post }
}

describe('Agent cost estimate contract', () => {
  it('keeps nullable numbers and the server decision', () => {
    expect(normalizeMultiPassPreference(pref()).costEstimate).toMatchObject({ status: 'estimated', typicalCredits: 700, highCredits: 1500, presentation: 'confirm', selectionKey: 'selection-a' })
    expect(normalizeMultiPassPreference(pref({ ...quote(), status: 'unknown', typicalCredits: null, highCredits: null, presentation: 'inline' })).costEstimate?.highCredits).toBeNull()
  })
})
describe('pending Agent settings and confirmation', () => {
  it('toggle is read-only until apply; cancel saves neither model nor mode', async () => {
    const { w, vm, post } = await setup()
    await vm.onDeepPrepChange(true)
    expect(post).not.toHaveBeenCalled()
    const applying = vm.sure()
    await flushPromises()
    expect(vm.costModalVisible).toBe(true)
    vm.settleCostModal(false)
    await applying
    expect(post.mock.calls.filter(([url]) => url === '/settings')).toHaveLength(0)
    expect(w.emitted('select')).toBeUndefined()
    expect(w.emitted('close')).toBeUndefined()
  })
  it('confirmed selection saves model and Agent mode in one request before closing', async () => {
    const { w, vm, post } = await setup()
    await vm.onDeepPrepChange(true)
    vm.formData.selectModel = 'fixture-next-lane'
    await flushPromises()
    const applying = vm.sure()
    await flushPromises()
    vm.settleCostModal(true)
    await applying
    expect(post.mock.calls.filter(([url]) => url === '/settings')).toEqual([['/settings', expect.objectContaining({ data: expect.objectContaining({ roleId: 'fixture-role', selectModel: vm.formData.selectModel, multiPassEnabled: true, agentCostSelectionKey: 'selection-a' }) })]])
    expect(w.emitted('select')?.[0]?.[0]).toMatchObject({ multiPassEnabled: true, persisted: true })
    expect(w.emitted('close')).toHaveLength(1)
  })
  it('low estimate applies without interruption and disabling never asks', async () => {
    const { w, vm } = await setup({ enabled: true, estimate: quote('low', 999) })
    await vm.sure()
    expect(vm.costModalVisible).toBe(false)
    expect(w.emitted('select')).toHaveLength(1)
    const other = await setup({ enabled: true })
    await other.vm.onDeepPrepChange(false)
    await other.vm.sure()
    expect(other.vm.costModalVisible).toBe(false)
    expect(other.w.emitted('select')?.[0]?.[0]).toMatchObject({ multiPassEnabled: false })
  })
  it('never applies a selection changed while the dialog was open', async () => {
    const { w, vm, post } = await setup({ enabled: true })
    const applying = vm.sure()
    await flushPromises()
    vm.formData.context = 3
    await flushPromises()
    vm.settleCostModal(true)
    await applying
    expect(post.mock.calls.filter(([url]) => url === '/settings')).toHaveLength(0)
    expect(w.emitted('select')).toBeUndefined()
  })
  it('does not close or update local preferences when atomic save fails', async () => {
    const { w, vm } = await setup({ estimate: quote('low', 999), save: { statusCode: 500, data: {} } })
    await vm.onDeepPrepChange(true)
    await vm.sure()
    expect(w.emitted('select')).toBeUndefined()
    expect(w.emitted('close')).toBeUndefined()
    expect(vm.isSure).toBe(false)
  })
  it('discards late responses and clears cheap numbers after a network failure', async () => {
    const { vm, get } = await setup()
    let oldResolve: any
    get.mockImplementationOnce(() => new Promise(resolve => { oldResolve = resolve }))
    const old = vm.loadDeepPrepPreference()
    vm.formData.selectModel = 'a-different-lane'
    await flushPromises()
    oldResolve({ statusCode: 200, data: pref(quote('old-cheap', 100)) })
    await old
    expect(vm.deepPrepCostEstimate?.selectionKey).not.toBe('old-cheap')
    get.mockRejectedValueOnce(new Error('network'))
    await vm.loadDeepPrepPreference()
    expect(vm.deepPrepCostEstimate).toBeNull()
  })
  it('rechecks current cost on apply so an expired cheap quote cannot bypass a new warning', async () => {
    const { vm, get, w } = await setup({ enabled: true, estimate: quote('old', 999) })
    get.mockImplementationOnce(async () => ({ statusCode: 200, data: pref(quote('new-price', 2000)) }))
    const applying = vm.sure()
    await flushPromises()
    expect(vm.costModalVisible).toBe(true)
    vm.settleCostModal(false)
    await applying
    expect(w.emitted('select')).toBeUndefined()
  })
  it('an unknown estimate does not invent a high-cost warning', async () => {
    const unknown = { ...quote('unknown'), status: 'unknown', typicalCredits: null, highCredits: null, normalTypicalCredits: null, presentation: 'inline' }
    const { w, vm } = await setup({ enabled: true, estimate: unknown })
    await vm.sure()
    expect(vm.costModalVisible).toBe(false)
    expect(w.emitted('select')).toHaveLength(1)
  })
  it('turning to an unsupported model preserves the preference without a stale quote key', async () => {
    const { vm, get, post } = await setup({ enabled: true })
    get.mockImplementationOnce(async () => ({ statusCode: 200, data: { ...pref(), modelSupported: false } }))
    await vm.sure()
    expect(vm.costModalVisible).toBe(false)
    expect(post).toHaveBeenCalledWith('/settings', expect.objectContaining({ data: expect.objectContaining({ multiPassEnabled: true, agentCostSelectionKey: '' }) }))
  })
  it('an expired dialog quote returns to the updated estimate without saving', async () => {
    const { w, vm, post } = await setup({ enabled: true })
    const applying = vm.sure()
    await flushPromises()
    vm.deepPrepCostEstimate.expiresAt = new Date(Date.now() - 1).toISOString()
    vm.settleCostModal(true)
    await applying
    expect(vm.deepPrepQuoteChanged).toBe(true)
    expect(vm.dockOpen).toBe('agent')
    expect(post.mock.calls.filter(([url]) => url === '/settings')).toHaveLength(0)
    expect(w.emitted('select')).toBeUndefined()
  })
  it('a server quote conflict keeps the pending selection and shows updated guidance', async () => {
    const { w, vm } = await setup({ enabled: true, estimate: quote('low', 999), save: { statusCode: 409, data: { errorCode: 'quote_changed' } } })
    await vm.sure()
    expect(vm.deepPrepQuoteChanged).toBe(true)
    expect(vm.dockOpen).toBe('agent')
    expect(w.emitted('select')).toBeUndefined()
    expect(w.emitted('close')).toBeUndefined()
  })

  it('does not rewrite an unchanged resolved model preference to its displayed lane', async () => {
    const { vm, post } = await setup({ estimate: quote('low', 999) })
    await vm.sure()
    const saved = post.mock.calls.find(([url]) => url === '/settings')?.[1]?.data
    expect(saved).not.toHaveProperty('selectModel')
    expect(saved).toHaveProperty('multiPassEnabled', false)
  })

  it('a late ordinary catalog cannot overwrite pending Agent pricing or pass coverage', async () => {
    const { vm, get } = await setup()
    const ordinary = JSON.parse(JSON.stringify(vm.modelTabs))
    const agent = JSON.parse(JSON.stringify(ordinary))
    for (const tab of agent) for (const family of tab.families) for (const variant of family.variants) {
      variant.billingType = 'dynamic'; variant.noLimitCovered = false; variant.noLimitEligible = true
      variant.estMinScore = 700; variant.estMaxScore = 1500
      variant.contextBudgetOptions = [{ value: vm.formData.context, quoteMin: 700, quoteMax: 1500 }]
    }
    for (const tab of ordinary) for (const family of tab.families) for (const variant of family.variants) { variant.noLimitCovered = true; variant.billingType = 'fixed' }
    let release: any
    get.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const old = vm.refreshDynamicPrices()
    get.mockImplementationOnce(async () => ({ statusCode: 200, data: agent }))
    await vm.onDeepPrepChange(true)
    await flushPromises()
    release({ statusCode: 200, data: ordinary })
    await old
    const selected = vm.modelTabs.flatMap((t: any) => t.families).flatMap((f: any) => f.variants).find((v: any) => v.value === vm.formData.selectModel)
    expect(selected.noLimitCovered).toBe(false)
    expect(selected.billingType).toBe('dynamic')
    expect(vm.selectItem.noLimitCovered).toBe(false)
  })

  it('remembers confirmation inside the panel after a failed save, without persisting acceptance', async () => {
    const { vm, post } = await setup({ enabled: true, save: { statusCode: 500, data: {} } })
    const first = vm.sure()
    await flushPromises()
    expect(vm.costModalVisible).toBe(true)
    vm.settleCostModal(true)
    await first
    const retry = vm.sure()
    await flushPromises()
    const repeated = vm.costModalVisible
    if (repeated) vm.settleCostModal(false)
    await retry
    expect(repeated).toBe(false)
    expect(post.mock.calls.filter(([url]) => url === '/settings')).toHaveLength(2)
  })
  it('a25% rise still re-confirms an accepted panel choice after a failed save', async () => {
    const { vm, get } = await setup({ enabled: true, save: { statusCode: 500, data: {} } })
    const first = vm.sure()
    await flushPromises()
    vm.settleCostModal(true)
    await first
    get.mockImplementationOnce(async () => ({ statusCode: 200, data: pref(quote('selection-a', 1875)) }))
    const retry = vm.sure()
    await flushPromises()
    const repeated = vm.costModalVisible
    vm.settleCostModal(false)
    await retry
    expect(repeated).toBe(true)
  })

  it.each(['close', 'account'])('clears ephemeral confirmation on %s', async (boundary) => {
    const { w, vm } = await setup({ enabled: true, save: { statusCode: 500, data: {} } })
    const first = vm.sure()
    await flushPromises()
    vm.settleCostModal(true)
    await first
    if (boundary === 'close') {
      await w.setProps({ open: false })
      await w.setProps({ open: true })
      await flushPromises()
    } else updateStorageScope('another_opaque_scope_123456')
    const retry = vm.sure()
    await flushPromises()
    const repeated = vm.costModalVisible
    vm.settleCostModal(false)
    await retry
    expect(repeated).toBe(true)
  })

})
