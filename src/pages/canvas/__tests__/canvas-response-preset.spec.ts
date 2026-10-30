import { expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Panel from '../components/canvas-response-settings.vue'

// 自訂預設只套用到整張卡（owner 2026-10-30）：讀與寫都是卡層綁定；套用後伺服器用 presetLocked 說哪幾項由預設決定。
const LOCKED = ['agency', 'style', 'perspective', 'pace', 'sandboxLevel', 'jailbreak']
const settings = (over: Record<string, unknown> = {}) => ({ conversationId: 'c1', scope: 'conversation', schemaVersion: 1, revision: 0, overrides: {}, effective: { agency: 'coauthor', style: 'card', perspective: 'card', length: 'auto', pace: 'natural' }, styleSource: 'card_default', styleLocked: false, presetLocked: [], ...over })
const lockedSettings = (over: Record<string, unknown> = {}) => settings({ styleSource: 'preset', styleLocked: true, presetLocked: LOCKED, ...over })
const cardDefault = { mode: 'card_default', presetId: null, revisionId: null, bindingVersion: 0, state: 'ready' }
const bound = (over: Record<string, unknown> = {}) => ({ mode: 'revision', presetId: 'p1', revisionId: 'r1', bindingVersion: 2, presetTitle: '細膩', version: 1, state: 'ready', ...over })
const list = { items: [{ id: 'p1', title: '細膩', headRevisionId: 'r2', version: 2, archived: false, recommendedModels: ['m-1'] }, { id: 'p2', title: '封存的', headRevisionId: 'r9', version: 1, archived: true, recommendedModels: [] }] }
const t = (k: string, v?: Record<string, unknown>) => (v ? `${k}${JSON.stringify(v)}` : k)
const frame = { sandboxLevel: 'standard', jailbreak: '', defaultJailbreak: '', options: [{ value: 'light', label: '輕量' }, { value: 'standard', label: '標準' }], maxLength: 2000 }

function api(over: Record<string, unknown> = {}) {
 return { card: vi.fn(async () => cardDefault), list: vi.fn(async () => list), apply: vi.fn(async () => bound({ revisionId: 'r2', version: 2 })), modelName: (v: string) => (v === 'm-1' ? 'Model One' : v), ...over }
}

it('changes nothing when the page does not offer presets', async () => {
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => settings(), save: vi.fn(), t } })
 await flushPromises()
 expect(wrapper.find('[data-lt="response-preset"]').exists()).toBe(false)
 expect(wrapper.find('[data-lt="preset-takeover"]').exists()).toBe(false)
 wrapper.unmount()
})

it('lists my presets at the bottom and applies the picked one to the whole card', async () => {
 const load = vi.fn().mockResolvedValueOnce(settings()).mockResolvedValue(lockedSettings())
 const presets = api({ card: vi.fn().mockResolvedValueOnce(cardDefault).mockResolvedValue(bound({ revisionId: 'r2', version: 2 })) })
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load, save: vi.fn(), t, presets, frame, saveFrame: vi.fn() } })
 await flushPromises()
 const section = wrapper.get('[data-lt="response-preset"]')
 // 放在面板最下面（破甲那段之後），直接列出來，不用另開一層
 expect(section.element.compareDocumentPosition(wrapper.get('[data-lt="response-frame"]').element) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
 expect(section.text()).toContain('responseSettings.preset.source')
 expect(section.text()).toContain('responseSettings.preset.hint.off')
 expect(section.text()).toContain('responseSettings.preset.hint.takeover')
 // 封存的不列；沒有範圍可選，也沒有「不用預設」那個選項
 expect(section.findAll('.preset-option').map((o) => o.attributes('data-value'))).toEqual(['p1'])
 expect(section.find('[data-axis="preset-scope"]').exists()).toBe(false)
 expect(section.text()).toContain('Model One')
 expect(section.get('[data-action="preset-apply"]').attributes('disabled')).toBeDefined()
 expect(section.find('[data-action="preset-stop"]').exists()).toBe(false)
 await section.get('.preset-option[data-value="p1"]').trigger('click')
 await section.get('[data-action="preset-apply"]').trigger('click'); await flushPromises()
 expect(presets.apply).toHaveBeenCalledWith('r2', 0, expect.any(String))
 expect(wrapper.get('[data-lt="preset-message"]').text()).toBe(t('responseSettings.preset.applied', { name: '細膩', n: 2 }))
 expect(load).toHaveBeenCalledTimes(2)
 expect(wrapper.find('[data-lt="preset-takeover"]').exists()).toBe(true)
 wrapper.unmount()
})

it('while a preset is applied, the settings it decides fold into one line and are left out of saves', async () => {
 const save = vi.fn(async (_id: string, rev: number) => lockedSettings({ revision: rev + 1, overrides: { length: 'recommended' } }))
 const saveFrame = vi.fn(async () => true)
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => lockedSettings({ overrides: { agency: 'protect', styleNote: '多寫環境', lengthNote: '短一點' } }), save, t, presets: api({ card: vi.fn(async () => bound()) }), frame, saveFrame } })
 await flushPromises()
 const takeover = wrapper.get('[data-lt="preset-takeover"]')
 expect(takeover.text()).toContain(t('responseSettings.preset.takeover.title', { name: '細膩' }))
 expect(takeover.text()).toContain('responseSettings.preset.takeover.body')
 // 被預設決定的不是變灰，是收起來；篇幅照常可調，並說明不受預設影響
 for (const axis of ['agency', 'style', 'perspective', 'pace']) expect(wrapper.find(`.response-axis[data-axis="${axis}"]`).exists()).toBe(false)
 expect(wrapper.find('.response-axis[data-axis="length"]').exists()).toBe(true)
 expect(wrapper.find('[data-hint="length-preset"]').exists()).toBe(true)
 // 破甲強度與破限詞也由預設決定：整段收起
 expect(wrapper.find('[data-lt="response-frame"]').exists()).toBe(false)
 expect(wrapper.find('.response-jailbreak').exists()).toBe(false)
 // 補充說明只剩篇幅
 expect(wrapper.findAll('.response-note-input').map((n) => n.attributes('data-axis'))).toEqual(['length'])
 await wrapper.get('.mode-item[data-axis="length"][data-value="recommended"]').trigger('click')
 await wrapper.get('[data-action="save"]').trigger('click'); await flushPromises()
 const patch = save.mock.calls[0]![2] as Record<string, unknown>
 expect(patch.length).toBe('recommended')
 for (const key of ['agency', 'style', 'customStyle', 'styleNote', 'perspective', 'perspectiveNote', 'pace', 'paceNote', 'agencyNote']) expect(Object.keys(patch)).not.toContain(key)
 expect(saveFrame).not.toHaveBeenCalled()
 wrapper.unmount()
})

it('says the applied version cannot be read instead of quietly switching back', async () => {
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => lockedSettings(), save: vi.fn(), t, presets: api({ card: vi.fn(async () => bound({ state: 'unavailable' })) }) } })
 await flushPromises()
 expect(wrapper.get('[data-lt="response-preset"]').text()).toContain('responseSettings.preset.loadFailed')
 expect(wrapper.find('[data-action="preset-reload"]').exists()).toBe(true)
 wrapper.unmount()
})

it('offers the newer version and tells the player when a reply is still running', async () => {
 const presets = api({ card: vi.fn(async () => bound()), apply: vi.fn(async () => { throw { statusCode: 409, data: { error: 'preset_conflict', reason: 'operation_active' } } }) })
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => lockedSettings(), save: vi.fn(), t, presets } })
 await flushPromises()
 expect(wrapper.get('[data-lt="preset-newer"]').text()).toContain(t('responseSettings.preset.newVersion', { name: '細膩', latest: 2, n: 1 }))
 await wrapper.get('[data-action="preset-upgrade"]').trigger('click'); await flushPromises()
 expect(presets.apply).toHaveBeenCalledWith('r2', 2, expect.any(String))
 expect(wrapper.get('[data-lt="preset-message"]').text()).toBe('responseSettings.preset.busy')
 wrapper.unmount()
})

it('removing the preset clears it for the whole card', async () => {
 const presets = api({ card: vi.fn().mockResolvedValueOnce(bound({ revisionId: 'r2', version: 2 })).mockResolvedValue(cardDefault), apply: vi.fn(async () => cardDefault) })
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => lockedSettings(), save: vi.fn(), t, presets } })
 await flushPromises()
 expect(wrapper.get('[data-lt="response-preset"]').text()).toContain('responseSettings.preset.hint.on')
 await wrapper.get('[data-action="preset-stop"]').trigger('click'); await flushPromises()
 expect(presets.apply).toHaveBeenCalledWith(null, 2, expect.any(String))
 expect(wrapper.get('[data-lt="preset-message"]').text()).toBe('responseSettings.preset.reverted')
 wrapper.unmount()
})

it('applying over unsaved edits asks first and does nothing when the player keeps editing', async () => {
 const presets = api({ card: vi.fn(async () => bound()) })
 const wrapper = mount(Panel, { attachTo: document.body, props: { conversationId: 'c1', load: async () => settings(), save: vi.fn(), t, presets } })
 await flushPromises()
 await wrapper.get('.mode-item[data-axis="agency"][data-value="protect"]').trigger('click')
 await wrapper.get('[data-action="preset-stop"]').trigger('click'); await flushPromises()
 expect(document.body.querySelector('[data-action="keep-editing"]')).not.toBeNull()
 ;(document.body.querySelector('[data-action="keep-editing"]') as HTMLButtonElement).click(); await flushPromises()
 expect(presets.apply).not.toHaveBeenCalled()
 wrapper.unmount()
})

it('a conflict (including the old per-conversation scope being retired) re-reads the card binding so the next try uses the new version', async () => {
 for (const reason of ['preset_revision_conflict', 'preset_scope_changed']) {
  const card = vi.fn().mockResolvedValueOnce(bound()).mockResolvedValue(bound({ bindingVersion: 7 }))
  const apply = vi.fn().mockRejectedValueOnce({ statusCode: 409, data: { error: 'preset_conflict', reason } }).mockResolvedValue(cardDefault)
  const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => lockedSettings(), save: vi.fn(), t, presets: api({ card, apply }) } })
  await flushPromises()
  await wrapper.get('[data-action="preset-stop"]').trigger('click'); await flushPromises()
  expect(wrapper.get('[data-lt="preset-message"]').text()).toBe('responseSettings.preset.conflict')
  await wrapper.get('[data-action="preset-stop"]').trigger('click'); await flushPromises()
  expect(apply.mock.calls[1]![1]).toBe(7)
  wrapper.unmount()
 }
})

it('after a conflict the whole panel follows what the card switched to elsewhere: takeover name, and the settings it locks', async () => {
 // 別處把這張卡換成另一份預設：說明要寫新的名字
 let card = vi.fn().mockResolvedValueOnce(bound()).mockResolvedValue(bound({ presetId: 'p3', revisionId: 'r5', presetTitle: '清爽', bindingVersion: 7 }))
 let apply = vi.fn().mockRejectedValue({ statusCode: 409, data: { error: 'preset_conflict', reason: 'preset_revision_conflict' } })
 let wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => lockedSettings(), save: vi.fn(), t, presets: api({ card, apply }) } })
 await flushPromises()
 expect(wrapper.get('[data-lt="preset-takeover"]').text()).toContain('細膩')
 await wrapper.get('[data-action="preset-stop"]').trigger('click'); await flushPromises()
 expect(wrapper.get('[data-lt="preset-takeover"]').text()).toContain('清爽')
 expect(wrapper.get('[data-lt="preset-message"]').text()).toBe('responseSettings.preset.conflict')
 wrapper.unmount()
 // 別處已經取消：被接管的偏好回來、接管說明消失
 card = vi.fn().mockResolvedValueOnce(bound()).mockResolvedValue({ ...cardDefault, bindingVersion: 7 })
 apply = vi.fn().mockRejectedValue({ statusCode: 409, data: { error: 'preset_conflict', reason: 'preset_revision_conflict' } })
 const load = vi.fn().mockResolvedValueOnce(lockedSettings()).mockResolvedValue(settings())
 wrapper = mount(Panel, { props: { conversationId: 'c1', load, save: vi.fn(), t, presets: api({ card, apply }) } })
 await flushPromises()
 await wrapper.get('[data-action="preset-stop"]').trigger('click'); await flushPromises()
 expect(wrapper.find('[data-lt="preset-takeover"]').exists()).toBe(false)
 expect(wrapper.findAll('.response-axis').map((e) => e.attributes('data-axis'))).toEqual(['agency', 'style', 'perspective', 'length', 'pace'])
 wrapper.unmount()
})

it('an applied preset that was archived stays shown as current instead of being silently removed', async () => {
 const presets = api({ card: vi.fn(async () => bound({ presetId: 'p2', revisionId: 'r9', presetTitle: '封存的' })) })
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => lockedSettings(), save: vi.fn(), t, presets } })
 await flushPromises()
 expect(wrapper.get('.preset-option[data-value="current"]').attributes('aria-checked')).toBe('true')
 expect(wrapper.get('[data-action="preset-apply"]').attributes('disabled')).toBeDefined()
 wrapper.unmount()
})

it('when the result never comes back, re-reads the binding and reports what actually happened', async () => {
 vi.useFakeTimers()
 const card = vi.fn().mockResolvedValueOnce(bound({ revisionId: 'r2', version: 2 })).mockResolvedValue(cardDefault)
 const apply = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => lockedSettings(), save: vi.fn(), t, presets: api({ card, apply }) } })
 await vi.runAllTimersAsync()
 await wrapper.get('[data-action="preset-stop"]').trigger('click')
 await vi.runAllTimersAsync(); await flushPromises()
 expect(apply).toHaveBeenCalledTimes(4)
 expect(new Set(apply.mock.calls.map((c) => c[2])).size).toBe(1)
 expect(wrapper.get('[data-lt="preset-message"]').text()).toBe('responseSettings.preset.reverted')
 vi.useRealTimers()
 wrapper.unmount()
})

it('keeps the preset controls and shows the error when a re-read fails', async () => {
 vi.useFakeTimers()
 const card = vi.fn().mockResolvedValueOnce(bound({ revisionId: 'r2', version: 2 })).mockRejectedValue(new TypeError('offline'))
 const apply = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => lockedSettings(), save: vi.fn(), t, presets: api({ card, apply }) } })
 await vi.runAllTimersAsync()
 await wrapper.get('[data-action="preset-stop"]').trigger('click')
 await vi.runAllTimersAsync(); await flushPromises()
 expect(wrapper.find('[data-lt="preset-current"]').exists()).toBe(true)
 expect(wrapper.get('[data-lt="preset-message"]').text()).toBe('responseSettings.saveFailed')
 vi.useRealTimers()
 wrapper.unmount()
})

// 用工具回覆（PM 2026-10-30）：只有伺服器說 active 時串流顯示關、不能切；玩家自己的串流設定不動
it('while the preset replies through the tool, streaming shows off and locked, and the player setting is kept', async () => {
 const save = vi.fn(async (_id: string, rev: number) => lockedSettings({ revision: rev + 1, overrides: { length: 'recommended', streaming: 'on' }, toolReply: { enabled: true, effective: true, status: 'active' } }))
 const load = async () => lockedSettings({ overrides: { streaming: 'on' }, effective: { agency: 'coauthor', style: 'card', perspective: 'card', length: 'auto', pace: 'natural', streaming: 'off' }, toolReply: { enabled: true, effective: true, status: 'active' } })
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load, save, t, presets: api({ card: vi.fn(async () => bound()) }) } })
 await flushPromises()
 const sw = wrapper.get('[data-lt="streaming-toggle"]')
 expect(sw.attributes('aria-checked')).toBe('false')
 expect(sw.attributes('aria-disabled')).toBe('true')
 expect(wrapper.get('[data-hint="streaming"]').text()).toBe(t('responseSettings.preset.toolReply.active'))
 await wrapper.get('.mode-item[data-axis="length"][data-value="recommended"]').trigger('click')
 await wrapper.get('[data-action="save"]').trigger('click'); await flushPromises()
 // 存的是玩家自己的串流設定，不是這輪生效的「關」
 expect((save.mock.calls[0]![2] as Record<string, unknown>).streaming ?? 'on').toBe('on')
 wrapper.unmount()
})

it('says when the current model or conversation mode does not use the preset tool reply', async () => {
 for (const [status, key] of [['model_unsupported', 'modelUnsupported'], ['mode_unsupported', 'modeUnsupported']] as const) {
  const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => lockedSettings({ toolReply: { enabled: true, effective: false, status } }), save: vi.fn(), t, presets: api({ card: vi.fn(async () => bound()) }) } })
  await flushPromises()
  expect(wrapper.get('[data-lt="preset-tool-reply"]').text()).toBe(t(`responseSettings.preset.toolReply.${key}`))
  expect(wrapper.get('[data-lt="streaming-toggle"]').attributes('aria-disabled')).toBe('false')
  wrapper.unmount()
 }
})

it('shows nothing about tool replies when the server says off, unavailable, or says nothing', async () => {
 for (const toolReply of [undefined, { enabled: false, effective: false, status: 'off' }, { enabled: false, effective: false, status: 'unavailable' }]) {
  const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => lockedSettings({ ...(toolReply ? { toolReply } : {}) }), save: vi.fn(), t, presets: api({ card: vi.fn(async () => bound()) }) } })
  await flushPromises()
  expect(wrapper.find('[data-lt="preset-tool-reply"]').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('responseSettings.preset.toolReply')
  expect(wrapper.get('[data-lt="streaming-toggle"]').attributes('aria-disabled')).toBe('false')
  wrapper.unmount()
 }
})
