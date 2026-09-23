import fs from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChatSystemMessage from '../../../components/chat-system-message/chat-system-message.vue'
import { resolveChatErrorPresentation } from '../../../utils/chat-error-message'
import zh from '../../../locale/zh-Hant.json'

// Exercise the actual inline presentation functions, not a parallel mapping.
const source = fs.readFileSync('src/pages/canvas/canvas.vue', 'utf8')
const t = (key: string) => (zh as Record<string, string>)[key] || key
function renderValue(name: string, reason: string) {
  const start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\nfunction ', start + 1)
  return new Function('t', `${source.slice(start, end)}; return ${name};`)(t)(reason)
}

describe('capacity rejection card', () => {
  it('shows capacity guidance instead of a network failure and offers no blind retry', () => {
    const reason = resolveChatErrorPresentation('context_capacity_exceeded', t).finishReason
    const card = mount(ChatSystemMessage, { props: {
      kind: renderValue('getSystemMsgKind', reason),
      label: renderValue('getSystemMsgLabel', reason),
      sub: renderValue('getSystemMsgSub', reason),
      cta: '',
    } })
    expect(card.text()).toContain('容量')
    expect(card.text()).toContain('縮短這次訊息')
    expect(card.text()).toContain('既有對話已保留')
    expect(card.text()).not.toContain('連線失敗')
    expect(card.find('.sys-cta').exists()).toBe(false)
  })
})

// 第一輪就裝不下、伺服器也說了哪種玩法裝得下：卡片不再叫玩家縮短訊息或換模型，
// 而是說這張卡的設定比目前的容量大，並給一顆鍵打開選擇。
describe('capacity rejection card with advice', () => {
  it('talks about the card size instead of shortening the message, and offers the choice', () => {
    const card = mount(ChatSystemMessage, { props: {
      kind: renderValue('getSystemMsgKind', 'context_capacity_choice'),
      label: renderValue('getSystemMsgLabel', 'context_capacity_choice'),
      sub: renderValue('getSystemMsgSub', 'context_capacity_choice'),
      cta: t('canvas.capacity.choose'),
      ctaAction: 'capacity_choice',
    } })
    expect(card.text()).toContain('這張卡')
    expect(card.text()).not.toContain('縮短')
    expect(card.text()).not.toContain('切換')
    expect(card.text()).not.toContain('連線失敗')
    expect(card.find('.sys-cta').text()).toBe(zh['canvas.capacity.choose'])
    // getSystemMsgCtaLabel 有型別標註，new Function 讀不了；直接量它對這個動作回的字。
    expect(source).toMatch(/action === 'capacity_choice'\) return t\('canvas\.capacity\.choose'\)/)
    expect(source).toMatch(/finishReason === 'context_capacity_choice'\) return 'capacity_choice'/)
  })

  it('keeps the advice from the error event through to the card and opens the same sheet in both page modes', () => {
    const wsError = source.slice(source.indexOf("case 'error':"), source.indexOf("case 'error':") + 1200)
    expect(wsError).toContain('resolveContextCapacityAdvice(event.data)')
    const bubble = source.slice(source.indexOf('function appendChatErrorBubble('), source.indexOf('function appendChatErrorBubble(') + 1500)
    expect(bubble).toContain('askCapacityChoice(')
    expect(source).toMatch(/case 'capacity':[\s\S]{0,200}capacityProps\.value/)
    expect(source).toMatch(/panel\.sheet === 'capacity'/)
    expect(source).toMatch(/case 'capacity':[\s\S]{0,200}onCapacityPick\(/)
  })
})
