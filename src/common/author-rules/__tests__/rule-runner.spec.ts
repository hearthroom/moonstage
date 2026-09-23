/**
 * 作者規則離開主執行緒：worker 跑、主執行緒只負責「先顯示、再換上」。
 *
 * 2026-09-23 正式站量到：一張卡的規則 `^(?!…)(?!(?:<span class="zzz9-…">…</span>|<img>|\s)+$)([\s\S]+)$`
 * 每多一個 zzz9 span 成本翻倍（24 個約 370ms、30 個約 24 秒），串流時每個 chunk 都在主執行緒重跑，
 * 整頁凍住。owner 的界線：規則一定跑完、產物跟今天逐字相同；串流字一到就顯示；定稿後是完整套用的結果。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyTavernRules } from '@/pages/canvas/canvas-rule-engine'
import { applyDisplayRules } from '@/utils/display-rule-engine.js'
import { createRuleRunner, hideIncompleteTrailingTag, type RuleExecutor, type ExecutorJob } from '../rule-runner'
import { createWorkerExecutor, type WorkerLike } from '../worker-executor'
import { createRuleWorkerHandler } from '../rule-worker-protocol'
import { executeRuleJob, type RuleResult } from '../rule-job'

afterEach(() => { vi.restoreAllMocks() })

/** 假 worker：訊息走結構化複製、下一個 macrotask 才處理——跟真的 worker 一樣不共用記憶體、不同步回來。 */
function fakeWorker(opts: { failToLoad?: boolean } = {}): WorkerLike & { posted: any[] } {
  const listeners: Record<string, Array<(e: any) => void>> = { message: [], error: [] }
  const emit = (type: string, e: any) => { for (const fn of listeners[type] || []) fn(e) }
  const handle = createRuleWorkerHandler((message) => setTimeout(() => emit('message', { data: structuredClone(message) }), 0))
  const worker = {
    posted: [] as any[],
    postMessage(message: any) {
      const copy = structuredClone(message)
      worker.posted.push(copy)
      if (opts.failToLoad) return
      setTimeout(() => handle(copy), 0)
    },
    addEventListener(type: string, fn: (e: any) => void) { (listeners[type] ||= []).push(fn) },
    removeEventListener() {},
    terminate() {},
  }
  setTimeout(() => {
    if (opts.failToLoad) emit('error', { message: 'blocked by CSP' })
    else emit('message', { data: { t: 'ready' } })
  }, 0)
  return worker
}

/** 手動執行器：每個工作都掛著，測試決定什麼時候放行（模擬很慢的規則）。 */
function manualExecutor() {
  const started: Array<{ job: ExecutorJob; resolve: (r: RuleResult) => void }> = []
  const executor: RuleExecutor = {
    available: () => true,
    run: (job) => new Promise<RuleResult>((resolve) => { started.push({ job, resolve }) }),
  }
  const finish = (i = started.length - 1) => {
    const s = started[i]
    s.resolve(executeRuleJob(s.job.engine, s.job.text, s.job.rules as any[], s.job.options))
  }
  return { executor, started, finish }
}

const flush = () => new Promise((r) => setTimeout(r, 0))
async function settle(times = 6) { for (let i = 0; i < times; i++) await flush() }

const REPRESENTATIVE: Array<{ name: string; text: string; rules: any[]; options?: any }> = [
  { name: '巨集', text: '說：哈囉', rules: [{ id: '1', find: '/說：([\\s\\S]*)/', replace: '{{char}} 對 {{user}} 說：$1' }], options: { macros: { user: '玩家', char: '角色' } } },
  { name: '具名捕獲', text: 'hp:80', rules: [{ id: '1', find: '/hp:(?<value>\\d+)/', replace: '生命 $<value>' }] },
  { name: 'trimStrings', text: '【 旁白：天亮了 】', rules: [{ id: '1', find: '/【([\\s\\S]*?)】/g', replace: '<i>$1</i>', trimStrings: ['旁白：', ' '] }] },
  { name: '兩位數組', text: '【abcdefghij k】', rules: [{ id: '1', find: '/【(a)(b)(c)(d)(e)(f)(g)(h)(i)(j) (k)】/', replace: '$1-$10-$11-$12', trimStrings: ['z'] }] },
  { name: '壞匹配式回滾', text: 'abc', rules: [{ id: 'bad', find: '/([/', replace: 'x', trimStrings: ['y'] }] },
  { name: '停用與只給提示詞', text: '原文', rules: [{ id: '1', find: '原文', replace: '改過', enabled: false }, { id: '2', find: '原文', replace: 'X', promptOnly: true }] },
  { name: '順序', text: 'a', rules: [{ id: '1', find: 'a', replace: 'b' }, { id: '2', find: 'b', replace: 'c' }] },
  { name: '簡繁對照', text: '開門', rules: [{ id: '1', find: '开门', replace: '<b>門開了</b>' }], options: { variants: { '开': '开開', '门': '门門' } } },
  { name: '欄位表與旗標', text: '<st>hp::85;;mood::害羞</st>', rules: [{ id: '1', find: '/<st>([^<]*)<\\/st>/i', replace: 'HP $hp／$mood' }] },
  { name: '相對媒體來源', text: '[x]', rules: [{ id: '1', find: '[x]', replace: '<img src="x-scene" onerror="go()">' }] },
  { name: '空匹配回滾', text: 'abc', rules: [{ id: 'e', find: '/x*/', replace: '!' }] },
]

describe('非同步結果跟同步 applyTavernRules 逐字相同', () => {
  it.each(REPRESENTATIVE)('$name（走真的 worker 協議、結構化複製）', async ({ text, rules, options }) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const runner = createRuleRunner({ executor: createWorkerExecutor({ createWorker: () => fakeWorker() }) })
    const expected = applyTavernRules(text, rules, options || {})
    await expect(runner.apply({ text, rules, options })).resolves.toEqual(expected)
    runner.dispose()
  })

  it('沙箱殼的顯示引擎（display）也一樣', async () => {
    const runner = createRuleRunner({ executor: createWorkerExecutor({ createWorker: () => fakeWorker() }) })
    const rules = [{ id: '1', find: '开门', replace: '<b>$0門開了</b>' }]
    const options = { variants: { '开': '开開', '门': '门門' } }
    await expect(runner.apply({ engine: 'display', text: '開門', rules, options }))
      .resolves.toEqual(applyDisplayRules('開門', rules, options))
    runner.dispose()
  })

  it('規則是 Vue 響應式代理也送得進 worker（先脫成純資料）', async () => {
    const { reactive } = await import('vue')
    const rules = reactive([{ id: '1', find: 'a', replace: 'b' }])
    const runner = createRuleRunner({ executor: createWorkerExecutor({ createWorker: () => fakeWorker() }) })
    await expect(runner.apply({ text: 'aa', rules })).resolves.toEqual({ html: 'bb', rollbacks: [] })
    runner.dispose()
  })

  it('同一組規則只送一次給 worker，之後的工作只帶 key', async () => {
    const worker = fakeWorker()
    const runner = createRuleRunner({ executor: createWorkerExecutor({ createWorker: () => worker }) })
    const rules = [{ id: '1', find: 'a', replace: 'b' }]
    await runner.apply({ text: 'a1', rules })
    await runner.apply({ text: 'a2', rules })
    expect(worker.posted.filter((m) => m.t === 'rules')).toHaveLength(1)
    expect(worker.posted.filter((m) => m.t === 'job')).toHaveLength(2)
    runner.dispose()
  })
})

describe('串流：字一到就顯示，規則跟得上多少算多少', () => {
  const rules = [{ id: '1', find: '/【([^】]*)】/g', replace: '<b>$1</b>' }]

  it('工作在跑時進來的 chunk 全部併成一個：跑完只接著跑最新的那一版', async () => {
    const { executor, started, finish } = manualExecutor()
    const runner = createRuleRunner({ executor })
    let text = '【一】'
    runner.display({ text, rules }, { streaming: true })
    expect(started).toHaveLength(1)
    for (let i = 0; i < 20; i++) {
      text += `字${i}`
      runner.display({ text, rules }, { streaming: true })
    }
    expect(started).toHaveLength(1)
    finish(0)
    await settle()
    expect(started).toHaveLength(2)
    expect(started[1].job.text).toBe(text)
    finish(1)
    await settle()
    expect(started).toHaveLength(2)
    // 定稿：最後一版已經跑過，直接是完整套用的結果、不再排工作
    const done = runner.display({ text, rules })
    expect(done.provisional).toBe(false)
    expect(done.html).toBe(applyTavernRules(text, rules).html)
    expect(started).toHaveLength(2)
  })

  it('定稿的全文跟最後一版不同：排一個工作，跑完換上的是完整套用的結果', async () => {
    const { executor, started, finish } = manualExecutor()
    const runner = createRuleRunner({ executor })
    const settled = vi.fn()
    runner.onSettled(settled)
    runner.display({ text: '【一】之', rules }, { streaming: true })
    finish(0)
    await settle()
    const final = '【一】之後【二】'
    const first = runner.display({ text: final, rules })
    expect(first.provisional).toBe(true)
    expect(started).toHaveLength(2)
    finish(1)
    await settle()
    expect(settled).toHaveBeenCalled()
    const after = runner.display({ text: final, rules })
    expect(after).toEqual({ html: '<b>一</b>之後<b>二</b>', provisional: false })
  })

  it('顯示＝上一次套完的產物＋之後才到的原文；每個 chunk 立刻可見，不等工作', async () => {
    const { executor, finish } = manualExecutor()
    const runner = createRuleRunner({ executor })
    runner.display({ text: '【一】', rules }, { streaming: true })
    finish(0)
    await settle()
    const a = runner.display({ text: '【一】今天', rules }, { streaming: true })
    expect(a).toEqual({ html: '<b>一</b>今天', provisional: true })
    const b = runner.display({ text: '【一】今天天氣', rules }, { streaming: true })
    expect(b.html).toBe('<b>一</b>今天天氣')
  })

  it('尾巴上沒收完的標籤先藏起來，收完才出現', async () => {
    const { executor, finish } = manualExecutor()
    const runner = createRuleRunner({ executor })
    runner.display({ text: '【一】', rules }, { streaming: true })
    finish(0)
    await settle()
    expect(runner.display({ text: '【一】好<span class="zz', rules }, { streaming: true }).html).toBe('<b>一</b>好')
    expect(runner.display({ text: '【一】好<span class="zz">', rules }, { streaming: true }).html).toBe('<b>一</b>好<span class="zz">')
  })

  it('還沒有任何結果時顯示原文（同樣藏起半截標籤）', () => {
    const { executor } = manualExecutor()
    const runner = createRuleRunner({ executor })
    expect(runner.display({ text: '剛開始<zzz9-eng', rules })).toEqual({ html: '剛開始', provisional: true })
  })
})

describe('半截標籤', () => {
  it.each([
    ['字<span class="zz', '字'],
    ['字<', '字'],
    ['字</sp', '字'],
    ['字<状态', '字'],
    ['a < b', 'a < b'],
    ['字<b>粗', '字<b>粗'],
    ['沒有標籤', '沒有標籤'],
  ])('%s → %s', (input, out) => { expect(hideIncompleteTrailingTag(input)).toBe(out) })
})

describe('快取', () => {
  const rules = [{ id: '1', find: 'a', replace: 'b' }]

  it('定稿結果記住：重畫、重開不重跑', async () => {
    const { executor, started, finish } = manualExecutor()
    const runner = createRuleRunner({ executor })
    runner.display({ text: 'aaa', rules })
    finish(0)
    await settle()
    for (let i = 0; i < 5; i++) expect(runner.display({ text: 'aaa', rules })).toEqual({ html: 'bbb', provisional: false })
    await expect(runner.apply({ text: 'aaa', rules })).resolves.toEqual({ html: 'bbb', rollbacks: [] })
    expect(started).toHaveLength(1)
  })

  it('換了巨集或規則就是另一筆', async () => {
    const { executor, started, finish } = manualExecutor()
    const runner = createRuleRunner({ executor })
    const macroRule = [{ id: '1', find: 'x', replace: '{{user}}' }]
    runner.display({ text: 'x', rules: macroRule, options: { macros: { user: 'A' } } })
    finish(0)
    await settle()
    expect(runner.display({ text: 'x', rules: macroRule, options: { macros: { user: 'B' } } }).provisional).toBe(true)
    expect(runner.display({ text: 'x', rules: [{ id: '1', find: 'x', replace: 'y' }] }).provisional).toBe(true)
    expect(started.length).toBeGreaterThanOrEqual(2)
  })

  it('串流中途的產物不當定稿收進快取', async () => {
    const { executor, finish } = manualExecutor()
    const runner = createRuleRunner({ executor })
    runner.display({ text: 'a 中途', rules }, { streaming: true })
    finish(0)
    await settle()
    expect(runner.peek({ text: 'a 中途', rules })).toBeUndefined()
    // 定稿版本才進
    runner.display({ text: 'a 定稿', rules })
    finish(1)
    await settle()
    expect(runner.peek({ text: 'a 定稿', rules })).toEqual({ html: 'b 定稿', rollbacks: [] })
  })

  it('持久層：定稿結果寫進去，重整後（新的 runner）先從那裡拿、不跑工作', async () => {
    const store = new Map<string, any>()
    const persist = { get: async (k: string) => store.get(k), set: (k: string, v: any) => { store.set(k, v) } }
    const first = manualExecutor()
    const a = createRuleRunner({ executor: first.executor, persist, engineVersion: 'v1' })
    a.display({ text: 'aa', rules })
    await settle() // 先查持久層（沒有）才排工作
    first.finish(0)
    await settle()
    expect(store.size).toBe(1)
    const second = manualExecutor()
    const b = createRuleRunner({ executor: second.executor, persist, engineVersion: 'v1' })
    expect(b.display({ text: 'aa', rules }).provisional).toBe(true)
    await settle()
    expect(second.started).toHaveLength(0)
    expect(b.display({ text: 'aa', rules })).toEqual({ html: 'bb', provisional: false })
  })

  it('持久層壞掉（儲存被停用）照樣跑完', async () => {
    const persist = { get: async () => { throw new Error('SecurityError') }, set: () => { throw new Error('QuotaExceeded') } }
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

describe('病態規則不擋呼叫端', () => {
  // 正式站那條規則原樣；22 個 span 約 100ms 級（每多一個翻倍），不到秒級、測試跑得動。
  const PATHOLOGICAL = '/^(?!<section class="zzz9-frame")(?!(?:<span class="zzz9-(?:engine|config|css)"[^>]*>[\\s\\S]*?<\\/span>|<img\\b[^>]*>|\\s)+$)([\\s\\S]+)$/'
  const rules = [{ id: 'slow', find: PATHOLOGICAL, replace: '<section class="zzz9-frame">$1</section>' }]
  const text = Array.from({ length: 22 }, (_, i) => `<span class="zzz9-engine" data-i="${i}">e${i}</span>`).join('\n') + '\n<span class="zzz9-config">x</span>'

  it('顯示路徑立刻回來；worker 跑完的結果跟同步一致', async () => {
    const t0 = performance.now()
    const expected = applyTavernRules(text, rules).html
    const syncMs = performance.now() - t0

    const runner = createRuleRunner({ executor: createWorkerExecutor({ createWorker: () => fakeWorker() }) })
    const t1 = performance.now()
    const shown = runner.display({ text, rules }, { streaming: true })
    const displayMs = performance.now() - t1
    expect(shown.provisional).toBe(true)
    expect(displayMs).toBeLessThan(Math.max(5, syncMs / 4))

    const settled = new Promise<void>((resolve) => runner.onSettled(() => resolve()))
    await settled
    expect(runner.display({ text, rules }, { streaming: true })).toEqual({ html: expected, provisional: false })
    runner.dispose()
  }, 20_000)
})

describe('後備：沒有 worker 的環境（測試、SSR）或 worker 被擋', () => {
  const rules = [{ id: '1', find: 'a', replace: 'b' }]

  it('沒有執行器＝跟今天一樣同步套用', () => {
    const runner = createRuleRunner({ executor: null })
    expect(runner.display({ text: 'aa', rules }, { streaming: true })).toEqual({ html: 'bb', provisional: false })
  })

  it('環境沒有 Worker：createWorkerExecutor 回 null', () => {
    expect(typeof Worker).toBe('undefined')
    expect(createWorkerExecutor()).toBeNull()
  })

  it('worker 載不起來（例如 CSP 擋 blob:）：排著的工作改在主執行緒跑完，之後直接同步', async () => {
    const runner = createRuleRunner({ executor: createWorkerExecutor({ createWorker: () => fakeWorker({ failToLoad: true }) }) })
    const settled = vi.fn()
    runner.onSettled(settled)
    expect(runner.display({ text: 'aa', rules }).provisional).toBe(true)
    await settle()
    expect(settled).toHaveBeenCalled()
    expect(runner.display({ text: 'aa', rules })).toEqual({ html: 'bb', provisional: false })
    expect(runner.display({ text: 'aaa', rules }, { streaming: true })).toEqual({ html: 'bbb', provisional: false })
    await expect(runner.apply({ text: 'a', rules })).resolves.toEqual({ html: 'b', rollbacks: [] })
  })
})
