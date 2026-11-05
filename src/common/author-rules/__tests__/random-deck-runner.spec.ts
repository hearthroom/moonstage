import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRuleRunner, type ExecutorJob, type RuleExecutor } from '../rule-runner'
import { executeRuleJob, type RuleResult } from '../rule-job'
import { JSDOM } from 'jsdom'
import { updateStorageScope } from '../storage-scope'

const rules = [{ id: 'cg', find: '/<pic>/g', replace: '<b>{{random:A::B::C}}</b>' }]
const picks = (html: string) => [...html.matchAll(/<b>([^<]*)<\/b>/g)].map(m => m[1])
const request = (seed: string, text = '<pic> <pic>') => ({ engine: 'tavern' as const, text, rules, options: { seed, randomScope: 'conversation' } })
beforeEach(() => { vi.stubGlobal('localStorage', new JSDOM('', { url: 'https://draws.test' }).window.localStorage); localStorage.clear(); updateStorageScope('account_scope_123456789') })
afterEach(() => { updateStorageScope(null); localStorage.clear(); vi.unstubAllGlobals() })

describe('conversation draw ledger in the real runner', () => {
  it('shares a pool across messages, persists before reload, and replays in a different rendering order', () => {
    const runner = createRuleRunner({ executor: null })
    const a = runner.display(request('m1')).html
    const b = runner.display(request('m2')).html
    const c = runner.display(request('m3')).html
    const drawn = [...picks(a), ...picks(b), ...picks(c)]
    expect(new Set(drawn.slice(0, 3)).size).toBe(3)
    expect(new Set(drawn.slice(3, 6)).size).toBe(3)
    runner.dispose()
    const reloaded = createRuleRunner({ executor: null })
    expect(reloaded.display(request('m3')).html).toBe(c)
    expect(reloaded.display(request('m1')).html).toBe(a)
    expect(reloaded.display(request('m2')).html).toBe(b)
    reloaded.dispose()
  })

  it('serializes same-conversation jobs even with a two-worker executor', async () => {
    const started: { job: ExecutorJob; resolve: (r: RuleResult) => void }[] = []
    const executor: RuleExecutor = { available: () => true, concurrency: 2,
      run: job => new Promise(resolve => started.push({ job, resolve })),
    }
    const runner = createRuleRunner({ executor })
    const a = runner.apply(request('m1'))
    const b = runner.apply(request('m2'))
    expect(started).toHaveLength(1)
    const finish = () => {
      const next = started.shift()!
      next.resolve(executeRuleJob(next.job.engine, next.job.text, next.job.rules as any[], next.job.options))
    }
    finish()
    const first = await a
    expect(started).toHaveLength(1)
    finish()
    const second = await b
    expect(new Set([...picks(first.html), ...picks(second.html)].slice(0, 3)).size).toBe(3)
    runner.dispose()
  })

  it('retains prior slots while a streaming message grows, including an earlier rule gaining a hit', () => {
    const cardRules = [rules[0], { ...rules[0], find: '/<next>/g' }]
    const runner = createRuleRunner({ executor: null })
    const req = { ...request('m1', '<next> <pic>'), rules: cardRules }
    const first = picks(runner.display(req, { streaming: true }).html)
    const grown = picks(runner.display({ ...req, text: '<next> <pic> <pic>' }, { streaming: true }).html)
    expect(grown[0]).toBe(first[0])
    expect(grown[1]).toBe(first[1])
    expect(new Set(grown).size).toBe(3)
    runner.dispose()
  })

  it('clears local ledgers on logout and keeps account identities out of saved payloads', () => {
    const runner = createRuleRunner({ executor: null })
    runner.display(request('private-message-marker'))
    const stored = Object.entries(localStorage).filter(([k]) => k.startsWith('lt-random-deck:'))
    expect(stored.length).toBeGreaterThan(0)
    expect(JSON.stringify(stored)).not.toContain('private-message-marker')
    expect(JSON.stringify(stored)).not.toContain('conversation')
    updateStorageScope(null)
    expect(Object.keys(localStorage).filter(k => k.startsWith('lt-random-deck:'))).toHaveLength(0)
    runner.dispose()
  })
})

describe('live bubble to durable history draw identity', () => {
  it('binds the canonical alias even on a cache hit, then reloads the same four cards without spending more', () => {
    const runner = createRuleRunner({ executor: null })
    const text = '<pic> <pic> <pic> <pic>'
    const live = { ...request('local-bubble', text), options: { seed: 'local-bubble', randomScope: 'conversation', seedAliases: ['local-bubble'] } }
    const first = runner.display(live).html
    runner.display({ ...live, options: { ...live.options, seedAliases: ['local-bubble', 'saved-message'] } })
    const saved = { ...request('saved-message', text), options: { seed: 'saved-message', randomScope: 'conversation', seedAliases: ['saved-message'] } }
    expect(runner.display(saved).html).toBe(first)
    runner.dispose()
    const reload = createRuleRunner({ executor: null })
    expect(reload.display(saved).html).toBe(first)
    const states = Object.entries(localStorage).filter(([k]) => k.startsWith('lt-random-deck:') && !k.endsWith(':owner')).map(([,v]) => JSON.parse(v))
    expect(Object.values(states[0].pools).reduce((sum: number, pool: any) => sum + pool.drawn, 0)).toBe(4)
    reload.dispose()
  })
})

describe('canonical alias while a worker is in flight', () => {
  it('does not overwrite a newly learned alias with the older worker snapshot', async () => {
    const started: { job: ExecutorJob; resolve: (r: RuleResult) => void }[] = []
    const executor: RuleExecutor = { available: () => true, run: job => new Promise(resolve => started.push({ job: structuredClone(job), resolve })) }
    const runner = createRuleRunner({ executor })
    const req = { ...request('local-inflight'), options: { seed: 'local-inflight', randomScope: 'conversation', seedAliases: ['local-inflight'] } }
    const done = runner.apply(req)
    runner.display({ ...req, options: { ...req.options, seedAliases: ['local-inflight', 'saved-inflight'] } })
    const active = started.shift()!
    active.resolve(executeRuleJob(active.job.engine, active.job.text, active.job.rules as any[], active.job.options))
    const first = await done
    runner.dispose()
    const reload = createRuleRunner({ executor: null })
    expect(reload.display(request('saved-inflight')).html).toBe(first.html)
    reload.dispose()
  })
})
