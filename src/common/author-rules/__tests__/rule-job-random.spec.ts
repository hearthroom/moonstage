/**
 * {{random:…}} 在同一則訊息裡要穩定：串流每個 chunk 都重套規則，用 Math.random 就是每一跳換一張圖
 * （2026-09-25 回報：隨機一百張圖的卡，輸出中圖片一直狂跳）。帶了訊息種子就按種子挑，同一則訊息不管
 * 長到哪、切成幾段套，挑到的都一樣；不同訊息各挑各的。沒帶種子維持原本每次重抽。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { executeRuleJob } from '../rule-job'
import { createRuleRunner } from '../rule-runner'

afterEach(() => { vi.restoreAllMocks() })

const options = Array.from({ length: 100 }, (_, i) => `p${i}.png`)
const rules = [{ id: 'pic', find: '/<pic>/g', replace: `<b class="pick">{{random:${options.join('::')}}}</b>` }]
const picks = (html: string) => {
  const found = [...html.matchAll(/<b class="pick">([^<]+)<\/b>/g)].map((m) => m[1])
  expect(found.length).toBeGreaterThan(0)
  return found
}

describe('seeded {{random}}', () => {
  for (const engine of ['tavern', 'display'] as const) {
    it(`${engine}: same seed keeps the pick while the message grows`, () => {
      const seen = new Set<string>()
      let text = '<pic>'
      for (let i = 0; i < 30; i++) {
        text += ` 第${i}句。`
        seen.add(picks(executeRuleJob(engine, text, rules as any, { seed: 'msg-1' }).html)[0])
      }
      expect(seen.size).toBe(1)
    })

    it(`${engine}: different messages draw independently`, () => {
      const drawn = new Set<string>()
      for (let i = 0; i < 20; i++) drawn.add(picks(executeRuleJob(engine, '<pic>', rules as any, { seed: `msg-${i}` }).html)[0])
      expect(drawn.size).toBeGreaterThan(5)
    })

    it(`${engine}: a chunk of the message picks what the whole message picks`, () => {
      const whole = executeRuleJob(engine, '開頭。\n\n<pic> 結尾。', rules as any, { seed: 'msg-7' }).html
      const tail = executeRuleJob(engine, '<pic> 結尾。', rules as any, { seed: 'msg-7' }).html
      expect(picks(tail)).toEqual(picks(whole))
    })
  }

  it('without a seed it still draws per application', () => {
    const spy = vi.spyOn(Math, 'random')
    executeRuleJob('tavern', '<pic>', rules as any)
    expect(spy).toHaveBeenCalled()
  })

  it('the runner keys results by seed, so two messages with the same text do not share a pick', () => {
    const runner = createRuleRunner({ executor: null })
    const a = runner.display({ engine: 'tavern', text: '<pic>', rules, options: { seed: 'a' } }).html
    const draws = new Set([a])
    for (let i = 0; i < 20; i++) draws.add(runner.display({ engine: 'tavern', text: '<pic>', rules, options: { seed: `b${i}` } }).html)
    expect(draws.size).toBeGreaterThan(5)
    expect(runner.display({ engine: 'tavern', text: '<pic>', rules, options: { seed: 'a' } }).html).toBe(a)
  })
})
