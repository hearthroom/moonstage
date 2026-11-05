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
    it(`${engine}: each hit in one message draws independently and survives append and reload`, () => {
      const text = Array.from({ length: 20 }, () => '<pic>').join('\n\n')
      const first = picks(executeRuleJob(engine, text, rules as any, { seed: 'same-message' }).html)
      expect(first).toHaveLength(20)
      expect(new Set(first).size).toBeGreaterThan(5)
      expect(picks(executeRuleJob(engine, text + ' 後續文字 <pic>', rules as any, { seed: 'same-message' }).html).slice(0, 20)).toEqual(first)
      // Fresh runners have no memory or persisted HTML to mask a changing draw.
      const render = () => createRuleRunner({ executor: null }).display({ engine, text, rules, options: { seed: 'same-message' } }).html
      expect(picks(render())).toEqual(first)
      expect(render()).toBe(render())
    })

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

describe('seeded random worker parity', () => {
  it('tavern and display workers produce the same per-hit draws as inline execution', async () => {
    const { createRuleWorkerHandler } = await import('../rule-worker-protocol')
    const replies: any[] = []
    const handle = createRuleWorkerHandler((reply: any) => replies.push(reply))
    const text = '<pic> <pic> <pic>'
    for (const engine of ['tavern', 'display'] as const) {
      handle({ t: 'rules', key: 'cg', rules })
      handle({ t: 'job', id: 1, engine, text, rulesKey: 'cg', options: { seed: 'worker-message' } })
      const reply = replies.pop()
      expect(reply.html).toBe(executeRuleJob(engine, text, rules as any, { seed: 'worker-message' }).html)
      expect(new Set(picks(reply.html)).size).toBeGreaterThan(1)
    }
  })
})

describe('conversation random pool without replacement', () => {
  for (const engine of ['tavern', 'display'] as const) {
    it(`${engine}: one pool is shared across tokens, rules and messages, and reshuffled after exhaustion`, () => {
      const pool = ['one', 'two', 'three']
      const pair = `<b class="pick">{{random:${pool.join('::')}}}</b>`
      const cardRules = [
        { id: 'a', find: '/<a>/g', replace: pair + pair },
        { id: 'b', find: '/<b>/g', replace: pair },
      ]
      const first = executeRuleJob(engine, '<a> <b>', cardRules, { seed: 'm1', randomScope: 'conv-pool' } as any) as any
      const firstPicks = picks(first.html)
      expect(new Set(firstPicks).size).toBe(3)
      const second = executeRuleJob(engine, '<a> <b>', cardRules, { seed: 'm2', randomScope: 'conv-pool', randomState: first.randomState } as any) as any
      expect(new Set(picks(second.html)).size).toBe(3)
      const replay = executeRuleJob(engine, '<a> <b>', cardRules, { seed: 'm1', randomScope: 'conv-pool', randomState: JSON.parse(JSON.stringify(second.randomState)) } as any)
      expect(replay.html).toBe(first.html)
    })

    it(`${engine}: later chunks keep earlier slots even when an earlier rule gains a hit`, () => {
      const first = executeRuleJob(engine, '<next> <pic>', [...rules, { ...rules[0], id: 'next', find: '/<next>/g' }], { seed: 'm1', randomScope: 'conv-grow' } as any) as any
      const grown = executeRuleJob(engine, '<next> <pic> <pic>', [...rules, { ...rules[0], id: 'next', find: '/<next>/g' }], { seed: 'm1', randomScope: 'conv-grow', randomState: first.randomState } as any)
      expect(picks(grown.html)[0]).toBe(picks(first.html)[0])
    })
  }
})

describe('rolled-back rules do not spend random cards', () => {
  for (const engine of ['tavern', 'display'] as const) {
    it(`${engine}: rolls the draw ledger back with an over-volume replacement`, () => {
      const token = '{{random:A::B::C}}'
      const cardRules = [
        { id: 'too-large', find: '/<big>/g', replace: 'x'.repeat(150000) + token },
        { id: 'small', find: '/<small>/g', replace: `<b class="pick">${token}</b>` },
      ]
      const out = executeRuleJob(engine, '<big><big><small><small><small>', cardRules, { seed: 'm1', randomScope: 'rollback-deck' })
      expect(out.rollbacks).toContainEqual({ ruleId: 'too-large', reason: 'volume' })
      expect(new Set(picks(out.html)).size).toBe(3)
      expect(Object.values(out.randomState!.pools)[0].drawn).toBe(3)
    })
  }
})
