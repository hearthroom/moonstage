/**
 * 角色介紹：預設三行、點一下展開、右下角有展開狀態的箭頭。
 * owner 2026-09-07 手機截圖：兩行收行套在有內距的氣泡上，第三行從下內距露出半截，而且沒有任何「可以展開」的提示。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import CanvasIntro from '../components/canvas-intro.vue'

const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')

describe('角色介紹', () => {
  it('收行套在 .intro-text（無內距）而不是氣泡本體；三行', () => {
    expect(css).toMatch(/\.avatar-body \.intro-text \{[^}]*-webkit-line-clamp: 3;/)
    expect(css).not.toMatch(/\.avatar-body \.intro-body \{[^}]*-webkit-line-clamp/)
  })

  it('節點：.intro-body 仍在（作者的名字），文字在 .intro-text，箭頭在 .intro-toggle，aria-expanded 跟著 open', async () => {
    const w = mount(CanvasIntro, { props: { text: '在這個世界，龍是唯一的生產力。', open: false } })
    expect(w.find('.item.Ai.avatar-body .intro-body').exists()).toBe(true)
    expect(w.find('.intro-body .intro-text').text()).toContain('龍是唯一的生產力')
    expect(w.find('.intro-body').attributes('aria-expanded')).toBe('false')
    // jsdom 量不出溢出：收起且沒溢出時箭頭不出現
    expect(w.find('.intro-toggle').attributes('hidden')).toBeDefined()
    await w.setProps({ open: true })
    expect(w.find('.intro-body').attributes('aria-expanded')).toBe('true')
    expect(w.find('.intro-body.is-open .intro-toggle').attributes('hidden')).toBeUndefined()
    await w.find('.intro-body').trigger('click')
    expect(w.emitted('toggle')).toHaveLength(1)
  })

  it('溢出時收起態帶 is-clamped、箭頭出現', async () => {
    const proto = HTMLElement.prototype
    const sh = Object.getOwnPropertyDescriptor(proto, 'scrollHeight')
    const ch = Object.getOwnPropertyDescriptor(proto, 'clientHeight')
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => 200 })
    Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => 58 })
    try {
      const w = mount(CanvasIntro, { props: { text: 'x'.repeat(500), open: false } })
      await w.vm.$nextTick()
      expect(w.find('.intro-body.is-clamped').exists()).toBe(true)
      expect(w.find('.intro-toggle').attributes('hidden')).toBeUndefined()
    } finally {
      if (sh) Object.defineProperty(proto, 'scrollHeight', sh); else delete (proto as any).scrollHeight
      if (ch) Object.defineProperty(proto, 'clientHeight', ch); else delete (proto as any).clientHeight
    }
  })
})
