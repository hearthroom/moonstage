import { describe, expect, it } from 'vitest'
import { traditionalResendText } from '../canvas-traditional-resend'

describe('前置被擋：轉成繁體再送出的字', () => {
  it('簡體訊息 → 整句轉成繁體', () => {
    expect(traditionalResendText('我们一起去学校吧')).toBe('我們一起去學校吧')
  })
  it('簡繁混排、簡體字比較少也算含簡體', () => {
    const out = traditionalResendText('這個軟體真的很好用，就是这里有点慢')
    expect(out).toContain('這裡有點慢')
  })
  it('已是繁體（連詞庫會改寫的台北、了解、周末也一樣）→ 不出現', () => {
    expect(traditionalResendText('我們在台北了解一下周末的行程')).toBe('')
    expect(traditionalResendText('他今天很開心')).toBe('')
  })
  it('只有兩用字（范、干這類簡繁都寫得出來的字）→ 不出現：繁體人名不會被改成範先生', () => {
    expect(traditionalResendText('范先生')).toBe('')
    expect(traditionalResendText('范先生说的话我们都听到了')).toContain('說的話我們都聽到了')
  })
  it('沒有中文、空白 → 不出現', () => {
    expect(traditionalResendText('hello there')).toBe('')
    expect(traditionalResendText('こんにちは')).toBe('')
    expect(traditionalResendText('')).toBe('')
    expect(traditionalResendText('   ')).toBe('')
  })
  it('轉好的字再判斷一次 → 不出現（不會叫玩家轉第二次）', () => {
    const once = traditionalResendText('我们一起去学校吧')
    expect(traditionalResendText(once)).toBe('')
  })
})
