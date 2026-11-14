/**
 * 按次計費線路在模型選單裡：選到就關 Agent、檔位回到最低一檔，同一次儲存送出。
 *
 * 伺服器拒絕對這條線開 Agent（存檔就回 400），所以前端要在送出前就把它關掉，
 * 而不是送出去再吃一個「儲存失敗」。其他線路的 Agent 行為不受影響。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import ModelSelectPanel from './ModelSelectPanel.vue'
import { updateStorageScope } from '@/common/author-rules/storage-scope'
import { setStageHost } from '@/host/stage-host'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string, vars?: any) => vars ? `${key} ${Object.values(vars).join(' ')}` : key, locale: { value: 'en' } }) }))

const FLAT = 'gemini-4-argon-dawn-turn'
const flatLane = {
  value: FLAT, name: 'Gemini 4 Argon', channel: 'lane:dawn-turn', channelLabel: 'Dawn · Per turn',
  billingType: 'fixed', flatPerTurn: true, supportsMultiPass: false, costScore: 400, maxScore: 400, isCacheStable: true,
  contextBudgetOptions: [
    { value: 1, tokens: 192000, text: '192K', fixedCredits: 400 },
    { value: 2, tokens: 256000, text: '256K', fixedCredits: 500 },
    { value: 3, tokens: 512000, text: '512K', fixedCredits: 750 },
    { value: 4, tokens: 768000, text: '768K', fixedCredits: 1000 },
  ],
}
const quote = () => ({ status: 'estimated', typicalCredits: 700, highCredits: 900, normalTypicalCredits: 200, reason: 'bootstrap', presentation: 'inline', selectionKey: 'k', ruleVersion: 'v1', generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), sampleCount: 0 })

const mounted: any[] = []
beforeEach(() => { vi.stubGlobal('uni', { showToast: vi.fn(), $emit: vi.fn() }) })
afterEach(() => { mounted.splice(0).forEach(w => w.unmount()); updateStorageScope(null); setStageHost(null); vi.unstubAllGlobals() })

async function setup(options: { startOnFlat?: boolean; agentOn?: boolean; context?: number } = {}) {
  const catalog = JSON.parse(JSON.stringify((await import('../../pages/canvas/__tests__/fixtures/model-catalog-live.json')).default))
  const family = catalog[0].families[0]
  family.variants.push(JSON.parse(JSON.stringify(flatLane)))
  const ordinary = family.variants[0].value
  const stored = { multiPassEnabled: options.agentOn === true }
  const get = vi.fn(async (url: string) => url === '/models'
    ? { statusCode: 200, data: catalog }
    : { statusCode: 200, data: { multiPassEnabled: stored.multiPassEnabled, runtimeEnabled: true, modelSupported: true, costWarning: false, costEstimate: quote() } })
  const post = vi.fn(async (url: string, request: any) => {
    if (url !== '/settings') return { statusCode: 200, data: {} }
    if (request.data?.multiPassEnabled === true && request.data?.selectModel === FLAT) return { statusCode: 400, data: { error: 'invalid_request' } }
    return { statusCode: 200, data: {} }
  })
  const w = shallowMount(ModelSelectPanel, {
    props: { open: true, roleId: 'fixture-role', selectModel: options.startOnFlat ? FLAT : ordinary, context: options.context ?? 3 },
    global: { stubs: { Teleport: false }, config: { globalProperties: { http: { get, post }, requestUrl: { playerAgentMode: '/agent', playerRoleSettingsSave: '/settings', playerAgentCostAction: '/action', getModelListV2: '/models' } } } },
  })
  mounted.push(w)
  await flushPromises()
  const vm = w.vm as any
  const familyView = { ...family, variants: family.variants }
  const variantOf = (value: string) => family.variants.find((v: any) => v.value === value)
  return { w, vm, post, familyView, variantOf, ordinary }
}

const savedBody = (post: any) => post.mock.calls.filter(([url]: any[]) => url === '/settings').map(([, r]: any[]) => r.data)

describe('按次線：Agent 與檔位', () => {
  it('開著 Agent 換到按次線：當場關掉、攤開 Agent 面板說明、檔位回第 1 檔，一次存好', async () => {
    const { w, vm, post, familyView, variantOf } = await setup({ agentOn: true, context: 3 })
    expect(vm.deepPrepEnabled).toBe(true)
    vm.selectVariant(familyView, variantOf(FLAT))
    await flushPromises()
    expect(vm.deepPrepEnabled).toBe(false)
    expect(vm.deepPrepOn).toBe(false)
    expect(vm.agentClosedByLane).toBe(true)
    expect(vm.dockOpen).toBe('agent')
    expect(vm.formData.context).toBe(1)
    await vm.sure()
    await flushPromises()
    expect(vm.costModalVisible).toBe(false)
    expect(savedBody(post)).toEqual([expect.objectContaining({ selectModel: FLAT, context: 1, multiPassEnabled: false })])
    expect(w.emitted('select')?.[0]?.[0]).toMatchObject({ selectModel: FLAT, context: 1, multiPassEnabled: false })
  })

  it('按次線上 Agent 開不了', async () => {
    const { vm, familyView, variantOf } = await setup()
    vm.selectVariant(familyView, variantOf(FLAT))
    await vm.onDeepPrepChange(true)
    expect(vm.deepPrepEnabled).toBe(false)
    expect(vm.laneBlocksAgent).toBe(true)
  })

  it('舊殘留的 Agent 開啟，在按次線上讀成關，存檔送關', async () => {
    const { vm, post } = await setup({ startOnFlat: true, agentOn: true, context: 2 })
    expect(vm.deepPrepEnabled).toBe(false)
    expect(vm.agentClosedByLane).toBe(false)
    // 已經在按次線上：玩家原本選的 256K 不動。
    expect(vm.formData.context).toBe(2)
    await vm.sure()
    await flushPromises()
    expect(savedBody(post)).toEqual([expect.objectContaining({ context: 2, multiPassEnabled: false })])
  })

  it('換回其他線路：說明收起，Agent 不自動恢復但可以自己打開', async () => {
    const { vm, familyView, variantOf, ordinary } = await setup({ agentOn: true })
    vm.selectVariant(familyView, variantOf(FLAT))
    vm.selectVariant(familyView, variantOf(ordinary))
    await flushPromises()
    expect(vm.agentClosedByLane).toBe(false)
    expect(vm.deepPrepEnabled).toBe(false)
    expect(vm.laneBlocksAgent).toBe(false)
    await vm.onDeepPrepChange(true)
    expect(vm.deepPrepEnabled).toBe(true)
  })

  it('其他線路照舊：開著 Agent 換到另一條一般線路，不被關掉', async () => {
    const { vm, familyView } = await setup({ agentOn: true })
    const other = familyView.variants.find((v: any) => v.value !== FLAT && v.value !== vm.formData.selectModel)
    expect(other).toBeTruthy()
    vm.selectVariant(familyView, other)
    await flushPromises()
    expect(vm.deepPrepEnabled).toBe(true)
    expect(vm.agentClosedByLane).toBe(false)
  })
})
