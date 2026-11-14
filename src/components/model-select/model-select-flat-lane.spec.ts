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
import { browserHost, setStageHost } from '@/host/stage-host'

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

async function setup(options: { startOnFlat?: boolean; agentOn?: boolean; context?: number; worldMode?: boolean; saveStatus?: number; saveError?: string } = {}) {
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
    if (options.saveStatus) throw { statusCode: options.saveStatus, data: { error: options.saveError } }
    if (request.data?.multiPassEnabled === true && request.data?.selectModel === FLAT) return { statusCode: 400, data: { error: 'invalid_request' } }
    return { statusCode: 200, data: {} }
  })
  const w = shallowMount(ModelSelectPanel, {
    props: { open: true, roleId: 'fixture-role', selectModel: options.startOnFlat ? FLAT : ordinary, context: options.context ?? 3, worldMode: options.worldMode === true },
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

describe('按次線：畫面', () => {
  it('選中後：晶片強調態與長度條、說明行、檔位鍵寫價格、單格確定值、記憶整理固定最低檔', async () => {
    const { w, vm, familyView, variantOf } = await setup()
    vm.selectVariant(familyView, variantOf(FLAT))
    await flushPromises()
    const chip = w.find('.ms-dchip-context')
    expect(chip.classes()).toContain('is-flat')
    expect(chip.classes()).toContain('is-breathing')
    expect(w.find('.ms-tier-bar').attributes('style')).toContain('width: 7px')
    expect(w.find('.ms-flat-note').text()).toContain('modelSelect.flatLaneNote 768K')
    const pills = w.findAll('.ms-dock-panel.is-flat .ms-pill.token')
    expect(pills.map(p => p.find('.ms-pill-price').text())).toEqual(['400', '500', '750', '1,000'])
    expect(w.find('.ms-dock-panel.is-flat .ms-pill-tag').exists()).toBe(false)
    vm.contextBudgetLevelChange(2)
    await flushPromises()
    expect(w.find('.ms-tier-bar').attributes('style')).toContain('width: 9px')
    const stats = w.findAll('.ms-dock-panel.is-flat .ms-tier-stat')
    expect(stats).toHaveLength(1)
    expect(stats[0].text()).toContain('modelSelect.priceCredits 500')
    expect(w.find('.ms-dock-panel.is-flat').text()).toContain('modelSelect.flatCompactNote 400')
  })

  it('線路列的價：沒選中寫最低檔加「起」，選中寫選中檔位的價', async () => {
    const { vm, familyView, variantOf } = await setup()
    expect(vm.variantPriceText(variantOf(FLAT))).toBe('modelSelect.priceFlatFrom 400')
    vm.selectVariant(familyView, variantOf(FLAT))
    vm.contextBudgetLevelChange(3)
    await flushPromises()
    expect(vm.variantPriceText(variantOf(FLAT))).toBe('modelSelect.priceFlat 750')
  })

  it('攤開檔位就停止呼吸，收起來也不再開始；換回一般線路晶片回到原樣', async () => {
    const { w, vm, familyView, variantOf, ordinary } = await setup()
    vm.selectVariant(familyView, variantOf(FLAT))
    vm.toggleDock('context')
    await flushPromises()
    expect(w.find('.ms-dchip-context').classes()).not.toContain('is-flat')
    vm.toggleDock('context')
    await flushPromises()
    expect(w.find('.ms-dchip-context').classes()).toContain('is-flat')
    expect(w.find('.ms-dchip-context').classes()).not.toContain('is-breathing')
    vm.selectVariant(familyView, variantOf(ordinary))
    await flushPromises()
    expect(w.find('.ms-dchip-context').classes()).not.toContain('is-flat')
    expect(w.find('.ms-tier-bar').exists()).toBe(false)
    expect(w.find('.ms-flat-note').exists()).toBe(false)
  })

  it('Agent 面板在按次線上說明原因；剛被關掉時多一句通知，沒有費用資訊', async () => {
    const { w, vm, familyView, variantOf } = await setup({ agentOn: true })
    vm.selectVariant(familyView, variantOf(FLAT))
    await flushPromises()
    expect(w.find('.ms-dchip-agent').classes()).toContain('is-disabled')
    const panel = w.findAll('.ms-dock-panel').find(p => p.text().includes('modelSelect.agentFlatLaneReason'))!
    expect(panel.exists()).toBe(true)
    expect(panel.find('.ms-flat-notice').text()).toBe('modelSelect.agentClosedByLane')
    expect(panel.text()).not.toContain('modelSelect.agentCostCompactNote')
  })

  it('一般模型：多一顆「?」說明（取代舊 ⓘ），檔位與 Agent 照舊', async () => {
    const { w, vm } = await setup()
    expect(w.find('.ms-info').exists()).toBe(false)
    const help = w.find('button.ms-help-btn')
    expect(help.attributes('aria-label')).toBe('modelSelect.contextHelpLabel')
    expect(help.attributes('aria-expanded')).toBe('false')
    await help.trigger('click')
    expect(vm.dockOpen).toBe('help')
    expect(help.attributes('aria-expanded')).toBe('true')
    expect(w.find('.ms-help-panel').text()).toContain('modelSelect.contextHelpBody')
    expect(w.find('.ms-dchip-context').classes()).not.toContain('is-flat')
    expect(w.find('.ms-pill-price').exists()).toBe(false)
    expect(w.find('.ms-dchip-agent').classes()).not.toContain('is-disabled')
  })
})

describe('按次線：世界模式卡', () => {
  it('世界模式卡上按次線停用、寫出原因，點了也不會選到', async () => {
    const { w, vm, familyView, variantOf, ordinary } = await setup({ worldMode: true })
    vm.toggleAllLanes(familyView)
    await flushPromises()
    vm.selectVariant(familyView, variantOf(FLAT))
    await flushPromises()
    expect(vm.formData.selectModel).toBe(ordinary)
    expect(vm.laneLockedByWorld(variantOf(FLAT))).toBe(true)
    expect(vm.laneLockedByWorld(variantOf(ordinary))).toBe(false)
    const row = w.findAll('.ms-opt').find(r => r.text().includes('Dawn · Per turn'))
    expect(row).toBeTruthy()
    expect(row!.classes()).toContain('is-locked')
    expect(row!.text()).toContain('modelSelect.flatLaneWorldReason')
  })

  it('一般卡不受影響', async () => {
    const { vm, familyView, variantOf } = await setup()
    expect(vm.laneLockedByWorld(variantOf(FLAT))).toBe(false)
    vm.selectVariant(familyView, variantOf(FLAT))
    expect(vm.formData.selectModel).toBe(FLAT)
  })

  it('存檔被伺服器以世界模式拒絕時，講原因而不是「儲存失敗」，選單不關', async () => {
    const { w, vm } = await setup({ startOnFlat: true, saveStatus: 422, saveError: 'per_turn_world_unsupported' })
    await vm.sure()
    await flushPromises()
    expect(uni.showToast).toHaveBeenCalledWith({ title: 'modelSelect.flatLaneWorldReason', icon: 'none' })
    expect(w.emitted('close')).toBeUndefined()
  })
})

describe('按次線：審查補的情境', () => {
  it('選了按次線沒確認就關掉，再打開：一般線路上開著的 Agent 不被悄悄存成關', async () => {
    const { w, vm, familyView, variantOf } = await setup({ agentOn: true })
    vm.selectVariant(familyView, variantOf(FLAT))
    await w.setProps({ open: false })
    await w.setProps({ open: true })
    await flushPromises()
    expect(vm.formData.selectModel).not.toBe(FLAT)
    expect(vm.deepPrepEnabled).toBe(true)
  })

  it('Agent 面板自動攤開時晶片照樣呼吸；只有攤開檔位或看說明才停', async () => {
    const { w, vm, familyView, variantOf } = await setup({ agentOn: true })
    vm.selectVariant(familyView, variantOf(FLAT))
    await flushPromises()
    expect(vm.dockOpen).toBe('agent')
    expect(w.find('.ms-dchip-context').classes()).toContain('is-breathing')
    vm.toggleDock('help')
    await flushPromises()
    expect(w.find('.ms-dchip-context').classes()).not.toContain('is-breathing')
  })

  it('餘額不夠選中那一檔時，交給外殼的草稿帶提醒；一般線路不帶', async () => {
    setStageHost(browserHost({ ui: { ...browserHost().ui, availableCredits: () => 450 } } as any))
    const { w, vm, familyView, variantOf, ordinary } = await setup()
    vm.selectVariant(familyView, variantOf(FLAT))
    vm.contextBudgetLevelChange(2)
    await flushPromises()
    const drafts = w.emitted('draft') as any[][]
    expect(drafts[drafts.length - 1][0].balanceHint).toBe('chat.balanceBelowFlat 450 500')
    vm.selectVariant(familyView, variantOf(ordinary))
    await flushPromises()
    const after = w.emitted('draft') as any[][]
    expect(after[after.length - 1][0].balanceHint).toBe('')
  })

  it('重新打開後目錄還沒到就按確定：一般線路的 Agent 不因上一次看過的按次線被存成關', async () => {
    const { w, vm, post, familyView, variantOf } = await setup({ agentOn: true })
    vm.selectVariant(familyView, variantOf(FLAT))
    await w.setProps({ open: false })
    await w.setProps({ open: true })
    await vm.sure()
    await flushPromises()
    for (const body of savedBody(post)) expect(body.multiPassEnabled).not.toBe(false)
  })
})
