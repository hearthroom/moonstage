/**
 * 作者規則的共用排程器（整個頁面一個 worker 池）與給外部用的 Promise 版 API。
 * 細節見 rule-runner.ts（排程、快取、顯示組合）、worker-executor.ts（worker 池、載入與後備）、
 * persist-idb.ts（定稿結果的持久層；只在 build 注入了引擎版本時啟用，見 engine-version.ts）、
 * storage-scope.ts（持久層的帳號範圍：宿主沒給就不存；登出清掉）。
 */
import type { TavernRule } from '@/pages/canvas/canvas-rule-engine-core'
import { createRuleRunner, type RuleRunner } from './rule-runner'
import { createWorkerExecutor } from './worker-executor'
import { createIdbRulePersist, type ScopedRulePersist } from './persist-idb'
import { AUTHOR_RULE_ENGINE_VERSION } from './engine-version'
import { deleteAuthorRuleStore } from './store'
import { announceStorageClear, updateStorageScope } from './storage-scope'
import type { RuleJobOptions, RuleResult } from './rule-job'

export { createRuleRunner, hideIncompleteTrailingTag } from './rule-runner'
export { createIdbRulePersist } from './persist-idb'
export type { ScopedRulePersist } from './persist-idb'
export { AUTHOR_RULE_DB_NAME, deleteAuthorRuleStore } from './store'
export { getAuthorRuleStorageScope, onStorageScopeChange as onAuthorRuleStorageChange } from './storage-scope'
export type { RuleRunner, RuleRequest, DisplayResult, RuleExecutor, RulePersist } from './rule-runner'
export type { RuleEngineKind, RuleJobOptions, RuleResult } from './rule-job'

let shared: RuleRunner | null = null
let sharedPersist: ScopedRulePersist | null | undefined

/** 頁面共用的持久層（沒注入引擎版本、環境沒有 IndexedDB 時是 null）。建立不開庫；有範圍才開。 */
function getSharedPersist(): ScopedRulePersist | null {
  if (sharedPersist === undefined) {
    try { sharedPersist = AUTHOR_RULE_ENGINE_VERSION ? createIdbRulePersist() : null } catch { sharedPersist = null }
  }
  return sharedPersist
}

/** 頁面共用的排程器；第一次叫才建（worker 更晚，第一個工作來時才起；IndexedDB 有帳號範圍、第一次查時才開）。 */
export function getAuthorRuleRunner(): RuleRunner {
  if (!shared) {
    const engineVersion = AUTHOR_RULE_ENGINE_VERSION
    shared = createRuleRunner({ executor: createWorkerExecutor(), persist: getSharedPersist(), engineVersion })
  }
  return shared
}

/**
 * 持久層的帳號範圍（宿主算好的不可逆雜湊，見 storage-scope.ts）。範圍跟資料庫裡記的不同就先清掉；
 * 沒給或格式不對＝刪掉這個 origin 上的資料、之後只用記憶體。排程器建立前後呼叫都可以。
 */
export function setAuthorRuleStorageScope(scope: unknown): void {
  const value = updateStorageScope(scope)
  const persist = getSharedPersist()
  if (persist) { void persist.setScope(value); return }
  if (!value) void deleteAuthorRuleStore()
}

/** 登出：刪掉這個 origin 上的持久層、之後只用記憶體，並通知開著的沙箱卡也清掉。從不 reject。 */
export function clearAuthorRuleStorage(): Promise<void> {
  announceStorageClear()
  const persist = getSharedPersist()
  if (persist) return persist.clear().catch(() => {})
  return deleteAuthorRuleStore().then(() => {}, () => {})
}

/** 測試或宿主要換掉共用排程器時用；給 null 會在下次取用時重建。 */
export function setAuthorRuleRunner(runner: RuleRunner | null): void {
  if (shared && shared !== runner) shared.dispose()
  shared = runner
}

/**
 * applyTavernRules 的非同步版：在 worker 裡跑到完，結果跟同步版逐字相同（同一份輸入、同一組規則）。
 * 結果依（引擎版本、規則、巨集、簡繁表、全文）記在記憶體 LRU 與持久層，同一份再問不重跑。
 */
export function applyTavernRulesAsync(
  text: string,
  rules: TavernRule[],
  options: RuleJobOptions = {},
): Promise<RuleResult> {
  return getAuthorRuleRunner().apply({ engine: 'tavern', text, rules, options: { macros: options.macros, variants: options.variants } })
}
