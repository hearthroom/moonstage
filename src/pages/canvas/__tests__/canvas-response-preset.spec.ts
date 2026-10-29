import { expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Panel from '../components/canvas-response-settings.vue'

const settings = (over: Record<string, unknown> = {}) => ({ conversationId: 'c1', scope: 'conversation', schemaVersion: 1, revision: 0, overrides: {}, effective: { agency: 'coauthor', style: 'card', perspective: 'card', length: 'auto', pace: 'natural' }, styleSource: 'card_default', styleLocked: false, ...over })
const cardDefault = { mode: 'card_default', presetId: null, revisionId: null, bindingVersion: 0, state: 'ready' }
const bound = (over: Record<string, unknown> = {}) => ({ mode: 'revision', presetId: 'p1', revisionId: 'r1', bindingVersion: 2, presetTitle: '細膩', version: 1, state: 'ready', ...over })
const list = { items: [{ id: 'p1', title: '細膩', headRevisionId: 'r2', version: 2, archived: false, recommendedModels: ['m-1'] }, { id: 'p2', title: '封存的', headRevisionId: 'r9', version: 1, archived: true, recommendedModels: [] }] }
const t = (k: string, v?: Record<string, unknown>) => (v ? `${k}${JSON.stringify(v)}` : k)

function api(over: Record<string, unknown> = {}) {
 return { conversation: vi.fn(async () => cardDefault), card: vi.fn(async () => cardDefault), list: vi.fn(async () => list), apply: vi.fn(async () => bound({ revisionId: 'r2', version: 2 })), modelName: (v: string) => (v === 'm-1' ? 'Model One' : v), ...over }
}

it('changes nothing when the page does not offer presets', async () => {
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => settings(), save: vi.fn(), t } })
 await flushPromises()
 expect(wrapper.find('[data-lt="response-preset"]').exists()).toBe(false)
 wrapper.unmount()
})

it('picks one of my presets for this conversation and reloads what the server now says', async () => {
 const load = vi.fn().mockResolvedValueOnce(settings()).mockResolvedValue(settings({ styleSource: 'preset', styleLocked: true }))
 const presets = api({ conversation: vi.fn().mockResolvedValueOnce(cardDefault).mockResolvedValue(bound({ revisionId: 'r2', version: 2 })) })
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load, save: vi.fn(), t, presets } })
 await flushPromises()
 await wrapper.get('[data-action="preset-pick"]').trigger('click'); await flushPromises()
 const picker = wrapper.get('[data-lt="preset-picker"]')
 // 封存的不列；不用預設是預選的那一個，按鈕要等選了別的才能按
 expect(picker.findAll('.preset-option').map((o) => o.attributes('data-value'))).toEqual(['', 'p1'])
 expect(picker.text()).toContain('Model One')
 expect(wrapper.get('[data-action="preset-apply"]').attributes('disabled')).toBeDefined()
 await picker.get('.preset-option[data-value="p1"]').trigger('click')
 await wrapper.get('[data-action="preset-apply"]').trigger('click'); await flushPromises()
 expect(presets.apply).toHaveBeenCalledWith('conversation', 'c1', 'r2', 0, expect.any(String))
 expect(wrapper.find('[data-lt="preset-picker"]').exists()).toBe(false)
 expect(wrapper.get('[data-lt="preset-notice"]').text()).toBe(t('responseSettings.preset.applied.conversation', { name: '細膩', n: 2 }))
 expect(load).toHaveBeenCalledTimes(2)
 expect(wrapper.get('[data-lt="preset-current"]').text()).toBe(t('responseSettings.preset.current', { name: '細膩', n: 2 }))
 wrapper.unmount()
})

it('while a preset owns the style, style choices are disabled and saving other axes leaves the style keys out', async () => {
 const save = vi.fn(async (_id: string, rev: number) => settings({ revision: rev + 1, styleLocked: true, overrides: { agency: 'protect' } }))
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => settings({ styleSource: 'preset', styleLocked: true }), save, t, presets: api({ conversation: vi.fn(async () => bound()) }) } })
 await flushPromises()
 expect(wrapper.findAll('.mode-item[data-axis="style"]').every((b) => b.attributes('disabled') !== undefined)).toBe(true)
 expect(wrapper.get('[data-hint="style"]').text()).toBe(t('responseSettings.preset.styleLocked', { name: '細膩' }))
 expect(wrapper.find('[data-hint="length-preset"]').exists()).toBe(true)
 await wrapper.get('.mode-item[data-axis="agency"][data-value="protect"]').trigger('click')
 await wrapper.get('[data-action="save"]').trigger('click'); await flushPromises()
 const patch = save.mock.calls[0]![2] as Record<string, unknown>
 expect(patch.agency).toBe('protect')
 expect(Object.keys(patch)).not.toContain('style')
 expect(Object.keys(patch)).not.toContain('customStyle')
 expect(Object.keys(patch)).not.toContain('styleNote')
 wrapper.unmount()
})

it('says the chosen version cannot be read instead of quietly switching back', async () => {
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => settings({ styleSource: 'preset', styleLocked: true }), save: vi.fn(), t, presets: api({ conversation: vi.fn(async () => bound({ state: 'unavailable' })) }) } })
 await flushPromises()
 expect(wrapper.get('[data-lt="response-preset"]').text()).toContain('responseSettings.preset.loadFailed')
 expect(wrapper.find('[data-action="preset-reload"]').exists()).toBe(true)
 wrapper.unmount()
})

it('offers the newer version and tells the player when a reply is still running', async () => {
 const presets = api({ conversation: vi.fn(async () => bound()), apply: vi.fn(async () => { throw { statusCode: 409, data: { error: 'preset_conflict', reason: 'operation_active' } } }) })
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => settings({ styleSource: 'preset', styleLocked: true }), save: vi.fn(), t, presets } })
 await flushPromises()
 expect(wrapper.get('[data-lt="preset-newer"]').text()).toContain(t('responseSettings.preset.newVersion', { name: '細膩', latest: 2, n: 1 }))
 await wrapper.get('[data-action="preset-upgrade"]').trigger('click'); await flushPromises()
 expect(presets.apply).toHaveBeenCalledWith('conversation', 'c1', 'r2', 2, expect.any(String))
 expect(wrapper.text()).toContain('responseSettings.preset.busy')
 wrapper.unmount()
})

it('stopping the preset applies the card default to this conversation', async () => {
 const presets = api({ conversation: vi.fn(async () => bound({ revisionId: 'r2', version: 2 })), apply: vi.fn(async () => cardDefault) })
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => settings({ styleSource: 'preset', styleLocked: true }), save: vi.fn(), t, presets } })
 await flushPromises()
 await wrapper.get('[data-action="preset-stop"]').trigger('click'); await flushPromises()
 expect(presets.apply).toHaveBeenCalledWith('conversation', 'c1', null, 2, expect.any(String))
 expect(wrapper.text()).toContain('responseSettings.preset.reverted.conversation')
 wrapper.unmount()
})

it('choosing for this card loads the card binding first and saves only that scope', async () => {
 const presets = api({ card: vi.fn(async () => ({ ...cardDefault, bindingVersion: 5 })), apply: vi.fn(async () => bound()) })
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => settings(), save: vi.fn(), t, presets } })
 await flushPromises()
 await wrapper.get('[data-action="preset-pick"]').trigger('click'); await flushPromises()
 await wrapper.get('.mode-item[data-axis="preset-scope"][data-value="card"]').trigger('click'); await flushPromises()
 expect(presets.card).toHaveBeenCalled()
 await wrapper.get('.preset-option[data-value="p1"]').trigger('click')
 await wrapper.get('[data-action="preset-apply"]').trigger('click'); await flushPromises()
 expect(presets.apply).toHaveBeenCalledWith('card', 'c1', 'r2', 5, expect.any(String))
 expect(wrapper.get('[data-lt="preset-notice"]').text()).toBe(t('responseSettings.preset.applied.card', { name: '細膩', n: 2 }))
 wrapper.unmount()
})

it('a conflict re-reads the binding so the next try uses the new version', async () => {
 const conversation = vi.fn().mockResolvedValueOnce(bound()).mockResolvedValue(bound({ bindingVersion: 7 }))
 const apply = vi.fn().mockRejectedValueOnce({ statusCode: 409, data: { error: 'preset_conflict', reason: 'preset_revision_conflict' } }).mockResolvedValue(cardDefault)
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => settings({ styleSource: 'preset', styleLocked: true }), save: vi.fn(), t, presets: api({ conversation, apply }) } })
 await flushPromises()
 await wrapper.get('[data-action="preset-stop"]').trigger('click'); await flushPromises()
 expect(wrapper.text()).toContain('responseSettings.preset.conflict')
 await wrapper.get('[data-action="preset-stop"]').trigger('click'); await flushPromises()
 expect(apply.mock.calls[1]![3]).toBe(7)
 wrapper.unmount()
})

it('a bound preset that was archived stays shown as current instead of being silently unbound', async () => {
 const presets = api({ conversation: vi.fn(async () => bound({ presetId: 'p2', revisionId: 'r9', presetTitle: '封存的' })) })
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => settings({ styleSource: 'preset', styleLocked: true }), save: vi.fn(), t, presets } })
 await flushPromises()
 await wrapper.get('[data-action="preset-change"]').trigger('click'); await flushPromises()
 expect(wrapper.get('.preset-option[data-value="current"]').attributes('aria-checked')).toBe('true')
 expect(wrapper.get('[data-action="preset-apply"]').attributes('disabled')).toBeDefined()
 wrapper.unmount()
})

it('when the result never comes back, re-reads the binding and reports what actually happened', async () => {
 vi.useFakeTimers()
 const conversation = vi.fn().mockResolvedValueOnce(bound({ revisionId: 'r2', version: 2 })).mockResolvedValue(cardDefault)
 const apply = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => settings({ styleSource: 'preset', styleLocked: true }), save: vi.fn(), t, presets: api({ conversation, apply }) } })
 await vi.runAllTimersAsync()
 await wrapper.get('[data-action="preset-stop"]').trigger('click')
 await vi.runAllTimersAsync(); await flushPromises()
 expect(apply).toHaveBeenCalledTimes(4)
 expect(new Set(apply.mock.calls.map((c) => c[4])).size).toBe(1)
 expect(wrapper.text()).toContain('responseSettings.preset.reverted.conversation')
 vi.useRealTimers()
 wrapper.unmount()
})
