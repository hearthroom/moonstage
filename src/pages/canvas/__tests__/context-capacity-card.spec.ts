import fs from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChatSystemMessage from '../../../components/chat-system-message/chat-system-message.vue'
import { resolveChatErrorPresentation } from '../../../utils/chat-error-message'
import { capacityTitleKey } from '../canvas-capacity-choice'
import zh from '../../../locale/zh-Hant.json'
import zhHans from '../../../locale/zh-Hans.json'

// Exercise the actual inline presentation functions, not a parallel mapping.
const source = fs.readFileSync('src/pages/canvas/canvas.vue', 'utf8')
const t = (key: string) => (zh as Record<string, string>)[key] || key
function renderValue(name: string, reason: string, item: any = null) {
  const start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\nfunction ', start + 1)
  return new Function('t', 'capacityTitleKey', `${source.slice(start, end)}; return ${name};`)(t, capacityTitleKey)(reason, item)
}

// owner 2026-11-08：這些字會讓玩家以為卡片內容被刪了，容量相關的卡與彈窗都不能出現。
const alarming = ['角色設定', '超過', '超出', '精簡', '刪', '遺漏']

describe('capacity rejection card', () => {
  it('tells the player to raise the context capacity instead of retrying blindly', () => {
    const reason = resolveChatErrorPresentation('context_capacity_exceeded', t).finishReason
    const card = mount(ChatSystemMessage, { props: {
      kind: renderValue('getSystemMsgKind', reason),
      label: renderValue('getSystemMsgLabel', reason),
      sub: renderValue('getSystemMsgSub', reason),
      cta: t('contextFootprint.action'),
      ctaAction: 'open_model_settings',
    } })
    expect(card.text()).toContain(zh['error.contextCapacityTitle'])
    expect(card.text()).toContain(zh['error.contextCapacityExceeded'])
    for (const word of alarming) expect(card.text()).not.toContain(word)
    expect(card.text()).not.toContain('對話都還保留著')
    expect(card.text()).not.toContain('連線失敗')
    expect(card.text()).not.toContain('伺服器暫時不穩定')
    expect(card.find('.sys-cta').text()).toBe(zh['contextFootprint.action'])
  })
})

// 送出前就放不下、伺服器也說了哪種玩法放得下：卡片不叫玩家縮短訊息或換模型，
// 而是說放不下的是這張卡（第一輪）還是這段對話（聊到後面），並給一顆鍵打開選擇。
describe('capacity rejection card with advice', () => {
  it('names the card on the first turn and the conversation later, without alarming words', () => {
    const start = renderValue('getSystemMsgLabel', 'context_capacity_choice', { capacitySituation: 'start' })
    const later = renderValue('getSystemMsgLabel', 'context_capacity_choice', { capacitySituation: 'later' })
    expect(start).toBe(zh['canvas.capacity.titleStart'])
    expect(later).toBe(zh['canvas.capacity.titleLater'])
    expect(renderValue('getSystemMsgLabel', 'context_capacity_choice')).toBe(zh['canvas.capacity.titleStart'])
    const sheet = ['canvas.capacity.titleStart', 'canvas.capacity.titleLater', 'canvas.capacity.content', 'canvas.capacity.raise', 'canvas.capacity.raiseNoSize', 'canvas.capacity.raiseSub', 'canvas.capacity.trim', 'canvas.capacity.trimSub', 'canvas.capacity.choose', 'error.contextCapacitySettings']
    for (const key of sheet) for (const word of alarming) expect(t(key)).not.toContain(word)
    // 標題常折成兩行，中文沒有斷詞：用看不見的連字號（U+2060）把詞黏住，只會在詞與詞之間換行。
    // 看得到的字與 owner 定稿一字不差。
    const WJ = '\u2060'
    expect(zh['canvas.capacity.titleStart'].replaceAll(WJ, '')).toBe('這張卡在更大的上下文容量下體驗更佳')
    expect(zh['canvas.capacity.titleLater'].replaceAll(WJ, '')).toBe('這段對話在更大的上下文容量下體驗更佳')
    for (const key of ['canvas.capacity.titleStart', 'canvas.capacity.titleLater']) {
      for (const word of ['上下文容量', '體驗', '更佳']) expect(zh[key]).toContain([...word].join(WJ))
    }
    // 沒有選項的那張卡（跑到一半放不下）標題也會折行；簡中同一套。
    expect(zh['error.contextCapacityTitle']).toContain([...'上下文容量'].join(WJ))
    for (const key of ['canvas.capacity.titleStart', 'canvas.capacity.titleLater', 'error.contextCapacityTitle']) {
      expect((zhHans as Record<string, string>)[key]).toContain([...'上下文容量'].join(WJ))
    }
    for (const key of ['canvas.capacity.titleStart', 'canvas.capacity.titleLater']) {
      for (const word of ['体验', '更佳']) expect((zhHans as Record<string, string>)[key]).toContain([...word].join(WJ))
    }
    // 彈窗標題與泡泡標題用同一個判斷，兩種頁面（一般卡、沙箱卡）都一樣。
    expect(source).toMatch(/:title="t\(capacityTitleKey\(capacitySpec\.situation\)\)"/)
    expect(source).toMatch(/case 'capacity':[\s\S]{0,80}t\(capacityTitleKey\(capacitySpec\.value\.situation\)\)/)
  })

  it('talks about the card size instead of shortening the message, and offers the choice', () => {
    const card = mount(ChatSystemMessage, { props: {
      kind: renderValue('getSystemMsgKind', 'context_capacity_choice'),
      label: renderValue('getSystemMsgLabel', 'context_capacity_choice', { capacitySituation: 'later' }),
      sub: renderValue('getSystemMsgSub', 'context_capacity_choice'),
      cta: t('canvas.capacity.choose'),
      ctaAction: 'capacity_choice',
    } })
    expect(card.text()).toContain(zh['error.contextCapacitySettings'])
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
    const bubble = source.slice(source.indexOf('function appendChatErrorBubble('), source.indexOf('function appendChatErrorBubble(') + 1800)
    expect(bubble).toContain('askCapacityChoice(')
    // 判斷在錯誤泡泡推進去之前做，存在泡泡上，之後從泡泡重開彈窗也用同一個結果。
    expect(bubble.indexOf('capacitySituation(talkList.value')).toBeLessThan(bubble.indexOf('talkList.value.push('))
    expect(bubble).toContain('capacitySituation: situation')
    expect(source).toMatch(/askCapacityChoice\(item\?\.capacityAdvice[^\n]*item\?\.capacitySituation\)/)
    expect(source).toMatch(/case 'capacity':[\s\S]{0,200}capacityProps\.value/)
    expect(source).toMatch(/panel\.sheet === 'capacity'/)
    expect(source).toMatch(/case 'capacity':[\s\S]{0,200}onCapacityPick\(/)
  })
})
