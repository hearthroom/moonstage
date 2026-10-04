import { describe, expect, it } from 'vitest'
import { createWaitClock, formatWaitElapsed } from './wait-clock'
import zhHant from '@/locale/zh-Hant.json'
import zhHans from '@/locale/zh-Hans.json'
import en from '@/locale/en.json'
import ja from '@/locale/ja.json'
import ko from '@/locale/ko.json'

/*
  等第一個字的時候，玩家要能分辨「它在想」和「卡住了」（owner 2026-10-05）。
  指示器的字輪換（照 Claude Code 那種每次不同的說法），旁邊放已經等了多久——
  不寫「模型還沒回應」這種句子，久了自然看得出來，要不要停、換模型由玩家決定。
*/
const FORMAT = { seconds: '{s} 秒', minutes: '{m} 分 {s} 秒' }

describe('等了多久', () => {
  it('每一顆等回覆的氣泡記第一次出現的時間，之後不變；換一顆重新記', () => {
    let now = 1_000_000
    const clock = createWaitClock(() => now)
    expect(clock.startedAt('a')).toBe(1_000_000)
    now += 23_400
    expect(clock.startedAt('a')).toBe(1_000_000)
    expect(clock.startedAt('b')).toBe(1_023_400)
    clock.keepOnly(new Set(['b']))
    now += 1_000
    expect(clock.startedAt('a')).toBe(1_024_400)
    expect(clock.startedAt('b')).toBe(1_023_400)
  })

  it('格式：一秒以內不顯示，一分鐘以內寫秒，之後寫分秒', () => {
    expect(formatWaitElapsed(0, FORMAT)).toBe('')
    expect(formatWaitElapsed(45, FORMAT)).toBe('45 秒')
    expect(formatWaitElapsed(125, FORMAT)).toBe('2 分 05 秒')
    expect(formatWaitElapsed(45, { seconds: '', minutes: '' })).toBe('')
  })

  it('五種語言都有', () => {
    for (const locale of [zhHant, zhHans, en, ja, ko] as Array<Record<string, string>>) {
      expect(locale['chat.waitSeconds']).toContain('{s}')
      expect(locale['chat.waitMinutes']).toContain('{m}')
    }
  })
})
