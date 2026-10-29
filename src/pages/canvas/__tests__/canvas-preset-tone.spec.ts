import { expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const tone = vi.hoisted(() => ({ sync: vi.fn() }))
vi.mock('../canvas-chrome-tone', async (original) => ({ ...(await original<typeof import('../canvas-chrome-tone')>()), syncChromeTone: tone.sync }))
import Panel from '../components/canvas-response-settings.vue'

const settings = { conversationId: 'c1', scope: 'conversation', schemaVersion: 1, revision: 0, overrides: {}, effective: { agency: 'coauthor', style: 'card', perspective: 'card', length: 'auto', pace: 'natural' }, styleSource: 'card_default', styleLocked: false }
const cardDefault = { mode: 'card_default', presetId: null, revisionId: null, bindingVersion: 0, state: 'ready' }

// 彈層打開時量過一次主行動的底色；選預設、回到偏好時換上來的按鈕是新節點，要再量一次，
// 不然作者把主行動漆成亮色時會是白字亮底（QA Q03：1.45:1）。
it('re-measures button tone when switching to the picker and back', async () => {
 const presets = { conversation: vi.fn(async () => cardDefault), card: vi.fn(async () => cardDefault), list: vi.fn(async () => ({ items: [] })), apply: vi.fn() }
 const wrapper = mount(Panel, { props: { conversationId: 'c1', load: async () => settings, save: vi.fn(), t: (k: string) => k, presets } })
 await flushPromises()
 tone.sync.mockClear()
 await wrapper.get('[data-action="preset-pick"]').trigger('click'); await flushPromises()
 expect(tone.sync).toHaveBeenCalled()
 tone.sync.mockClear()
 await wrapper.get('[data-action="preset-back"]').trigger('click'); await flushPromises()
 expect(tone.sync).toHaveBeenCalled()
 wrapper.unmount()
})
