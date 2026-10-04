import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import ChatTypingIndicator from './chat-typing-indicator.vue'

describe('ChatTypingIndicator', () => {
  it('renders a compact, accessible three-dot reply status', () => {
    const wrapper = mount(ChatTypingIndicator, {
      props: { label: 'Replying' },
    })

    expect(wrapper.get('.chat-typing-indicator').attributes()).toMatchObject({
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
      'aria-label': 'Replying',
    })
    expect(wrapper.findAll('.typing-dot')).toHaveLength(3)
    expect(wrapper.get('.typing-label').text()).toBe('Replying')
    expect(wrapper.html()).not.toContain('fui-load-ani')
  })

  it('keeps the typing placeholder free of assistant identity and message actions', () => {
    const chatSource = fs.readFileSync(
      path.resolve(__dirname, '../../pages/canvas/canvas.vue'),
      'utf8',
    )

    const message = fs.readFileSync(
      path.resolve(__dirname, '../../pages/canvas/components/canvas-message.vue'),
      'utf8',
    )
    const css = fs.readFileSync(
      path.resolve(__dirname, '../../pages/canvas/canvas.css'),
      'utf8',
    )
    // 那顆氣泡還不是一則訊息：不掛名字、不掛動作
    expect(message).toContain("'is-loading': message.loading")
    expect(css).toMatch(/\.mes\.is-loading \.ch_name,\s*\n\s*\.mes\.is-loading \.select-box \{\s*\n\s*display: none;/)
    expect(chatSource).toContain('loading: !!item.chatLoading')
    // 等回覆的那一列點不出選單：還沒說出口的話沒有可以做的事。
    expect(chatSource).toContain('if (!item || item.chatLoading) return')
    expect(message).toContain('v-if="message.loading"')
  })
})

describe('ChatTypingIndicator：等了多久自己走秒', () => {
  // 宿主只給開始的時間，秒數在元件裡走：不必每秒重畫整頁、也不必每秒把畫面資料送進沙箱殼。
  it('從開始時間算起，每秒更新；讀屏只念說法，不念秒數', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(100_000)
      const wrapper = mount(ChatTypingIndicator, {
        props: { label: '正細細斟酌用詞…', startedAt: 100_000 - 23_000, elapsedFormat: { seconds: '{s} 秒', minutes: '{m} 分 {s} 秒' } },
      })
      expect(wrapper.get('.typing-elapsed').text()).toBe('23 秒')
      expect(wrapper.get('.typing-elapsed').attributes('aria-hidden')).toBe('true')
      expect(wrapper.get('.chat-typing-indicator').attributes('aria-label')).toBe('正細細斟酌用詞…')
      await vi.advanceTimersByTimeAsync(102_000)
      expect(wrapper.get('.typing-elapsed').text()).toBe('2 分 05 秒')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('沒有開始時間就不畫秒數', () => {
    const wrapper = mount(ChatTypingIndicator, { props: { label: '整理劇情中…' } })
    expect(wrapper.find('.typing-elapsed').exists()).toBe(false)
  })
})
