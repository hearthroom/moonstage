/**
 * 一次規則套用 = 一個純函式呼叫。主執行緒的同步後備與 Web Worker 跑的是同一支，
 * 所以兩邊的產物逐字相同——worker 只是換個地方跑，不是另一套實作。
 *
 * 兩種引擎：
 *   tavern   畫布（一般卡與沙箱卡的宿主）用的酒館／MMD 相容層（applyTavernRules）。
 *   display  沙箱殼自己渲染時用的顯示引擎（applyDisplayRules），巨集已由呼叫端展開。
 *
 * 選項只收可結構化複製的值（巨集、簡繁對照表）；pickRandom 這種函式傳不進 worker，
 * 兩邊都用引擎預設的 Math.random。
 */
import { applyTavernRules, type MacroContext, type TavernRule } from '@/pages/canvas/canvas-rule-engine-core'
import { applyDisplayRules } from '@/utils/display-rule-engine.js'

export type RuleEngineKind = 'tavern' | 'display'

export interface RuleJobOptions {
  macros?: MacroContext
  variants?: Record<string, string> | null
}

export interface RuleRollback {
  ruleId: string
  reason: string
}

export interface RuleResult {
  html: string
  rollbacks: RuleRollback[]
}

export function executeRuleJob(
  engine: RuleEngineKind,
  text: string,
  rules: TavernRule[],
  options: RuleJobOptions = {},
): RuleResult {
  if (engine === 'display') {
    const out = applyDisplayRules(text, rules, { variants: options.variants || null }) as RuleResult
    return { html: out.html, rollbacks: out.rollbacks }
  }
  const out = applyTavernRules(text, rules, { macros: options.macros || {}, variants: options.variants || null })
  return { html: out.html, rollbacks: out.rollbacks }
}
