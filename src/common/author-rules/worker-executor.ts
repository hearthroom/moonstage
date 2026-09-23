/**
 * 在專用 Web Worker 裡跑規則的執行器。
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
}

/** worker 記得的規則組上限，跟 worker 端（rule-worker-protocol）同一個數、同一個淘汰順序。 */
const MAX_RULE_SETS = 16

async function createInlineWorker(): Promise<WorkerLike> {
  const mod = await import('./rule-worker?worker&inline')
  return new mod.default() as unknown as WorkerLike
}

/** 環境沒有 Worker（測試、SSR）時回 null：排程器改走同步。 */
export function createWorkerExecutor(options: WorkerExecutorOptions = {}): RuleExecutor | null {
  const factory = options.createWorker || (typeof Worker === 'undefined' ? null : createInlineWorker)
  if (!factory) return null
  const readyTimeoutMs = options.readyTimeoutMs ?? 15_000

  let failed = false
  let worker: WorkerLike | null = null
  let starting: Promise<WorkerLike> | null = null
  let readyTimer: ReturnType<typeof setTimeout> | null = null
  let seq = 0
  const pending = new Map<number, { resolve: (r: RuleResult) => void; reject: (e: unknown) => void }>()
  const sentRules: string[] = []

  const fail = (reason: unknown, quiet = false) => {
    if (failed) return
    failed = true
    if (readyTimer) { clearTimeout(readyTimer); readyTimer = null }
    if (!quiet) console.warn('[author-rules] rule worker unavailable; rules run on the main thread', reason)
    for (const p of pending.values()) p.reject(reason)
    pending.clear()
    try { if (worker) worker.terminate() } catch { /* 已經停了 */ }
    worker = null
  }

  const onMessage = (event: { data: FromRuleWorker }) => {
    const message = event && event.data
    if (!message) return
    if (message.t === 'ready') {
      if (readyTimer) { clearTimeout(readyTimer); readyTimer = null }
      return
    }
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.t === 'done') waiter.resolve({ html: message.html, rollbacks: message.rollbacks })
    else waiter.reject(new Error(message.message))
  }

  const ensure = (): Promise<WorkerLike> => {
    if (starting) return starting
    starting = Promise.resolve()
      .then(() => factory())
      .then((w) => {
        worker = w
        w.addEventListener('message', onMessage)
        w.addEventListener('error', (event: any) => fail((event && event.message) || 'worker error'))
        readyTimer = setTimeout(() => fail('worker did not start'), readyTimeoutMs)
        return w
      })
    return starting
  }

  return {
    available: () => !failed,
    run(job: ExecutorJob) {
      if (failed) return Promise.reject(new Error('rule worker unavailable'))
      return new Promise<RuleResult>((resolve, reject) => {
        const id = ++seq
        pending.set(id, { resolve, reject })
        ensure().then((w) => {
          if (failed || !pending.has(id)) return
          try {
            if (!sentRules.includes(job.rulesKey)) {
              w.postMessage({ t: 'rules', key: job.rulesKey, rules: job.rules })
              sentRules.push(job.rulesKey)
              while (sentRules.length > MAX_RULE_SETS) sentRules.shift()
            }
            w.postMessage({ t: 'job', id, engine: job.engine, rulesKey: job.rulesKey, text: job.text, options: job.options })
          } catch (e) {
            // 複製不了（資料裡混進函式之類）：這一件退回排程器同步跑，worker 本身沒壞。
            pending.delete(id)
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
