/**
 * 上下文用量與每輪點數合成一顆膠囊：圓環在左、數字在右，各自一個點擊區；
 * 第一次出現時在輸入框上方講清楚兩樣東西各是什麼（手機沒有懸停說明）。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasComposer from '../components/canvas-composer.vue'

const RING = { percent: 36, level: 'low', label: '上下文已用 36%，點開看用量' }
const HINT = { ring: '圓環是上下文用量。', score: '數字是每輪點數。', ok: '知道了' }
const base = { value: '', placeholder: '說點什麼', sendState: 'send', generating: false, modelScore: '12–18', scoreHint: '下一輪約 12–18' }

describe('點數與圓環合成一顆膠囊', () => {
  it('圓環與數字在同一顆裡；有圓環時硬幣收起來，節點仍在給作者', () => {
    const w = mount(CanvasComposer, { props: { ...base, contextRing: RING } })
    const meter = w.find('.chat-input-collapsed-row .lt-meter')
    expect(meter.classes()).toContain('has-context')
    expect(meter.find('.lt-context-ring').exists()).toBe(true)
    expect(meter.find('.mind-type-score').text()).toBe('12–18')
    const coin = meter.find('.icon-box')
    expect(coin.exists()).toBe(true)
    expect((coin.element as HTMLElement).style.display).toBe('none')
  })

  it('沒有容量可比時只有數字，硬幣照舊', () => {
    const w = mount(CanvasComposer, { props: { ...base, contextRing: null } })
    expect(w.find('.lt-context-ring').exists()).toBe(false)
    expect((w.find('.icon-box').element as HTMLElement).style.display).toBe('')
  })

  it('點圓環開上下文用量、點數字開模型設定，互不連動', async () => {
    const w = mount(CanvasComposer, { props: { ...base, contextRing: RING } })
    await w.find('.chat-input-collapsed-row .lt-context-ring').trigger('click')
    expect(w.emitted('context')).toHaveLength(1)
    expect(w.emitted('model')).toBeUndefined()
    await w.find('.chat-input-collapsed-row .mind-type').trigger('click')
    expect(w.emitted('model')).toHaveLength(1)
    expect(w.emitted('context')).toHaveLength(1)
  })

  it('數字的懸停與讀屏說明講它是什麼', () => {
    const w = mount(CanvasComposer, { props: { ...base, contextRing: RING } })
    const score = w.find('.chat-input-collapsed-row .mind-type')
    expect(score.attributes('title')).toBe('下一輪約 12–18')
    expect(w.find('.lt-context-ring').attributes('aria-label')).toBe(RING.label)
  })

  it('第一次的說明：有圓環才畫，兩句都在，按「知道了」交回頁面記住', async () => {
    expect(mount(CanvasComposer, { props: { ...base, contextRing: null, meterHint: HINT } }).find('.lt-meter-hint').exists()).toBe(false)
    const w = mount(CanvasComposer, { props: { ...base, contextRing: RING, meterHint: HINT } })
    const hint = w.find('.lt-meter-hint')
    expect(hint.text()).toContain(HINT.ring)
    expect(hint.text()).toContain(HINT.score)
    await hint.find('.lt-meter-hint-ok').trigger('click')
    expect(w.emitted('meter-hint-done')).toHaveLength(1)
    expect(mount(CanvasComposer, { props: { ...base, contextRing: RING, meterHint: null } }).find('.lt-meter-hint').exists()).toBe(false)
  })
})
