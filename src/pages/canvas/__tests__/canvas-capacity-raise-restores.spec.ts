/**
 * 「維持目前的上下文容量」會留下持續的設定（常駐世界書只帶入一部分）。玩家之後在模型選單
 * 調高上下文容量，就回到完整帶入：跟彈窗裡選「調高」是同一件事，不必等下一次放不下才回得去。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import CanvasModelPanel from '../components/canvas-model-panel.vue'
import ModelSelectPanel from '@/components/model-select/ModelSelectPanel.vue'
import catalog from './fixtures/model-catalog.json'
import { raisesContext } from '../canvas-capacity-choice'

beforeEach(() => { vi.stubGlobal('uni', { showToast: vi.fn(), $emit: vi.fn() }) })
afterEach(() => { vi.unstubAllGlobals() })
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('調高上下文容量的判斷', () => {
  it('只有往上調才算', () => {
    expect(raisesContext(1, 3)).toBe(true)
    expect(raisesContext(2, 100)).toBe(true)
    expect(raisesContext(3, 3)).toBe(false)
    expect(raisesContext(3, 1)).toBe(false)
    expect(raisesContext(undefined, 2)).toBe(false)
    expect(raisesContext(1, undefined)).toBe(false)
  })
})

async function savedFrom(contextValue: number, nextContext: number) {
  const post = vi.fn(async () => ({ statusCode: 200, data: {} }))
  const get = vi.fn(async (url: string) => ({ statusCode: 200, data: url === '/models' ? structuredClone(catalog) : {
    runtimeEnabled: true, modelSupported: true, multiPassEnabled: false, costWarning: false,
  } }))
  const wrapper = mount(CanvasModelPanel, {
    attachTo: document.body,
    props: { open: true, roleId: 'fixture-role', selectedValue: 'deepseek-v4-flash-mist', contextValue },
    global: { config: { globalProperties: {
      http: { get, post }, requestUrl: { playerRoleSettingsSave: '/settings', playerAgentMode: '/agent-mode', getModelListV2: '/models' },
    } } },
  })
  try {
    await flushPromises()
    const vm = wrapper.findComponent(ModelSelectPanel).vm as any
    vm.formData.context = nextContext
    await wrapper.get('.bottom .btn').trigger('click')
    await flushPromises()
    const call = post.mock.calls.find(([url]) => url === '/settings') as any
    return { data: call?.[1]?.data, applied: wrapper.emitted('apply')?.at(-1)?.[0] }
  } finally { wrapper.unmount() }
}

describe('模型選單調高上下文容量', () => {
  it('調高時一起存回完整帶入', async () => {
    const { data } = await savedFrom(1, 3)
    expect(data).toMatchObject({ context: 3, trimConstantLore: false })
  })

  it('沒調高時不碰這個設定', async () => {
    expect((await savedFrom(3, 3)).data).not.toHaveProperty('trimConstantLore')
    expect((await savedFrom(3, 1)).data).not.toHaveProperty('trimConstantLore')
  })

  it('畫布收到調高後，本機的設定也回到完整帶入（兩條存檔路都是）', () => {
    const source = fs.readFileSync('src/pages/canvas/canvas.vue', 'utf8')
    const start = source.indexOf('async function onApplyModelSettings(')
    const body = source.slice(start, source.indexOf('\nasync function ', start + 1))
    expect(body).toMatch(/Number\(next\.context\) > Number\(before\.context\)\) formData\.trimConstantLore = false/)
    // 存失敗時跟著其他選擇一起還原
    expect(body).toMatch(/for \(const key of selectionKeys\) formData\[key\] = before\[key\][\s\S]{0,200}formData\.trimConstantLore = before\.trimConstantLore/)
    const persist = source.slice(source.indexOf('async function persistRoleSettings('), source.indexOf('async function persistRoleSettings(') + 3000)
    expect(persist).toContain("if ('trimConstantLore' in payload && (formData.trimConstantLore === true) === submitted.trimConstantLore) formData.trimConstantLore = before.trimConstantLore")
  })
})
