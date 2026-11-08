import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { ref, unref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as settings from '../canvas-role-settings'
import { applyCapacityChoice, raisesContext } from '../canvas-capacity-choice'

// Run the actual canvas handlers, with only HTTP and surrounding UI replaced.
const source = readFileSync('src/pages/canvas/canvas.vue', 'utf8')
const script = source.slice(source.indexOf('<script setup lang="ts">') + 24, source.indexOf('</script>'))
const tree = ts.createSourceFile('canvas.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const names = ['currentRoleSettings', 'persistRoleSettings', 'onApplyModelSettings', 'saveCapacityPatch', 'onCapacityPick']
const handlers = names.map(name => {
  const node = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  if (!node) throw Error(`Missing actual canvas handler: ${name}`)
  return node.getText(tree)
}).join('\n')

function harness() {
  const original = { ...settings.ROLE_SETTINGS_DEFAULTS, selectModel: 'saved-lane', context: 1, thinkingDepth: 'high', thinkingDepthManual: true }
  const ctx: any = {
    ...settings, unref, applyCapacityChoice, raisesContext,
    formData: { ...original, selectModelName: 'Saved model' }, roleSettingsSnapshot: { ...original },
    settingsRoleId: ref('fixture-role'), conversationId: ref('fixture-conversation'),
    selectedVariantValue: ref('saved-lane'), modelGroups: ref([]),
    findVariant: (_groups: any, value: string) => ({ value, family: 'Fixture', name: value === 'saved-lane' ? 'Saved model' : 'Next model' }),
    composeModelDisplayName: (v: any) => v.name,
    thinkingDepthForVariant: () => 'off',
    modelCostQuoteChanged: ref(false),
    multiPassRuntimeEnabled: ref(true), multiPassModelSupported: ref(true), applyMultiPassPreference: vi.fn(),
    panel: ref({ sheet: 'capacity' }),
    capacitySpec: ref({ advice: { requiredTier: 3, requiredTokens: 128000, trimFits: false }, draft: 'pending draft', bubbleId: 'failure', saving: false, error: '' }),
    loadModelCatalog: vi.fn(), loadMultiPassPreference: vi.fn(), resendAfterCapacityChoice: vi.fn(),
    t: (key: string) => key, uni: { showToast: vi.fn() },
  }
  ctx.openModelSelect = vi.fn(() => { ctx.panel.value = { sheet: 'model' }; ctx.modelCostQuoteChanged.value = false })
  ctx._this = {
    requestUrl: { playerRoleSettingsSave: '/settings/save' },
    http: { post: vi.fn(async (_url: string, options: any) => {
      // Synthetic server has Agent ON with a confirmed key. Selection writes
      // without the new key are rejected; unrelated settings remain writable.
      const data = options.data
      const selection = ['selectModel', 'context', 'thinkingDepth'].some(k => k in data)
      return selection ? { statusCode: 409, data: { error: 'quote_changed' } } : { statusCode: 200 }
    }) },
  }
  const js = ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(`${js}\n${names.map(n => `this.${n} = ${n}`).join(';')}`, ctx)
  return { ctx, original, post: ctx._this.http.post }
}

describe('canvas settings recover from Agent cost confirmation requirements', () => {
  it('capacity raise opens confirmation recovery, rolls back and never resends an unconfirmed turn', async () => {
    const { ctx, original, post } = harness()
    await ctx.onCapacityPick('raise')
    expect(post).toHaveBeenCalledWith('/settings/save', expect.objectContaining({ data: { roleId: 'fixture-role', context: 3 } }))
    expect(ctx.formData.context).toBe(original.context)
    expect(ctx.roleSettingsSnapshot.context).toBe(original.context)
    expect(ctx.openModelSelect).toHaveBeenCalledOnce()
    expect(ctx.modelCostQuoteChanged.value).toBe(true)
    expect(ctx.panel.value.sheet).toBe('model')
    expect(ctx.capacitySpec.value).toMatchObject({ saving: false, error: '' })
    expect(ctx.resendAfterCapacityChoice).not.toHaveBeenCalled()
    expect(ctx.uni.showToast).not.toHaveBeenCalled()
    // Merely opening or cancelling recovery has not submitted another write.
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('HUD rejected model is rolled back, and the next persona save has no rejected selection', async () => {
    const { ctx, original, post } = harness()
    await ctx.onApplyModelSettings({ selectModel: 'next-lane' })
    expect(ctx.formData).toMatchObject({ ...original, selectModelName: 'Saved model' })
    expect(ctx.modelCostQuoteChanged.value).toBe(true)
    expect(ctx.openModelSelect).toHaveBeenCalledOnce()
    ctx.formData.userName = 'New name'
    expect(await ctx.persistRoleSettings()).toBe(true)
    const data = post.mock.calls.at(-1)?.[1].data
    expect(data).toMatchObject({ roleId: 'fixture-role', userName: 'New name' })
    expect(data).not.toHaveProperty('selectModel')
    expect(data).not.toHaveProperty('thinkingDepth')
    expect(ctx.roleSettingsSnapshot.userName).toBe('New name')
  })

  it('HUD ordinary failure also restores its selection, while successful writes update the snapshot', async () => {
    const { ctx, original, post } = harness()
    post.mockResolvedValueOnce({ statusCode: 503 })
    await ctx.onApplyModelSettings({ selectModel: 'next-lane' })
    expect(ctx.formData).toMatchObject({ ...original, selectModelName: 'Saved model' })
    expect(ctx.openModelSelect).not.toHaveBeenCalled()
    expect(ctx.uni.showToast).toHaveBeenCalledOnce()
    post.mockResolvedValueOnce({ statusCode: 200 })
    await ctx.onApplyModelSettings({ selectModel: 'next-lane' })
    expect(ctx.roleSettingsSnapshot).toMatchObject({ selectModel: 'next-lane', thinkingDepth: 'off' })
    expect(ctx.loadModelCatalog).toHaveBeenCalled()
  })

  it('raising the context from the HUD restores full lore, and a failed save puts the choice back', async () => {
    const { ctx, post } = harness()
    ctx.formData.trimConstantLore = true
    ctx.roleSettingsSnapshot.trimConstantLore = true
    post.mockResolvedValueOnce({ statusCode: 503 })
    await ctx.onApplyModelSettings({ context: 3 })
    expect(post).toHaveBeenLastCalledWith('/settings/save', expect.objectContaining({ data: expect.objectContaining({ context: 3, trimConstantLore: false }) }))
    expect(ctx.formData).toMatchObject({ context: 1, trimConstantLore: true })
    post.mockResolvedValueOnce({ statusCode: 200 })
    await ctx.onApplyModelSettings({ context: 3 })
    expect(ctx.roleSettingsSnapshot).toMatchObject({ context: 3, trimConstantLore: false })
  })

  it('a lower or unchanged context leaves the trimmed choice alone', async () => {
    const { ctx, post } = harness()
    ctx.formData.trimConstantLore = true
    ctx.roleSettingsSnapshot.trimConstantLore = true
    ctx.formData.context = 3
    ctx.roleSettingsSnapshot.context = 3
    post.mockResolvedValueOnce({ statusCode: 200 })
    await ctx.onApplyModelSettings({ context: 2 })
    expect(post.mock.calls.at(-1)[1].data).not.toHaveProperty('trimConstantLore')
    expect(ctx.formData.trimConstantLore).toBe(true)
  })

  it('a panel that saved the raise itself also updates the canvas copy', async () => {
    const { ctx, post } = harness()
    ctx.formData.trimConstantLore = true
    ctx.roleSettingsSnapshot.trimConstantLore = true
    await ctx.onApplyModelSettings({ persisted: true, context: 3 })
    expect(post).not.toHaveBeenCalled()
    expect(ctx.roleSettingsSnapshot).toMatchObject({ context: 3, trimConstantLore: false })
  })

  it('an accepted model panel selection updates canvas without a second unquoted save', async () => {
    const { ctx, post } = harness()
    ctx.modelCostQuoteChanged.value = true
    await ctx.onApplyModelSettings({ persisted: true, selectModel: 'next-lane', context: 3, thinkingDepth: 'off', multiPassEnabled: true })
    expect(post).not.toHaveBeenCalled()
    expect(ctx.roleSettingsSnapshot).toMatchObject({ selectModel: 'next-lane', context: 3, thinkingDepth: 'off' })
    expect(ctx.modelCostQuoteChanged.value).toBe(false)
  })

  it('late save replies do not open recovery or roll back another conversation', async () => {
    const { ctx, post } = harness()
    let resolve!: (v: any) => void
    post.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = ctx.onApplyModelSettings({ selectModel: 'next-lane' })
    ctx.conversationId.value = 'another-conversation'
    ctx.formData.selectModel = 'another-lane'
    ctx.formData.selectModelName = 'Another model'
    resolve({ statusCode: 409, data: { error: 'quote_changed' } })
    await pending
    expect(ctx.openModelSelect).not.toHaveBeenCalled()
    expect(ctx.formData.selectModel).toBe('another-lane')
    expect(ctx.formData.selectModelName).toBe('Another model')
  })

  it('a successful save acknowledges only submitted values, leaving newer edits dirty', async () => {
    const { ctx, post } = harness()
    let resolve!: (v: any) => void
    post.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    ctx.formData.userName = 'Submitted name'
    const pending = ctx.persistRoleSettings()
    ctx.formData.userName = 'New draft'
    ctx.formData.context = 3
    resolve({ statusCode: 200 })
    expect(await pending).toBe(true)
    expect(ctx.roleSettingsSnapshot).toMatchObject({ userName: 'Submitted name', context: 1 })
    expect(ctx.formData).toMatchObject({ userName: 'New draft', context: 3 })
  })

  it('a capacity response for an old conversation cannot restore its context onto the new one', async () => {
    const { ctx, post } = harness()
    let resolve!: (v: any) => void
    post.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = ctx.saveCapacityPatch({ context: 3 })
    ctx.conversationId.value = 'another-conversation'
    ctx.formData.context = 5
    resolve({ statusCode: 409, data: { error: 'quote_changed' } })
    expect(await pending).toBe(false)
    expect(ctx.formData.context).toBe(5)
    expect(ctx.openModelSelect).not.toHaveBeenCalled()
  })

  it('a failed HUD request does not roll back parts of a newer selection', async () => {
    const { ctx, post } = harness()
    let resolve!: (v: any) => void
    post.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = ctx.onApplyModelSettings({ selectModel: 'next-lane' })
    Object.assign(ctx.formData, { selectModel: 'newer-lane', selectModelName: 'Newer model', thinkingDepth: 'off', thinkingDepthManual: false })
    resolve({ statusCode: 503 })
    await pending
    expect(ctx.formData).toMatchObject({ selectModel: 'newer-lane', selectModelName: 'Newer model', thinkingDepth: 'off', thinkingDepthManual: false })
  })
})
