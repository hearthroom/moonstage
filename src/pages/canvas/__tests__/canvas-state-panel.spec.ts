// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import CanvasStatePanel from '../components/canvas-state-panel.vue'
import type { StatePanelLabels } from '@/common/panel/state-panel'

const LABELS: StatePanelLabels = {
  open: '數值面板', title: '數值面板', close: '關閉', updatedLatest: '最新一輪更新', updatedOneAgo: '上一輪更新', updatedAgo: '{n} 輪前更新',
  updatedOpening: '開場時的數值', showRaw: '查看原始數值', showPanel: '返回面板', rejected: '未採用的變更', unavailable: '面板暫時無法顯示',
  unavailableSub: '數值照常記錄，可以先查看原始數值。', errorAt: '面板皮膚第 {line} 行有錯誤：{message}', errorHelper: '面板皮膚第 {line} 行用了不支援的 helper「{helper}」', copied: '已複製',
}

let wrapper: VueWrapper | null = null
afterEach(() => { wrapper?.unmount(); wrapper = null; Reflect.deleteProperty(navigator, 'clipboard'); vi.useRealTimers() })

const panel = (props: Record<string, unknown>) => {
  wrapper = mount(CanvasStatePanel, {
    props: { template: '<b>{{金錢}}</b>', state: { data: { 金錢: 5 }, changes: [] }, update: { kind: 'latest' }, audience: 'player', labels: LABELS, ...props },
    attachTo: document.body,
  })
  return wrapper
}

describe('數值面板（一般頁與殼共用的元件）', () => {
  it('鍵有名字與彈層關聯；按了開面板，標題、更新於、皮膚都在', async () => {
    const w = panel({})
    const btn = w.find('button[data-lt="state-panel-toggle"]')
    expect(btn.attributes('aria-label')).toBe('數值面板')
    expect(btn.attributes('aria-haspopup')).toBe('dialog')
    expect(btn.attributes('aria-expanded')).toBe('false')
    await btn.trigger('click')
    expect(btn.attributes('aria-expanded')).toBe('true')
    expect(w.find('.u-popup').attributes('data-open')).toBe('on')
    expect(w.find('.lt-dialog-title').text()).toBe('數值面板')
    expect(w.find('.lt-state-updated').text()).toBe('最新一輪更新')
    expect(w.find('[data-lt="state-panel-skin"]').html()).toContain('<b>5</b>')
  })

  it.each([
    [{ kind: 'ago', n: 1 }, '上一輪更新'],
    [{ kind: 'ago', n: 3 }, '3 輪前更新'],
    [{ kind: 'opening' }, '開場時的數值'],
  ])('更新於：%o → %s', (update, text) => {
    expect(panel({ update }).find('.lt-state-updated').text()).toBe(text)
  })

  it('原始數值切換：看 JSON、再切回皮膚；沒有數值時皮膚拿到空物件', async () => {
    const w = panel({ state: null, template: '[{{金錢}}]' })
    expect(w.find('[data-lt="state-panel-skin"]').text()).toBe('[]')
    await w.setProps({ state: { data: { 金錢: 7 }, changes: [] } })
    await w.find('.lt-state-raw-toggle').trigger('click')
    expect(w.find('.lt-state-json').text()).toBe(JSON.stringify({ 金錢: 7 }, null, 2))
    expect(w.find('.lt-state-raw-toggle').text()).toBe('返回面板')
    expect(w.find('.lt-state-raw-toggle').attributes('aria-pressed')).toBe('true')
    await w.find('.lt-state-raw-toggle').trigger('click')
    expect(w.find('[data-lt="state-panel-skin"]').text()).toBe('[7]')
  })

  it('皮膚出錯：作者看到行號與 helper，玩家看到中性提示（不是空白），兩邊都還能看原始數值', async () => {
    const author = panel({ audience: 'author', template: 'a\n{{format 金錢}}' })
    expect(author.find('.lt-state-error').text()).toBe('面板皮膚第 2 行用了不支援的 helper「format」')
    expect(author.find('[data-lt="state-panel-skin"]').exists()).toBe(false)
    author.unmount()
    const authorUnclosed = panel({ audience: 'author', template: '{{#if a}}' })
    expect(authorUnclosed.find('.lt-state-error').text()).toMatch(/^面板皮膚第 1 行有錯誤：Unclosed block/)
    authorUnclosed.unmount()
    const player = panel({ audience: 'player', template: 'a\n{{format 金錢}}' })
    expect(player.find('.lt-state-error').text()).toBe('面板暫時無法顯示數值照常記錄，可以先查看原始數值。')
    expect(player.find('.lt-state-error').text()).not.toContain('format')
    await player.find('.lt-state-raw-toggle').trigger('click')
    expect(player.find('.lt-state-json').exists()).toBe(true)
  })

  it('沒採用的變更只給作者看', async () => {
    const state = { data: { a: 1 }, changes: [], rejected: [{ path: 'b', reason: 'unknown key' }] }
    const author = panel({ audience: 'author', state })
    await author.find('.lt-state-raw-toggle').trigger('click')
    expect(author.findAll('.lt-state-json')).toHaveLength(2)
    expect(author.find('.lt-state-raw-label').text()).toBe('未採用的變更')
    author.unmount()
    const player = panel({ audience: 'player', state })
    await player.find('.lt-state-raw-toggle').trigger('click')
    expect(player.findAll('.lt-state-json')).toHaveLength(1)
  })

  it('皮膚不執行 JS：script 與 on* 拿掉；皮膚 CSS 加上面板前綴', () => {
    const w = panel({ template: '<b onclick="x()">{{金錢}}</b><script>window.__pwned=1</script><style>b{color:red}</style>' })
    const html = w.find('[data-lt="state-panel-skin"]').element.innerHTML
    expect(html).not.toMatch(/script|onclick/)
    expect(html).toContain('.lt-state-skin b{color:red}')
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('data-panel-copy 複製後跳「已複製」，之後收掉', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const w = panel({ template: '<span data-panel-copy>{{金錢}}</span>' })
    await nextTick()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    ;(w.find('[data-panel-copy]').element as HTMLElement).click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('5')
    const toast = w.find('.lt-state-toast')
    expect(toast.attributes('role')).toBe('status')
    expect(toast.text()).toBe('已複製')
    expect(toast.attributes('data-show')).toBe('on')
    vi.advanceTimersByTime(2000)
    await nextTick()
    expect(w.find('.lt-state-toast').attributes('data-show')).toBe('off')
  })
})
