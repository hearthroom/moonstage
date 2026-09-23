/**
 * 重整之後別再等一分鐘：定稿結果存進持久層（重開直接拿）、最新的訊息先跑、多個 worker 一起跑。
 *
 * 2026-09-23 正式站（ae14d54 上線後）：規則有災難性回溯的卡，重新載入 13 則歷史，最新那則的 zzz9-frame
 * 要到約 87 秒才出現——結果只在記憶體、佇列從最舊的開始、只有一個 worker，看得到的那則排在所有舊的後面。
 * owner 的界線不變：規則一定跑完、產物跟同步 applyTavernRules 逐字相同、不設逾時跳過、串流字立刻顯示。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyTavernRules } from '@/pages/canvas/canvas-rule-engine'
import { createRuleRunner, type RuleExecutor, type ExecutorJob, type RulePersist, type RulePersistEntry } from '../rule-runner'
import { createWorkerExecutor, defaultPoolSize, type WorkerLike } from '../worker-executor'
import { createRuleWorkerHandler } from '../rule-worker-protocol'
import { executeRuleJob, type RuleResult } from '../rule-job'

afterEach(() => { vi.restoreAllMocks() })

function manualExecutor(concurrency = 1) {
  const started: Array<{ job: ExecutorJob; resolve: (r: RuleResult) => void; done: boolean }> = []
  const executor: RuleExecutor = {
    concurrency,
    available: () => true,
    run: (job) => new Promise<RuleResult>((resolve) => { started.push({ job, resolve, done: false }) }),
  }
  const finish = (i: number) => {
    const s = started[i]
    s.done = true
    s.resolve(executeRuleJob(s.job.engine, s.job.text, s.job.rules as any[], s.job.options))
  }
  const finishText = (text: string) => finish(started.findIndex((s) => !s.done && s.job.text === text))
  const running = () => started.filter((s) => !s.done).map((s) => s.job.text)
  return { executor, started, finish, finishText, running }
}

function memoryPersist() {
  const store = new Map<string, RulePersistEntry>()
  const persist: RulePersist & { store: typeof store; gets: number } = {
    store,
    gets: 0,
    async get(k) { persist.gets++; return store.get(k) },
    set(k, v) { store.set(k, v) },
  }
  return persist
}

const flush = () => new Promise((r) => setTimeout(r, 0))
async function settle(times = 6) { for (let i = 0; i < times; i++) await flush() }

const rules = [{ id: '1', find: 'a', replace: 'b' }]

describe('持久層：重整後直接拿，不排 worker 工作', () => {
  it('持久層命中的訊息不佔 worker：前面有慢工作卡住也照樣馬上拿到', async () => {
    const persist = memoryPersist()
    const first = manualExecutor()
    const a = createRuleRunner({ executor: first.executor, persist, engineVersion: 'v1' })
    a.display({ text: 'a 最新', rules })
    await settle()
    first.finishText('a 最新')
    await settle()
    expect(persist.store.size).toBe(1)

    // 重整：舊的訊息（沒存過）先排、很慢；最新那則在持久層裡。
    const second = manualExecutor()
    const b = createRuleRunner({ executor: second.executor, persist, engineVersion: 'v1' })
    const settled = vi.fn()
    b.onSettled(settled)
    b.display({ text: 'a 舊的', rules })
    expect(b.display({ text: 'a 最新', rules }).provisional).toBe(true)
    await settle()
    expect(settled).toHaveBeenCalled()
    expect(b.display({ text: 'a 最新', rules })).toEqual({ html: 'b 最新', provisional: false })
    expect(second.started.map((s) => s.job.text)).toEqual(['a 舊的'])
    expect(b.stats.persistHits).toBe(1)
  })

  it('apply 也先查持久層', async () => {
    const persist = memoryPersist()
    const one = manualExecutor()
    const a = createRuleRunner({ executor: one.executor, persist, engineVersion: 'v1' })
    const p = a.apply({ text: 'aa', rules })
    await settle()
    one.finish(0)
    await expect(p).resolves.toEqual({ html: 'bb', rollbacks: [] })
    const two = manualExecutor()
    const b = createRuleRunner({ executor: two.executor, persist, engineVersion: 'v1' })
    await expect(b.apply({ text: 'aa', rules })).resolves.toEqual({ html: 'bb', rollbacks: [] })
    expect(two.started).toHaveLength(0)
  })

  it('引擎版本換了就不認舊的結果', async () => {
    const persist = memoryPersist()
    const one = manualExecutor()
    const a = createRuleRunner({ executor: one.executor, persist, engineVersion: 'v1' })
    a.display({ text: 'aa', rules })
    await settle()
    one.finish(0)
    await settle()
    const two = manualExecutor()
    const b = createRuleRunner({ executor: two.executor, persist, engineVersion: 'v2' })
    b.display({ text: 'aa', rules })
    await settle()
    expect(two.started).toHaveLength(1)
  })

  it('沒有引擎版本（宿主沒注入）就不用持久層，免得引擎改了還拿到舊產物', async () => {
    const persist = memoryPersist()
    const one = manualExecutor()
    const a = createRuleRunner({ executor: one.executor, persist, engineVersion: '' })
    a.display({ text: 'aa', rules })
    await settle()
    one.finish(0)
    await settle()
    expect(persist.store.size).toBe(0)
    expect(persist.gets).toBe(0)
  })

  it('串流中途的產物絕不寫進持久層；串流最後一版就是定稿全文時，定稿那一刻寫進去（重整立刻命中）', async () => {
    const persist = memoryPersist()
    const one = manualExecutor()
    const a = createRuleRunner({ executor: one.executor, persist, engineVersion: 'v1' })
    a.display({ text: 'a 中', rules }, { streaming: true })
    one.finish(0)
    await settle()
    a.display({ text: 'a 中途完', rules }, { streaming: true })
    one.finish(1)
    await settle()
    expect(persist.store.size).toBe(0)
    // 定稿：全文跟最後一版相同，直接升格，不再跑
    expect(a.display({ text: 'a 中途完', rules })).toEqual({ html: 'b 中途完', provisional: false })
    expect(one.started).toHaveLength(2)
    expect(persist.store.size).toBe(1)
    const two = manualExecutor()
    const b = createRuleRunner({ executor: two.executor, persist, engineVersion: 'v1' })
    b.display({ text: 'a 中途完', rules })
    await settle()
    expect(two.started).toHaveLength(0)
    expect(b.display({ text: 'a 中途完', rules }).html).toBe('b 中途完')
    expect(b.display({ text: 'a 中', rules }).provisional).toBe(true)
  })

  it('持久層讀寫都丟錯：退回只用記憶體，工作照跑、結果照記', async () => {
    const persist: RulePersist = {
      get: () => { throw new Error('SecurityError') },
      set: () => { throw new Error('QuotaExceededError') },
    }
    const { executor, started, finish } = manualExecutor()
    const runner = createRuleRunner({ executor, persist, engineVersion: 'v1' })
    runner.display({ text: 'aa', rules })
    await settle()
    expect(started).toHaveLength(1)
    finish(0)
    await settle()
    expect(runner.display({ text: 'aa', rules })).toEqual({ html: 'bb', provisional: false })
  })
})

describe('優先序：串流 → 最近要過的 → 較早要過的', () => {
  it('最新的訊息先跑（歷史依畫面順序由舊到新要結果）', async () => {
    const { executor, started, finishText } = manualExecutor()
    const runner = createRuleRunner({ executor })
    for (const t of ['a1', 'a2', 'a3', 'a4']) runner.display({ text: t, rules })
    expect(started.map((s) => s.job.text)).toEqual(['a1'])
    finishText('a1')
    await settle()
    expect(started.map((s) => s.job.text)).toEqual(['a1', 'a4'])
    finishText('a4')
    await settle()
    finishText('a3')
    await settle()
    expect(started.map((s) => s.job.text)).toEqual(['a1', 'a4', 'a3', 'a2'])
  })

  it('串流中的那則插到最前面；重畫時又被要一次的訊息往前排', async () => {
    const { executor, started, finishText } = manualExecutor()
    const runner = createRuleRunner({ executor })
    runner.display({ text: 'aA', rules })
    runner.display({ text: 'aB', rules })
    runner.display({ text: 'aC', rules })
    runner.display({ text: 'a串流', rules }, { streaming: true })
    runner.display({ text: 'aB', rules }) // 重畫：B 又被要了一次
    finishText('aA')
    await settle()
    expect(started.at(-1)!.job.text).toBe('a串流')
    finishText('a串流')
    await settle()
    expect(started.at(-1)!.job.text).toBe('aB')
    finishText('aB')
    await settle()
    expect(started.at(-1)!.job.text).toBe('aC')
  })
})

describe('worker 池', () => {
  it('N 件慢工作、K 個 worker：同時最多 K 件，ceil(N/K) 輪跑完', async () => {
    const K = 3
    const { executor, started, running } = manualExecutor(K)
    const runner = createRuleRunner({ executor })
    const texts = Array.from({ length: 7 }, (_, i) => `a${i}`)
    for (const t of texts) runner.display({ text: t, rules })
    let rounds = 0
    while (running().length) {
      expect(running().length).toBeLessThanOrEqual(K)
      rounds++
      for (let i = 0; i < started.length; i++) if (!started[i].done) started[i].done = true, started[i].resolve(executeRuleJob('tavern', started[i].job.text, rules as any, {}))
      await settle()
    }
    expect(rounds).toBe(Math.ceil(texts.length / K))
    expect(started).toHaveLength(texts.length)
    for (const t of texts) expect(runner.display({ text: t, rules }).html).toBe(applyTavernRules(t, rules).html)
  })

  it('同一則訊息一次只有一件在跑：串流的新版本等舊版本跑完', async () => {
    const { executor, running, finishText } = manualExecutor(4)
    const runner = createRuleRunner({ executor })
    runner.display({ text: 'a一', rules }, { streaming: true })
    runner.display({ text: 'a一二', rules }, { streaming: true })
    runner.display({ text: 'a一二三', rules }, { streaming: true })
    runner.display({ text: 'a別則', rules })
    expect(running()).toEqual(['a一', 'a別則'])
    finishText('a一')
    await settle()
    expect(running()).toEqual(['a別則', 'a一二三'])
  })

  it('兩則不同的定稿歷史互為前綴（或是空字串）：不互擋，各佔一個 worker', () => {
    const { executor, running } = manualExecutor(3)
    const runner = createRuleRunner({ executor })
    runner.display({ text: '', rules })
    runner.display({ text: 'a好', rules })
    runner.display({ text: 'a好的，走吧', rules })
    expect(running().sort()).toEqual(['', 'a好', 'a好的，走吧'].sort())
  })

  it('排程器被換掉（dispose）時，手上在跑的 apply() 仍拿到結果', async () => {
    const { executor, finish } = manualExecutor()
    const runner = createRuleRunner({ executor })
    const p = runner.apply({ text: 'aa', rules })
    await settle()
    runner.dispose()
    finish(0)
    await expect(p).resolves.toEqual({ html: 'bb', rollbacks: [] })
  })

  it('預設池大小 = min(4, max(1, 核心數 − 1))', () => {
    expect(defaultPoolSize(undefined)).toBe(1)
    expect(defaultPoolSize(1)).toBe(1)
    expect(defaultPoolSize(2)).toBe(1)
    expect(defaultPoolSize(4)).toBe(3)
    expect(defaultPoolSize(16)).toBe(4)
  })

  it('真的 worker 協議、池大小 2：規則組每個 worker 各送一次，結果跟同步逐字相同', async () => {
    const workers: Array<WorkerLike & { posted: any[] }> = []
    const make = () => {
      const listeners: Record<string, Array<(e: any) => void>> = { message: [], error: [] }
      const emit = (type: string, e: any) => { for (const fn of listeners[type] || []) fn(e) }
      const handle = createRuleWorkerHandler((m) => setTimeout(() => emit('message', { data: structuredClone(m) }), 0))
      const w = {
        posted: [] as any[],
        postMessage(m: any) { const c = structuredClone(m); w.posted.push(c); setTimeout(() => handle(c), 0) },
        addEventListener(type: string, fn: (e: any) => void) { (listeners[type] ||= []).push(fn) },
        terminate() {},
      }
      setTimeout(() => emit('message', { data: { t: 'ready' } }), 0)
      workers.push(w)
      return w
    }
    const executor = createWorkerExecutor({ createWorker: make, size: 2 })!
    expect(executor.concurrency).toBe(2)
    const runner = createRuleRunner({ executor })
    const texts = ['a1', 'aa2', 'aaa3', 'a4', 'a5']
    const results = await Promise.all(texts.map((text) => runner.apply({ text, rules })))
    expect(results).toEqual(texts.map((t) => applyTavernRules(t, rules)))
    expect(workers).toHaveLength(2)
    for (const w of workers) expect(w.posted.filter((m) => m.t === 'rules')).toHaveLength(1)
    runner.dispose()
  })
})
