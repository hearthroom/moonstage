// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasDirectiveSets from '../components/canvas-directive-sets.vue'
import { buildDirectiveSetsView, createDirectiveSetsState } from '../canvas-directives'

const t = (key: string) => key
const vm = (picked = 'p1') => buildDirectiveSetsView({ list: [] }, {
  ...createDirectiveSetsState(), loaded: true, view: 'sets', scope: 'card', picked,
  list: [{ presetId: 'p1', title: 'A', items: ['x'], cardCount: 0 }, { presetId: 'p2', title: 'B', items: ['y'], cardCount: 0 }],
}, { t, hasConversation: true, streaming: false, canManage: true })
const labels = { back: '', title: '', scopeSave: '', scopeCard: '', manage: '', saveAs: '', nameLabel: '', namePlaceholder: '', bindCard: '' }

describe('指令組子視圖的鍵盤', () => {
  it('Esc 回到清單，而且不讓畫布或彈層收到（不然整個面板會關掉）', () => {
    let backs = 0
    const w = mount(CanvasDirectiveSets, { props: { vm: vm(), labels, name: '', onSetsBack: () => { backs++ } } as any, attachTo: document.body })
    let reachedDocument = false
    const outer = () => { reachedDocument = true }
    document.addEventListener('keydown', outer)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    document.removeEventListener('keydown', outer)
    expect(backs).toBe(1)
    expect(reachedDocument).toBe(false)
    w.unmount()
    // 卸載之後 Esc 不再被攔
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(backs).toBe(1)
  })
  it('方向鍵在組之間移動並選取（含「不自動帶上」那一列，循環）', async () => {
    const w = mount(CanvasDirectiveSets, { props: { vm: vm('p2'), labels, name: '' }, attachTo: document.body })
    const rows = w.findAll('.ci-set')
    await rows[2].trigger('keydown', { key: 'ArrowDown' })
    await rows[2].trigger('keydown', { key: 'ArrowUp' })
    expect(w.emitted('sets-pick')).toEqual([[''], ['p1']])
    w.unmount()
  })
})
