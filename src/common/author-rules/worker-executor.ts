/**
 * 在專用 Web Worker 裡跑規則的執行器。
 *
 * 最多起 size 個 worker（池），每件工作交給手上沒事的那個；規則組每個 worker 各登記一次。
 *
 * worker 以 `?worker&inline` 打包（產物內嵌、blob 網址起），所以舞台套件與沙箱殼都不必多出一個檔案，
 * 站台也不必為它加路由。worker 在第一個工作來時才建（動態 import，不用規則的頁面不付這筆）。
 *
 * 載入失敗的情況（CSP 的 worker-src 不放行 blob:、建構子直接丟錯、腳本沒回報就緒）一律宣告不可用：
 * 手上排著的工作回退給排程器在主執行緒跑完，之後排程器直接走同步——跟改動前一樣，不會卡住。
 * 沒有逾時：已經在跑的規則再慢也等它跑完。
 */
import type { ExecutorJob, RuleExecutor } from './rule-runner'
import type { RuleResult } from './rule-job'
import type { FromRuleWorker, ToRuleWorker } from './rule-worker-protocol'

export interface WorkerLike {
  postMessage(message: ToRuleWorker): void
  addEventListener(type: 'message' | 'error', listener: (event: any) => void): void
  terminate(): void
}

export interface WorkerExecutorOptions {
  /** 測試注入；沒給就用內嵌的規則 worker。 */
  createWorker?: () => WorkerLike | Promise<WorkerLike>
  /** 腳本多久沒回報就緒算載入失敗（只管「起不起得來」，不管規則跑多久）。 */
  readyTimeoutMs?: number
  /** worker 池大小。沒給：注入 createWorker 時 1，否則 defaultPoolSize(核心數)。 */
  size?: number
}

/** worker 記得的規則組上限，跟 worker 端（rule-worker-protocol）同一個數、同一個淘汰順序。 */
const MAX_RULE_SETS = 16

async function createInlineWorker(): Promise<WorkerLike> {
  const mod = await import('./rule-worker?worker&inline')
  return new mod.default() as unknown as WorkerLike
}

/** 預設池大小：min(4, max(1, 核心數 − 1))——留一個核心給主執行緒，上限 4 免得低階機記憶體吃緊。 */
export function defaultPoolSize(hardwareConcurrency?: number): number {
  const cores = typeof hardwareConcurrency === 'number' && hardwareConcurrency > 0 ? Math.floor(hardwareConcurrency) : 2
  return Math.min(4, Math.max(1, cores - 1))
}

interface Slot {
  starting: Promise<WorkerLike>
  worker: WorkerLike | null
  readyTimer: ReturnType<typeof setTimeout> | null
  /** 這個 worker 手上的工作數。 */
  busy: number
  /** 這個 worker 登記過的規則組（各 worker 各記各的）。 */
  sentRules: string[]
}

/** 環境沒有 Worker（測試、SSR）時回 null：排程器改走同步。 */
export function createWorkerExecutor(options: WorkerExecutorOptions = {}): RuleExecutor | null {
  const factory = options.createWorker || (typeof Worker === 'undefined' ? null : createInlineWorker)
  if (!factory) return null
  const readyTimeoutMs = options.readyTimeoutMs ?? 15_000
  const size = Math.max(1, Math.floor(options.size ?? (options.createWorker ? 1 : defaultPoolSize(typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined))))

  let failed = false
  const slots: Slot[] = []
  let seq = 0
  const pending = new Map<number, { resolve: (r: RuleResult) => void; reject: (e: unknown) => void; slot: Slot }>()

  // 任何一個 worker 載入失敗或出錯＝整個執行器不可用（CSP 是整個源的事，不是單一 worker 的事）：
  // 手上的工作全部退回排程器同步跑，之後直接同步——跟單一 worker 時一樣。
  const fail = (reason: unknown, quiet = false) => {
    if (failed) return
    failed = true
    if (!quiet) console.warn('[author-rules] rule worker unavailable; rules run on the main thread', reason)
    for (const p of pending.values()) p.reject(reason)
    pending.clear()
    for (const slot of slots) {
      if (slot.readyTimer) { clearTimeout(slot.readyTimer); slot.readyTimer = null }
      try { if (slot.worker) slot.worker.terminate() } catch { /* 已經停了 */ }
      slot.worker = null
    }
  }

  const onMessage = (slot: Slot) => (event: { data: FromRuleWorker }) => {
    const message = event && event.data
    if (!message) return
    if (message.t === 'ready') {
      if (slot.readyTimer) { clearTimeout(slot.readyTimer); slot.readyTimer = null }
      return
    }
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    waiter.slot.busy--
    if (message.t === 'done') waiter.resolve({ html: message.html, rollbacks: message.rollbacks })
    else waiter.reject(new Error(message.message))
  }

  const addSlot = (): Slot => {
    const slot: Slot = { starting: null as unknown as Promise<WorkerLike>, worker: null, readyTimer: null, busy: 0, sentRules: [] }
    slot.starting = Promise.resolve()
      .then(() => factory())
      .then((w) => {
        slot.worker = w
        w.addEventListener('message', onMessage(slot))
        w.addEventListener('error', (event: any) => fail((event && event.message) || 'worker error'))
        slot.readyTimer = setTimeout(() => fail('worker did not start'), readyTimeoutMs)
        return w
      })
    slots.push(slot)
    return slot
  }

  /** 挑閒的 worker；都在忙且還沒到上限就再起一個（worker 按需才起）。 */
  const pickSlot = (): Slot => {
    let best: Slot | null = null
    for (const slot of slots) if (!best || slot.busy < best.busy) best = slot
    if (best && best.busy === 0) return best
    if (slots.length < size) return addSlot()
    return best!
  }

  return {
    concurrency: size,
    available: () => !failed,
    run(job: ExecutorJob) {
      if (failed) return Promise.reject(new Error('rule worker unavailable'))
      return new Promise<RuleResult>((resolve, reject) => {
        const id = ++seq
        const slot = pickSlot()
        slot.busy++
        pending.set(id, { resolve, reject, slot })
        slot.starting.then((w) => {
          if (failed || !pending.has(id)) return
          try {
            if (!slot.sentRules.includes(job.rulesKey)) {
              w.postMessage({ t: 'rules', key: job.rulesKey, rules: job.rules })
              slot.sentRules.push(job.rulesKey)
              while (slot.sentRules.length > MAX_RULE_SETS) slot.sentRules.shift()
            }
            w.postMessage({ t: 'job', id, engine: job.engine, rulesKey: job.rulesKey, text: job.text, options: job.options })
          } catch (e) {
            // 複製不了（資料裡混進函式之類）：這一件退回排程器同步跑，worker 本身沒壞。
            pending.delete(id)
            slot.busy--
            reject(e)
          }
        }, (e) => fail(e))
      })
    },
    dispose() {
      fail('disposed', true)
    },
  }
}
