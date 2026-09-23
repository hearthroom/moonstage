/**
 * 規則 worker 的訊息協議與 worker 端的處理器（worker 入口只負責接線，邏輯在這裡，才測得到）。
 *
 * 主執行緒 → worker
 *   { t: 'rules', key, rules }   登記一組規則（每組只送一次；之後的工作只帶 key，不必每個 chunk 都複製整份規則）
 *   { t: 'job', id, engine, rulesKey, text, options }
 * worker → 主執行緒
 *   { t: 'ready' }               worker 腳本已經跑起來（載入被擋的話永遠不會來）
 *   { t: 'done', id, html, rollbacks }
 *   { t: 'error', id, message }  規則引擎本身丟例外（主執行緒改用同步後備跑同一份，結果仍一致）
 *
 * 沒有逾時：一條規則再慢也跑到完。
 */
import { executeRuleJob, type RuleEngineKind, type RuleJobOptions, type RuleRollback } from './rule-job'

export type ToRuleWorker =
  | { t: 'rules'; key: string; rules: unknown[] }
  | { t: 'job'; id: number; engine: RuleEngineKind; rulesKey: string; text: string; options: RuleJobOptions }

export type FromRuleWorker =
  | { t: 'ready' }
  | { t: 'done'; id: number; html: string; rollbacks: RuleRollback[] }
  | { t: 'error'; id: number; message: string }

/** worker 記得的規則組數上限：換卡、改草稿會換 key，舊的留幾組就夠。 */
const MAX_RULE_SETS = 16

export function createRuleWorkerHandler(post: (message: FromRuleWorker) => void) {
  const ruleSets = new Map<string, any[]>()
  return (message: ToRuleWorker) => {
    if (!message || typeof message !== 'object') return
    if (message.t === 'rules') {
      ruleSets.delete(message.key)
      ruleSets.set(message.key, Array.isArray(message.rules) ? message.rules : [])
      while (ruleSets.size > MAX_RULE_SETS) ruleSets.delete(ruleSets.keys().next().value as string)
      return
    }
    if (message.t === 'job') {
      const rules = ruleSets.get(message.rulesKey)
      if (!rules) {
        post({ t: 'error', id: message.id, message: 'unknown rule set' })
        return
      }
      try {
        const out = executeRuleJob(message.engine, message.text, rules, message.options || {})
        post({ t: 'done', id: message.id, html: out.html, rollbacks: out.rollbacks })
      } catch (e) {
        post({ t: 'error', id: message.id, message: String((e && (e as Error).message) || e) })
      }
    }
  }
}
