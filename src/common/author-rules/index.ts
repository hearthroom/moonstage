/**
 * 作者規則的共用排程器（整個頁面一個 worker 池）與給外部用的 Promise 版 API。
 * 細節見 rule-runner.ts（排程、快取、顯示組合）、worker-executor.ts（worker 池、載入與後備）、
 * persist-idb.ts（定稿結果的持久層；只在 build 注入了引擎版本時啟用，見 engine-version.ts）。
 */
import type { TavernRule } from '@/pages/canvas/canvas-rule-engine-core'
import { createRuleRunner, type RuleRunner } from './rule-runner'
import { createWorkerExecutor } from './worker-executor'
import { createIdbRulePersist } from './persist-idb'
import { AUTHOR_RULE_ENGINE_VERSION } from './engine-version'
import type { RuleJobOptions, RuleResult } from './rule-job'

export { createRuleRunner, hideIncompleteTrailingTag } from './rule-runner'
export { createIdbRulePersist } from './persist-idb'
export type { RuleRunner, RuleRequest, DisplayResult, RuleExecutor, RulePersist } from './rule-runner'
export type { RuleEngineKind, RuleJobOptions, RuleResult } from './rule-job'

let shared: RuleRunner | null = null

/** 頁面共用的排程器；第一次叫才建（worker 更晚，第一個工作來時才起；IndexedDB 第一次查時才開）。 */
export function getAuthorRuleRunner(): RuleRunner {
  if (!shared) {
    const engineVersion = AUTHOR_RULE_ENGINE_VERSION
    let persist = null
    try { persist = engineVersion ? createIdbRulePersist() : null } catch { persist = null }
    shared = createRuleRunner({ executor: createWorkerExecutor(), persist, engineVersion })
  }
  return shared
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
