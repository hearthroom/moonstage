/**
 * 一次規則套用 = 一個純函式呼叫。主執行緒的同步後備與 Web Worker 跑的是同一支，
 * 所以兩邊的產物逐字相同——worker 只是換個地方跑，不是另一套實作。
 *
 * 兩種引擎：
 *   tavern   畫布（一般卡與沙箱卡的宿主）用的酒館／MMD 相容層（applyTavernRules）。
 *   display  沙箱殼自己渲染時用的顯示引擎（applyDisplayRules），巨集已由呼叫端展開。
 *
 * 選項只收可結構化複製的值（巨集、簡繁對照表、種子）；pickRandom 這種函式傳不進 worker。
 *
 * Seeded random choices are dealt per hit/token. The runner carries the conversation ledger between jobs;
 * worker and inline execution receive the same snapshot and return the updated ledger.
 */
import { applyTavernRules, type MacroContext, type TavernRule } from '@/pages/canvas/canvas-rule-engine-core'
import { applyDisplayRules } from '@/utils/display-rule-engine.js'
import { createRandomDeck, type RandomDrawState } from './random-deck'

export type RuleEngineKind = 'tavern' | 'display'

export interface RuleJobOptions {
  macros?: MacroContext
  variants?: Record<string, string> | null
  /** 同一則訊息固定的字串（訊息 id）：有就讓 {{random}} 在這則訊息裡穩定。 */
  seed?: string
  /** Provisional and durable identities for this same message. */
  seedAliases?: string[]
  /** Local conversation draw scope; omitted for isolated message jobs. */
  randomScope?: string
  randomState?: RandomDrawState
}

export interface RuleRollback {
  ruleId: string
  reason: string
}

export interface RuleResult {
  html: string
  rollbacks: RuleRollback[]
  randomState?: RandomDrawState
}

export function executeRuleJob(
  engine: RuleEngineKind,
  text: string,
  rules: TavernRule[],
  options: RuleJobOptions = {},
): RuleResult {
  const deck = options.seed ? createRandomDeck(options.randomScope || options.seed, options.seed, options.randomState, options.seedAliases) : null
  const randomState = deck && options.randomScope ? { randomState: deck.state } : {}
  if (engine === 'display') {
    const out = applyDisplayRules(text, rules, { variants: options.variants || null, pickRandom: deck?.pick }) as RuleResult
    return { html: out.html, rollbacks: out.rollbacks, ...randomState }
  }
  const out = applyTavernRules(text, rules, { macros: options.macros || {}, variants: options.variants || null, pickRandom: deck?.pick })
  return { html: out.html, rollbacks: out.rollbacks, ...randomState }
}
