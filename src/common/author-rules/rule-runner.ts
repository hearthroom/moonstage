/**
 * 作者規則的排程器：規則在 worker 裡跑到完，主執行緒只負責「先顯示、再換上」。
 *
 * 為什麼：作者的正則可以寫出災難性回溯（2026-09-23 正式站量到一條規則每多一個 span 成本翻倍，
 * 30 個 span 要 24 秒），在主執行緒跑就是整頁凍住；串流時每個 chunk 重跑一次，就是反覆凍住。
 * 規則不能逾時跳過、不能改語意（產物要跟同步的 applyTavernRules 逐字相同），所以只能換地方跑。
 *
 * 兩個入口：
 *   display(req, { streaming })  同步回傳「現在該顯示什麼」，絕不等規則：
 *     - 有結果（快取）→ 就是它（provisional: false）。
 *     - 沒有 → 排一個工作；先回「最近一次套完的產物＋之後才到的原文」（原文尾巴上沒收完的標籤先藏），
 *       連可接的產物都沒有就回原文（provisional: true）。工作跑完發 onSettled，呼叫端重畫再來拿。
 *   apply(req)  Promise 版，給只要最終結果的呼叫端（applyTavernRulesAsync）。
 *
 * 排程：同時最多 executor.concurrency 件（worker 池；每件跑不跑得完都不打斷）。
 *   優先序：串流中的請求 → 其餘依「最近一次被要」由新到舊。畫面由舊到新渲染歷史，所以最新那則最後被要、
 *   最先跑；重畫時還在等的列會再被要一次、往前排（看得到的列正是會被重畫的那些）。
 *   2026-09-23 正式站：FIFO＋單一 worker 時，重整 13 則歷史、最新那則要約 87 秒才套上樣式。
 *   串流中的請求會合併：新的全文若是某個還在排隊的串流請求的延伸，那個舊版本直接拿掉。
 *   同一則訊息（同 prefixKey、全文互為前綴）一次只跑一件：新版本等手上那件跑完，不搶第二個 worker。
 *
 * 快取：鍵是（引擎版本、規則組內容、巨集與簡繁表、引擎種類、輸入全文）。
 *   - 定稿（非串流）的結果進 LRU，也寫進持久層（IndexedDB，重整、回訪直接拿）。
 *   - 串流中途的結果只進「最近完成」小環：拿來接顯示、以及「最後一版剛好就是定稿全文」時直接升格——
 *     同一份輸入的套用結果就是同一份，升格不是把中途產物當定稿（升格時才寫持久層）。
 *   - 持久層在排工作之前查（各自並行，不佔 worker）：命中就不排工作。沒注入引擎版本時不用持久層——
 *     引擎改了鍵不變，會拿到舊產物，違反「跟同步套用逐字相同」。
 *
 * 後備：沒有執行器（測試、SSR、環境沒有 Worker）或執行器宣告不可用（worker 載入被擋）時，
 *   display／apply 直接在呼叫端同步套用，跟改動前的行為一樣。
 */
import { substituteMacros, type TavernRule } from '@/pages/canvas/canvas-rule-engine-core'
import { executeRuleJob, type RuleEngineKind, type RuleJobOptions, type RuleResult } from './rule-job'

export interface RuleRequest {
  engine?: RuleEngineKind
  text: string
  rules: TavernRule[] | readonly unknown[]
  options?: RuleJobOptions
}

/** 交給執行器的工作：全是可結構化複製的純資料。 */
export interface ExecutorJob {
  engine: RuleEngineKind
  text: string
  rulesKey: string
  rules: unknown[]
  options: RuleJobOptions
}

export interface RuleExecutor {
  run(job: ExecutorJob): Promise<RuleResult>
  /** 同時能跑幾件（worker 池大小）；沒給算 1。 */
  readonly concurrency?: number
  /** false：這個執行器已經確定跑不起來（例如 worker 被 CSP 擋），排程器改走同步。 */
  available(): boolean
  dispose?(): void
}

export interface RulePersistEntry {
  /** prefixKey（含引擎版本）：讀回來時核對，雜湊撞了也不會拿錯。 */
  p: string
  text: string
  html: string
  rollbacks: RuleResult['rollbacks']
}

/** 可選的持久層。每個方法都可能丟錯（儲存被停用、配額），排程器自己吞。 */
export interface RulePersist {
  get(key: string): Promise<RulePersistEntry | undefined>
  set(key: string, value: RulePersistEntry): void
}

export interface DisplayResult {
  html: string
  /** true：規則結果還沒回來，這是暫時的畫面；別當成定稿（別記進別的快取、別啟動作者腳本）。 */
  provisional: boolean
}

export interface RuleRunnerOptions {
  executor: RuleExecutor | null
  persist?: RulePersist | null
  /** 規則引擎原始碼的雜湊（build 時注入）。空字串或沒給＝不用持久層。 */
  engineVersion?: string
  /** LRU 上限（筆數與字元數，兩者先到先算）。 */
  cacheEntries?: number
  cacheChars?: number
}

export interface RuleRunner {
  display(req: RuleRequest, opts?: { streaming?: boolean }): DisplayResult
  apply(req: RuleRequest): Promise<RuleResult>
  /** 只看定稿快取，不排工作。 */
  peek(req: RuleRequest): RuleResult | undefined
  /** 任何一個工作完成時通知（呼叫端據此重畫）。回傳退訂函式。 */
  onSettled(fn: () => void): () => void
  readonly stats: { jobs: number; inline: number; persistHits: number }
  dispose(): void
}

/**
 * 原文尾巴上沒收完的標籤（`<span class="zz` 還沒等到 `>`）先藏起來，收完再出現——
 * 不然半截標籤會以字面閃一下。`a < b` 這種後面接空白的不算標籤。
 */
export function hideIncompleteTrailingTag(text: string): string {
  const lt = text.lastIndexOf('<')
  if (lt < 0 || text.indexOf('>', lt) >= 0) return text
  const rest = text.slice(lt + 1)
  if (rest === '' || /^[/!]?[^\s<>]/.test(rest)) return text.slice(0, lt)
  return text
}

/** cyrb53：夠快、夠散的字串雜湊（快取鍵用，不是安全用途）。 */
function hash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

interface Plain<T> { key: string; plain: T }

interface Keyed {
  /** 引擎＋規則＋選項：同一個 prefixKey 的結果才能互相接續。 */
  prefixKey: string
  key: string
  text: string
  engine: RuleEngineKind
  rulesKey: string
  rules: unknown[]
  options: RuleJobOptions
}

interface Waiter { resolve: (r: RuleResult) => void; reject: (e: unknown) => void }

interface Job extends Keyed {
  streaming: boolean
  /** 結果要進定稿快取（有非串流的請求要它）。 */
  final: boolean
  waiters: Waiter[]
  /** 最近一次被要的序號：越大越先跑（串流另外優先）。 */
  seq: number
  /** 'probe'：正在查持久層；'queued'：可以跑；'running'：在執行器上。 */
  phase: 'probe' | 'queued' | 'running'
}

interface Completed { prefixKey: string; text: string; result: RuleResult }

const RECENT_LIMIT = 24

export function createRuleRunner(options: RuleRunnerOptions): RuleRunner {
  const executor = options.executor
  const engineVersion = typeof options.engineVersion === 'string' ? options.engineVersion : ''
  const persist = engineVersion ? options.persist || null : null
  const maxEntries = options.cacheEntries ?? 300
  const maxChars = options.cacheChars ?? 12_000_000

  // 規則組與簡繁表按物件身分記住雜湊與純資料副本：每次渲染都拿同一個陣列來，
  // 不必每個 chunk 都序列化整份規則。Vue 的響應式代理對同一個原物件回同一個代理，身分也穩。
  const plainCache = new WeakMap<object, Plain<any>>()
  const plainOf = <T>(value: unknown, tag: string): Plain<T> => {
    if (!value || typeof value !== 'object') return { key: `${tag}0`, plain: (tag === 'r' ? [] : null) as T }
    const hit = plainCache.get(value as object)
    if (hit) return hit
    const json = JSON.stringify(value)
    const entry = { key: `${tag}${hash(json)}.${json.length}`, plain: JSON.parse(json) as T }
    plainCache.set(value as object, entry)
    return entry
  }

  const keyOf = (req: RuleRequest): Keyed => {
    const engine: RuleEngineKind = req.engine === 'display' ? 'display' : 'tavern'
    const rules = plainOf<unknown[]>(Array.isArray(req.rules) ? req.rules : null, 'r')
    const opts = req.options || {}
    const variants = plainOf<Record<string, string> | null>(opts.variants || null, 'v')
    const jobOptions: RuleJobOptions = { variants: variants.plain }
    let macroKey = ''
    if (engine === 'tavern' && opts.macros) {
      const macros: Record<string, string> = {}
      if (opts.macros.user !== undefined) macros.user = opts.macros.user
      if (opts.macros.char !== undefined) macros.char = opts.macros.char
      jobOptions.macros = macros
      macroKey = JSON.stringify(macros)
    }
    // 種子只在規則裡有 {{random}} 時才影響產物；沒有就不進鍵，定稿快取與持久層照舊跨訊息共用。
    const seeded = typeof opts.seed === 'string' && opts.seed !== '' && rules.key !== 'r0' && JSON.stringify(rules.plain).includes('{{random:')
    if (seeded) jobOptions.seed = opts.seed
    const text = typeof req.text === 'string' ? req.text : ''
    const prefixKey = `${engineVersion}\u0001${engine}\u0001${rules.key}\u0001${variants.key}\u0001${macroKey}${seeded ? `\u0001s${opts.seed}` : ''}`
    return { prefixKey, key: `${prefixKey}\u0001${text}`, text, engine, rulesKey: rules.key, rules: rules.plain, options: jobOptions }
  }

  // ── 定稿快取（LRU） ──
  const lru = new Map<string, { result: RuleResult; size: number }>()
  let lruChars = 0
  const lruGet = (key: string, touch = true): RuleResult | undefined => {
    const hit = lru.get(key)
    if (!hit) return undefined
    if (touch) { lru.delete(key); lru.set(key, hit) }
    return hit.result
  }
  const lruSet = (key: string, result: RuleResult) => {
    const old = lru.get(key)
    if (old) { lruChars -= old.size; lru.delete(key) }
    const size = key.length + result.html.length
    lru.set(key, { result, size })
    lruChars += size
    while (lru.size > 1 && (lru.size > maxEntries || lruChars > maxChars)) {
      const oldest = lru.keys().next().value as string
      lruChars -= lru.get(oldest)!.size
      lru.delete(oldest)
    }
  }

  // ── 最近完成（含串流中途）：接顯示用 ──
  const recent: Completed[] = []
  const remember = (k: Keyed, result: RuleResult) => {
    const at = recent.findIndex((c) => c.prefixKey === k.prefixKey && c.text === k.text)
    if (at >= 0) recent.splice(at, 1)
    recent.push({ prefixKey: k.prefixKey, text: k.text, result })
    while (recent.length > RECENT_LIMIT) recent.shift()
  }
  const recentExact = (k: Keyed): RuleResult | undefined => {
    for (let i = recent.length - 1; i >= 0; i--) {
      const c = recent[i]
      if (c.prefixKey === k.prefixKey && c.text === k.text) return c.result
    }
    return undefined
  }
  const compose = (k: Keyed): string => {
    let best: Completed | null = null
    for (const c of recent) {
      if (c.prefixKey !== k.prefixKey || c.text.length > k.text.length) continue
      if (best && c.text.length <= best.text.length) continue
      if (k.text.startsWith(c.text)) best = c
    }
    // Only expand the raw tail; the completed prefix already contains literal names.
    const tail = hideIncompleteTrailingTag(best ? k.text.slice(best.text.length) : k.text)
    const expanded = k.engine === 'tavern' ? substituteMacros(tail, k.options.macros || {}) : tail
    return (best?.result.html || '') + expanded
  }

  const persistKey = (k: Keyed) => `${k.prefixKey}\u0001${hash(k.text)}.${k.text.length}`
  const persistGet = async (k: Keyed): Promise<RuleResult | undefined> => {
    if (!persist) return undefined
    try {
      const hit = await persist.get(persistKey(k))
      if (hit && hit.p === k.prefixKey && hit.text === k.text && typeof hit.html === 'string') {
        return { html: hit.html, rollbacks: Array.isArray(hit.rollbacks) ? hit.rollbacks : [] }
      }
    } catch { /* 儲存被停用：當作沒有 */ }
    return undefined
  }
  const persistSet = (k: Keyed, result: RuleResult) => {
    if (!persist) return
    try { persist.set(persistKey(k), { p: k.prefixKey, text: k.text, html: result.html, rollbacks: result.rollbacks }) } catch { /* 寫不進去就算了 */ }
  }
  /** 定稿：進 LRU、寫持久層。 */
  const promote = (k: Keyed, result: RuleResult) => {
    lruSet(k.key, result)
    persistSet(k, result)
  }

  const stats = { jobs: 0, inline: 0, persistHits: 0 }
  const listeners = new Set<() => void>()
  let disposed = false

  const runInline = (k: Keyed): RuleResult => {
    stats.inline++
    try {
      return executeRuleJob(k.engine, k.text, k.rules as TavernRule[], k.options)
    } catch (e) {
      // 引擎本身丟例外（今天會一路丟到渲染層）：顯示原文，不讓整頁壞掉。
      console.error('[author-rules] rule engine threw', e)
      return { html: k.text, rollbacks: [] }
    }
  }
  const inlineMode = () => !executor || !executor.available()

  // ── 排程 ──
  const concurrency = Math.max(1, Math.floor((executor && executor.concurrency) || 1))
  const jobs = new Map<string, Job>()
  let queue: Job[] = []
  const inflight = new Set<Job>()
  let seqCounter = 0

  const emitSettled = () => {
    for (const fn of Array.from(listeners)) {
      try { fn() } catch (e) { console.error('[author-rules] settled listener threw', e) }
    }
  }

  const complete = (job: Job, result: RuleResult, fromPersist = false) => {
    if (!disposed) {
      inflight.delete(job)
      jobs.delete(job.key)
      remember(job, result)
      if (job.final) {
        if (fromPersist) lruSet(job.key, result)
        else promote(job, result)
      }
    }
    // 排程器被換掉（dispose）時手上的 apply() 照樣拿到結果，不會永遠等。
    for (const w of job.waiters) w.resolve(result)
    job.waiters = []
    if (disposed) return
    pump()
    emitSettled()
  }

  const execute = (job: Job) => {
    if (inlineMode()) { complete(job, runInline(job)); return }
    stats.jobs++
    executor!.run({ engine: job.engine, text: job.text, rulesKey: job.rulesKey, rules: job.rules, options: job.options }).then(
      (result) => complete(job, result),
      // 執行器跑不動（worker 死了、被擋、引擎在 worker 裡丟錯）：同一份工作在這裡跑完，結果仍一致。
      () => complete(job, runInline(job)),
    )
  }

  /**
   * 同一則訊息的另一個版本（同 prefixKey、全文互為前綴，至少一邊是串流中的）已經在跑。
   * 兩件都是定稿就不算：「好」與「好的，…」是兩則不同的歷史，空字串更是任何全文的前綴——不能互擋。
   */
  const sameMessageRunning = (job: Job): boolean => {
    for (const r of inflight) {
      if (r.prefixKey !== job.prefixKey) continue
      if (!job.streaming && !r.streaming) continue
      if (job.text.startsWith(r.text) || r.text.startsWith(job.text)) return true
    }
    return false
  }

  const pickNext = (): Job | null => {
    let best: Job | null = null
    for (const j of queue) {
      if (sameMessageRunning(j)) continue
      if (!best) { best = j; continue }
      const js = j.streaming && !j.final
      const bs = best.streaming && !best.final
      if (js !== bs) { if (js) best = j; continue }
      if (j.seq > best.seq) best = j
    }
    return best
  }

  function pump() {
    while (!disposed && inflight.size < concurrency) {
      const job = pickNext()
      if (!job) return
      queue = queue.filter((j) => j !== job)
      job.phase = 'running'
      inflight.add(job)
      execute(job)
    }
  }

  const makeRunnable = (job: Job) => {
    job.phase = 'queued'
    queue.push(job)
    pump()
  }

  const enqueue = (k: Keyed, streaming: boolean): Job => {
    const existing = jobs.get(k.key)
    if (existing) {
      if (!streaming) { existing.final = true; existing.streaming = false }
      existing.seq = ++seqCounter
      return existing
    }
    if (streaming) {
      // 合併：還在排隊、沒人等結果的串流請求，若只是這一版的前綴（同一則訊息的舊版本），直接拿掉。
      queue = queue.filter((j) => {
        const superseded = j.streaming && !j.final && !j.waiters.length && j.prefixKey === k.prefixKey && k.text.startsWith(j.text)
        if (superseded) jobs.delete(j.key)
        return !superseded
      })
    }
    const job: Job = { ...k, streaming, final: !streaming, waiters: [], seq: ++seqCounter, phase: 'probe' }
    jobs.set(job.key, job)
    if (!streaming && persist) {
      // 先查持久層（不佔 worker、各自並行）；沒有才排進去跑。
      persistGet(job).then((hit) => {
        if (hit) { stats.persistHits++; complete(job, hit, true); return }
        if (!disposed) makeRunnable(job)
      })
      return job
    }
    makeRunnable(job)
    return job
  }

  return {
    display(req, opts = {}) {
      const streaming = !!opts.streaming
      const k = keyOf(req)
      const hit = lruGet(k.key)
      if (hit) return { html: hit.html, provisional: false }
      const done = recentExact(k)
      if (done) {
        if (!streaming) promote(k, done)
        return { html: done.html, provisional: false }
      }
      if (inlineMode()) {
        const result = runInline(k)
        remember(k, result)
        if (!streaming) lruSet(k.key, result)
        return { html: result.html, provisional: false }
      }
      enqueue(k, streaming)
      return { html: compose(k), provisional: true }
    },

    apply(req) {
      const k = keyOf(req)
      const hit = lruGet(k.key)
      if (hit) return Promise.resolve(hit)
      const done = recentExact(k)
      if (done) { promote(k, done); return Promise.resolve(done) }
      if (inlineMode()) {
        const result = runInline(k)
        remember(k, result)
        lruSet(k.key, result)
        return Promise.resolve(result)
      }
      return new Promise<RuleResult>((resolve, reject) => {
        enqueue(k, false).waiters.push({ resolve, reject })
      })
    },

    peek(req) {
      return lruGet(keyOf(req).key, false)
    },

    onSettled(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },

    stats,

    dispose() {
      disposed = true
      listeners.clear()
      queue = []
      jobs.clear()
      inflight.clear()
      try { if (executor && executor.dispose) executor.dispose() } catch { /* 收尾不得拋錯 */ }
    },
  }
}
