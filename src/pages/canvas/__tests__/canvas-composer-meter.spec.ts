/**
 * 上下文用量與每輪點數合成一顆膠囊：圓環在左、數字在右，各自一個點擊區；
 * 沒看過說明的人第一次點圓環，說明跟上下文用量一起出來（手機沒有懸停說明）；
 * 不自己彈，免得打壞卡片自己的開場與全畫面覆蓋。
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

  it('說明不自己彈；第一次點圓環才跟上下文用量一起出來，按「知道了」交回頁面記住', async () => {
    const w = mount(CanvasComposer, { props: { ...base, contextRing: RING, meterHint: HINT } })
    expect(w.find('.lt-meter-hint').exists()).toBe(false)
    await w.find('.chat-input-collapsed-row .lt-context-ring').trigger('click')
    expect(w.emitted('context')).toHaveLength(1)
    const hint = w.find('.lt-meter-hint')
    expect(hint.text()).toContain(HINT.ring)
    expect(hint.text()).toContain(HINT.score)
    await hint.find('.lt-meter-hint-ok').trigger('click')
    expect(w.emitted('meter-hint-done')).toHaveLength(1)
    expect(w.find('.lt-meter-hint').exists()).toBe(false)
    // 看過了：再點圓環只開上下文用量
    const seen = mount(CanvasComposer, { props: { ...base, contextRing: RING, meterHint: null } })
    await seen.find('.chat-input-collapsed-row .lt-context-ring').trigger('click')
    expect(seen.find('.lt-meter-hint').exists()).toBe(false)
  })
})

describe('第一次的說明蓋在卡片的浮鈕之上', () => {
  it('說明是 popover，出現時進 top layer、放在輸入框正上方，彈層打開後再抬一次', async () => {
    const shown: HTMLElement[] = []
    const proto = HTMLElement.prototype as any
    const had = proto.showPopover
    proto.showPopover = function () { shown.push(this) }
    try {
      const w = mount(CanvasComposer, { props: { ...base, contextRing: RING, meterHint: HINT }, attachTo: document.body })
      await w.find('.chat-input-collapsed-row .lt-context-ring').trigger('click')
      await new Promise((r) => setTimeout(r, 0))
      const hint = w.find('.lt-meter-hint').element as HTMLElement
      expect(hint.getAttribute('popover')).toBe('manual')
      expect(shown).toContain(hint)
      expect(hint.style.bottom).toMatch(/px$/)
      w.unmount()
    } finally {
      proto.showPopover = had
    }
  })
})
