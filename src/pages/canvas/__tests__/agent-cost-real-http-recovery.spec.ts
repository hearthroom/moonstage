import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { ref, unref } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ModelSelectPanel from '@/components/model-select/ModelSelectPanel.vue'
import { updateStorageScope } from '@/common/author-rules/storage-scope'
import * as settings from '../canvas-role-settings'
import { applyCapacityChoice } from '../canvas-capacity-choice'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: { value: 'en' } }) }))
const mounted: any[] = []
afterEach(() => { mounted.splice(0).forEach(w => w.unmount()); updateStorageScope(null); vi.unstubAllGlobals() })

// Real request client and real response interceptor; only uni.request's network
// transport is replaced. A resolved mock POST cannot reproduce an HTTP409 reject.
async function client() {
  vi.resetModules()
  const calls: any[] = []
  const catalog = (await import('./fixtures/model-catalog-live.json')).default
  const control = { status: 409, reason: 'quote_changed', key: 'before-price', high: 999 }
  vi.stubGlobal('uni', {
    request: (o: any) => {
      calls.push(o)
      queueMicrotask(() => {
        const path = new URL(o.url).pathname
        let statusCode = 200, data: any = {}
        if (path.endsWith('/models')) data = catalog
        if (path.endsWith('/agent')) data = {
          runtimeEnabled: true, modelSupported: true, multiPassEnabled: true,
          costWarning: control.high >= 1000,
          costEstimate: { status: 'estimated', source: 'bootstrap', typicalCredits: 500, highCredits: control.high, normalTypicalCredits: 100,
            presentation: control.high >= 1000 ? 'confirm' : 'inline', selectionKey: control.key, ruleVersion: 'v1', expiresAt: new Date(Date.now() + 60000).toISOString() },
        }
        if (path.endsWith('/save')) {
          statusCode = control.status
          data = statusCode === 200 ? {} : { error: control.reason }
          if (control.reason === 'quote_changed') { control.key = 'after-price'; control.high = 1500 }
        }
        const response = { statusCode, data, header: {} }
        o.success(response); o.complete(response)
      })
      return { abort: () => {} }
    },
    getStorageSync: () => 'en', getLocale: () => 'en', showLoading: vi.fn(), hideLoading: vi.fn(), showToast: vi.fn(), $emit: vi.fn(),
  })
  const http = (await import('@/components/firstui/fui-request/index.js')).default as any
  const { setupHttp } = await import('@/api/http-setup.js')
  const toast = { error: vi.fn(), timeout: vi.fn(), networkError: vi.fn(), serverError: vi.fn(), unauthorized: vi.fn() }
  setupHttp(http, { host: 'https://api.example', loading: { show: vi.fn(), hide: vi.fn() }, toast,
    getLocale: () => 'en', getFreshAccessToken: async () => null, refreshAccessToken: async () => null, clearTokens: vi.fn(), redirectToLogin: vi.fn() })
  return { http, calls, control, toast, catalog }
}

const source = readFileSync('src/pages/canvas/canvas.vue', 'utf8')
const script = source.slice(source.indexOf('<script setup lang="ts">') + 24, source.indexOf('</script>'))
const tree = ts.createSourceFile('canvas.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const names = ['currentRoleSettings', 'persistRoleSettings', 'onApplyModelSettings', 'saveCapacityPatch', 'onCapacityPick']
const handlers = names.map(name => {
  const n = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  if (!n) throw Error(`Missing actual handler ${name}`)
  return n.getText(tree)
}).join('\n')

function canvas(http: any) {
  const original = { ...settings.ROLE_SETTINGS_DEFAULTS, selectModel: 'saved-lane', context: 1, thinkingDepth: 'high', thinkingDepthManual: true }
  const ctx: any = {
    ...settings, unref, applyCapacityChoice,
    formData: { ...original, selectModelName: 'Saved model' }, roleSettingsSnapshot: { ...original },
    settingsRoleId: ref('fixture-role'), conversationId: ref('fixture-conversation'),
    selectedVariantValue: ref('saved-lane'), modelGroups: ref([]),
    findVariant: (_groups: any, value: string) => ({ value, family: 'Fixture', name: value === 'saved-lane' ? 'Saved model' : 'Next model' }),
    composeModelDisplayName: (v: any) => v.name, thinkingDepthForVariant: () => 'off',
    modelCostQuoteChanged: ref(false), multiPassRuntimeEnabled: ref(true), multiPassModelSupported: ref(true), applyMultiPassPreference: vi.fn(),
    panel: ref({ sheet: 'capacity' }), capacitySpec: ref({ advice: { requiredTier: 3, requiredTokens: 128000, trimFits: false }, draft: 'pending', saving: false, error: '' }),
    loadModelCatalog: vi.fn(), loadMultiPassPreference: vi.fn(), resendAfterCapacityChoice: vi.fn(), t: (key: string) => key,
    uni: globalThis.uni, _this: { http, requestUrl: { playerRoleSettingsSave: '/settings/save' } },
  }
  ctx.openModelSelect = vi.fn(() => { ctx.panel.value.sheet = 'model'; ctx.modelCostQuoteChanged.value = false })
  const js = ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(`${js}\n${names.map(n => `this.${n} = ${n}`).join(';')}`, ctx)
  return ctx
}

describe('Agent settings through the real request interceptor', () => {
  it('a real rejected409 on capacity raise opens model recovery and never resends', async () => {
    const { http, calls, toast } = await client()
    const ctx = canvas(http)
    await ctx.onCapacityPick('raise')
    expect(ctx.openModelSelect).toHaveBeenCalledOnce()
    expect(ctx.modelCostQuoteChanged.value).toBe(true)
    expect(ctx.panel.value.sheet).toBe('model')
    expect(ctx.formData.context).toBe(1)
    expect(ctx.capacitySpec.value).toMatchObject({ saving: false, error: '' })
    expect(ctx.resendAfterCapacityChoice).not.toHaveBeenCalled()
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(1)
    expect(toast.error).not.toHaveBeenCalled()
    expect(uni.showToast).not.toHaveBeenCalled()
  })

  it('a real rejected409 rolls back a HUD choice and does not poison the next persona save', async () => {
    const { http, control, calls } = await client()
    const ctx = canvas(http)
    await ctx.onApplyModelSettings({ selectModel: 'next-lane' })
    expect(ctx.openModelSelect).toHaveBeenCalledOnce()
    expect(ctx.formData.selectModel).toBe('saved-lane')
    control.status = 200
    ctx.formData.userName = 'New name'
    expect(await ctx.persistRoleSettings()).toBe(true)
    expect(calls.at(-1).data).toMatchObject({ userName: 'New name' })
    expect(calls.at(-1).data).not.toHaveProperty('selectModel')
  })

  it('the model panel requotes a rejected409 and asks again for its new high price', async () => {
    const { http, calls, catalog, toast, control } = await client()
    const selected = catalog[0].families[0].variants[0].value
    const w = shallowMount(ModelSelectPanel, { props: { open: true, roleId: 'fixture-role', selectModel: selected }, global: {
      stubs: { Teleport: false }, config: { globalProperties: { http, requestUrl: { getModelListV2: '/models', playerAgentMode: '/agent', playerRoleSettingsSave: '/settings/save', playerAgentCostAction: '/action' } } },
    } })
    mounted.push(w)
    await flushPromises()
    const vm = w.vm as any
    const reads = () => calls.filter(c => c.url.endsWith('/agent')).length
    const before = reads()
    await vm.sure(); await flushPromises()
    expect(reads()).toBeGreaterThan(before + 1)
    expect(vm.deepPrepQuoteChanged).toBe(true)
    expect(vm.deepPrepCostEstimate.selectionKey).toBe('after-price')
    expect(w.emitted('select')).toBeUndefined()
    expect(w.emitted('close')).toBeUndefined()
    expect(toast.error).not.toHaveBeenCalled()
    expect(uni.showToast).not.toHaveBeenCalled()
    control.status = 200
    const again = vm.sure(); await flushPromises()
    expect(vm.costModalVisible).toBe(true)
    vm.settleCostModal(false); await again
    expect(calls.filter(c => c.method === 'POST' && c.url.endsWith('/save'))).toHaveLength(1)
  })

  it.each([409, 503])('unrelated HTTP%s stays a failed save, with one caller-owned notice', async (status) => {
    const { http, control, toast } = await client()
    control.status = status; control.reason = 'unrelated_failure'
    const ctx = canvas(http)
    ctx.formData.context = 3
    expect(await ctx.persistRoleSettings()).toBe(false)
    expect(ctx.openModelSelect).not.toHaveBeenCalled()
    expect(uni.showToast).toHaveBeenCalledOnce()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.serverError).not.toHaveBeenCalled()
  })

  it('an unrelated rejected409 in the model panel does not pretend the price changed', async () => {
    const { http, calls, catalog, control } = await client()
    control.reason = 'unrelated_failure'
    const w = shallowMount(ModelSelectPanel, { props: { open: true, roleId: 'fixture-role', selectModel: catalog[0].families[0].variants[0].value }, global: {
      stubs: { Teleport: false }, config: { globalProperties: { http, requestUrl: { getModelListV2: '/models', playerAgentMode: '/agent', playerRoleSettingsSave: '/settings/save', playerAgentCostAction: '/action' } } },
    } })
    mounted.push(w); await flushPromises()
    const vm = w.vm as any
    const before = calls.filter(c => c.url.endsWith('/agent')).length
    await vm.sure(); await flushPromises()
    expect(vm.deepPrepQuoteChanged).toBe(false)
    expect(calls.filter(c => c.url.endsWith('/agent'))).toHaveLength(before + 1)
    expect(w.emitted('select')).toBeUndefined()
    expect(uni.showToast).toHaveBeenCalledOnce()
  })
})
