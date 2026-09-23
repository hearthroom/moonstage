/**
 * 酒館／MMD 規則引擎的對外入口（站台以 `stage-canvas/rule-engine` 匯入這一支）。
 *
 * 同步 API（行為不變，實作在 canvas-rule-engine-core.ts）：
 *   applyTavernRules(text, rules, { macros?, variants?, pickRandom? }) → { html, rollbacks }
 *   以及 substituteMacros、rewriteNamedGroups、normalizeRules、resolvePlayerName、isPlayerNamePlaceholder。
 *   同步版在呼叫端的執行緒上跑：作者的正則若有災難性回溯，會卡住那條執行緒直到跑完。
 *
 * 非同步 API：
 *   applyTavernRulesAsync(text, rules, { macros?, variants? }) → Promise<{ html, rollbacks }>
 *   規則在專用 Web Worker 裡跑到完（沒有逾時、不跳過任何規則），結果跟同步版逐字相同；
 *   依（規則內容、巨集、簡繁表、全文）記在記憶體 LRU。沒有 Worker 的環境（測試、SSR）或 worker
 *   載入被擋（CSP）時退回同步套用。pickRandom 傳不進 worker，{{random}} 用預設的 Math.random。
 *
 * 串流顯示（先顯示原文、規則結果到了再換上）用 @/common/author-rules 的 getAuthorRuleRunner().display()。
 */
export * from './canvas-rule-engine-core'
export { applyTavernRulesAsync } from '@/common/author-rules'
