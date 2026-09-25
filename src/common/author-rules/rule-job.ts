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
 * {{random:…}}：沒給種子時兩邊都用引擎預設的 Math.random，每套一次重抽一次。給了種子（呼叫端
 * 傳訊息的 id）就在交給引擎之前按種子先挑好——串流時每個 chunk 都重套規則，用 Math.random 就是
 * 每一跳換一張圖（2026-09-25 回報：隨機一百張圖的卡，輸出中圖片一直狂跳）。挑法只看種子、規則位置、
 * 第幾個 random 與選項本身，不看訊息內容：同一則訊息不管長到哪、畫布把它切成幾段各自套，挑到的都一樣。
 * 代價是同一條規則在一則訊息裡命中多次時，每處拿到同一個結果。
 * 引擎檔兩端逐位元組相同，不動它；這裡先展開，引擎看到的就是沒有 random 的替換內容。
 */
import { applyTavernRules, type MacroContext, type TavernRule } from '@/pages/canvas/canvas-rule-engine-core'
import { applyDisplayRules } from '@/utils/display-rule-engine.js'

export type RuleEngineKind = 'tavern' | 'display'

export interface RuleJobOptions {
  macros?: MacroContext
  variants?: Record<string, string> | null
  /** 同一則訊息固定的字串（訊息 id）：有就讓 {{random}} 在這則訊息裡穩定。 */
  seed?: string
}

export interface RuleRollback {
  ruleId: string
  reason: string
}

export interface RuleResult {
  html: string
  rollbacks: RuleRollback[]
}

// 跟引擎的 RANDOM_TOKEN 與選項切法一致（display-rule-engine.js expandRandom）。
const RANDOM_TOKEN = /\{\{random:([^}]*)\}\}/g

/** cyrb53 的 32 位元版：夠散就好，不是安全用途。 */
function hash32(text: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  return h1 >>> 0
}

function seedRandomTokens(rules: TavernRule[], seed: string): TavernRule[] {
  return rules.map((rule, ruleIndex) => {
    const replace = rule && typeof rule.replace === 'string' ? rule.replace : null
    if (!replace || replace.indexOf('{{random:') < 0) return rule
    let token = 0
    const seeded = replace.replace(RANDOM_TOKEN, (_whole, body: string) => {
      const choices = String(body).split('::').map((c) => c.trim()).filter((c) => c !== '')
      const at = token++
      if (!choices.length) return ''
      return choices[hash32(`${seed}\u0001${ruleIndex}\u0001${at}\u0001${body}`) % choices.length]
    })
    return { ...rule, replace: seeded }
  })
}

export function executeRuleJob(
  engine: RuleEngineKind,
  text: string,
  rules: TavernRule[],
  options: RuleJobOptions = {},
): RuleResult {
  if (options.seed && Array.isArray(rules)) rules = seedRandomTokens(rules, options.seed)
  if (engine === 'display') {
    const out = applyDisplayRules(text, rules, { variants: options.variants || null }) as RuleResult
    return { html: out.html, rollbacks: out.rollbacks }
  }
  const out = applyTavernRules(text, rules, { macros: options.macros || {}, variants: options.variants || null })
  return { html: out.html, rollbacks: out.rollbacks }
}
