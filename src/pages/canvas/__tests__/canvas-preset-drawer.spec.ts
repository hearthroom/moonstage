import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import Drawer from '../components/canvas-preset-drawer.vue'
import Panel from '../components/canvas-response-settings.vue'

// 預設庫抽屜（PM 2026-10-30）：從選擇器「瀏覽預設庫」開，搜尋、模型篩選，每列直接套用到這張卡
const t = (k: string, v?: Record<string, unknown>) => (v ? `${k}${JSON.stringify(v)}` : k)
const row = (n: number, over: Record<string, unknown> = {}) => ({ presetId: `x${n}`, title: `公開${n}`, authorName: `作者${n}`, usesLast7d: n, listed: true, ...over })
const bound = (over: Record<string, unknown> = {}) => ({ scope: 'card', mode: 'revision', presetId: 'x2', revisionId: 'r', bindingVersion: 5, presetTitle: '公開2', state: 'ready', ...over })

function api(over: Record<string, unknown> = {}) {
 return {
  card: vi.fn(async () => bound()), list: vi.fn(async () => ({ items: [] })), apply: vi.fn(async () => bound({ presetId: 'x1' })),
  library: vi.fn(async () => ({ items: [row(1), row(2)] })), context: () => ({ model: 'lane-a', card: '測試卡' }),
  modelName: (v: string) => (v === 'lane-a' ? 'Gemini 4' : v), ...over,
 }
}

let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined })

it('opens on the current model, says which card it applies to, and marks the preset in use instead of offering to apply it', async () => {
 const presets = api()
 wrapper = mount(Drawer, { props: { api: presets, t }, attachTo: document.body })
 await flushPromises()
 expect(presets.library).toHaveBeenCalledWith({ model: 'lane-a', q: '', sort: 'hot', offset: 0, limit: 20 })
 expect(wrapper.text()).toContain(t('responseSettings.preset.pick.drawer.sub', { card: '測試卡' }))
 expect(wrapper.get('[data-filter="model"]').text()).toBe('Gemini 4')
 expect(wrapper.get('[data-filter="model"]').attributes('aria-pressed')).toBe('true')
 expect(wrapper.text()).toContain('responseSettings.preset.pick.sort.model')
 expect(wrapper.get('[data-id="x2"]').text()).toContain('responseSettings.preset.pick.tag.inUse')
 expect(wrapper.get('[data-id="x2"]').find('[data-action="drawer-apply"]').exists()).toBe(false)
 await wrapper.get('[data-filter="all"]').trigger('click'); await flushPromises()
 expect(presets.library).toHaveBeenLastCalledWith({ model: 'all', q: '', sort: 'hot', offset: 0, limit: 20 })
})

it('searches after typing stops, and shows an empty note when nothing matches', async () => {
 vi.useFakeTimers()
 const presets = api({ library: vi.fn().mockResolvedValueOnce({ items: [row(1)] }).mockResolvedValue({ items: [] }) })
 wrapper = mount(Drawer, { props: { api: presets, t }, attachTo: document.body })
 await vi.runAllTimersAsync(); await flushPromises()
 const input = wrapper.get<HTMLInputElement>('[data-lt="drawer-search"]')
 input.element.value = '冒險'; await input.trigger('input')
 expect(presets.library).toHaveBeenCalledTimes(1)
 await vi.advanceTimersByTimeAsync(350); await flushPromises()
 expect(presets.library).toHaveBeenLastCalledWith({ model: 'lane-a', q: '冒險', sort: 'hot', offset: 0, limit: 20 })
 expect(wrapper.get('[data-lt="drawer-empty"]').text()).toBe('responseSettings.preset.pick.empty.public')
 vi.useRealTimers()
})

it('applying a row goes through the same apply path with the current binding version, then reports back', async () => {
 const presets = api()
 wrapper = mount(Drawer, { props: { api: presets, t }, attachTo: document.body })
 await flushPromises()
 await wrapper.get('[data-id="x1"] [data-action="drawer-apply"]').trigger('click'); await flushPromises()
 expect(presets.apply).toHaveBeenCalledWith('x1', 5, expect.any(String))
 expect(wrapper.emitted('applied')?.[0]).toEqual([t('responseSettings.preset.applied', { name: '公開1' })])
})

it('the heart adds or removes a favourite and says which it will do; own presets have no heart', async () => {
 const favorite = vi.fn(async (_id: string, on: boolean) => ({ favorited: on }))
 const presets = api({ favorite, library: vi.fn(async () => ({ items: [row(1), row(3, { favorited: true }), row(4, { mine: true })] })) })
 wrapper = mount(Drawer, { props: { api: presets, t }, attachTo: document.body })
 await flushPromises()
 const heart = () => wrapper!.get('[data-id="x1"] [data-action="drawer-fav"]')
 expect(heart().attributes('aria-label')).toBe('responseSettings.preset.pick.fav.add')
 expect(heart().attributes('aria-pressed')).toBe('false')
 await heart().trigger('click'); await flushPromises()
 expect(favorite).toHaveBeenCalledWith('x1', true)
 expect(heart().attributes('aria-pressed')).toBe('true')
 expect(heart().attributes('aria-label')).toBe('responseSettings.preset.pick.fav.remove')
 await wrapper.get('[data-id="x3"] [data-action="drawer-fav"]').trigger('click'); await flushPromises()
 expect(favorite).toHaveBeenLastCalledWith('x3', false)
 expect(wrapper.find('[data-id="x4"] [data-action="drawer-fav"]').exists()).toBe(false)
})

it('Esc closes only the drawer, not the preferences underneath', async () => {
 wrapper = mount(Drawer, { props: { api: api(), t }, attachTo: document.body })
 await flushPromises()
 const below = vi.fn()
 document.addEventListener('keydown', below)
 document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
 document.removeEventListener('keydown', below)
 expect(wrapper.emitted('close')).toHaveLength(1)
 expect(below).not.toHaveBeenCalled()
})

it('the picker offers "browse the library" only when the page can list it, and the panel passes it up', async () => {
 const presets = api({ card: vi.fn(async () => ({ mode: 'card_default', presetId: null, bindingVersion: 0, state: 'ready' })), hot: vi.fn(async () => ({ items: [row(1)] })) })
 wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => ({ conversationId: 'c1', scope: 'conversation', schemaVersion: 1, revision: 0, overrides: {}, effective: { agency: 'coauthor', style: 'card', perspective: 'card', length: 'auto', pace: 'natural' }, presetLocked: [] }), save: vi.fn(), t, presets } })
 await flushPromises()
 await wrapper.get('[data-action="preset-pick"]').trigger('click'); await flushPromises()
 await wrapper.get('[role="tab"][data-tab="public"]').trigger('click'); await flushPromises()
 await wrapper.get('[data-action="preset-browse"]').trigger('click')
 expect(wrapper.emitted('browse')).toHaveLength(1)
})

it('the picker sets the readable text tone on its apply button, like the panel does for its own buttons when it opens', async () => {
 const presets = api({ card: vi.fn(async () => ({ mode: 'card_default', presetId: null, bindingVersion: 0, state: 'ready' })) })
 // 跟畫布一樣放在彈層殼裡（主鈕的字色規則只對彈層內的面板）
 const shell = document.createElement('div'); shell.className = 'u-popup'
 const content = document.createElement('div'); content.className = 'u-popup__content'
 shell.append(content); document.body.append(shell)
 wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => ({ conversationId: 'c1', scope: 'conversation', schemaVersion: 1, revision: 0, overrides: {}, effective: { agency: 'coauthor', style: 'card', perspective: 'card', length: 'auto', pace: 'natural' }, presetLocked: [] }), save: vi.fn(), t, presets }, attachTo: content })
 await flushPromises()
 await wrapper.get('[data-action="preset-pick"]').trigger('click'); await flushPromises()
 expect(wrapper.get('[data-lt="preset-picker"] [data-action="preset-apply"]').attributes('data-lt-tone')).toMatch(/^(light|dark)$/)
 shell.remove()
})
