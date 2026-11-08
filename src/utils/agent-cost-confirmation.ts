import { getAuthorRuleStorageScope, onStorageScopeChange } from '@/common/author-rules/storage-scope'
import { useStageHost } from '@/host/stage-host'

// One opaque account scope, no player identifiers or content in keys or receipts.
const STORAGE_KEY = 'moonstageAgentCostConfirmations'
const MAX_AGE = 30 * 86400000
interface Receipt { selectionKey: string; highCredits: number; ruleVersion: string; acceptedAt: number }
interface Estimate { presentation: string; selectionKey: string; highCredits: number | null; ruleVersion: string }
let memory: Receipt[] = []
let scope = getAuthorRuleStorageScope()
function read(): Receipt[] {
  const current = getAuthorRuleStorageScope()
  if (!current) return memory
  try {
    const value = JSON.parse(useStageHost().storage.get(STORAGE_KEY) || 'null')
    const receipts = value == null ? memory : value.scope === current && Array.isArray(value.receipts) ? value.receipts : []
    return receipts.filter((r: any) => r && typeof r.selectionKey === 'string' && typeof r.ruleVersion === 'string'
      && Number.isSafeInteger(r.highCredits) && r.highCredits > 0 && Number.isSafeInteger(r.acceptedAt) && r.acceptedAt >= 0)
  } catch { return memory }
}
export function clearAgentCostConfirmations(): void {
  memory = []
  try { useStageHost().storage.remove(STORAGE_KEY) } catch { /* storage is optional */ }
}
onStorageScopeChange(event => {
  const next = event.type === 'scope' ? event.scope : null
  if (next !== scope || event.type === 'clear') clearAgentCostConfirmations()
  scope = next
})
export function needsAgentCostConfirmation(estimate: Estimate, now = Date.now()): boolean {
  if (estimate.presentation !== 'confirm') return false
  if (!getAuthorRuleStorageScope()) return true
  if (!estimate.selectionKey || estimate.highCredits == null) return true
  return !read().some(r => r.selectionKey === estimate.selectionKey && r.ruleVersion === estimate.ruleVersion
    && Number.isFinite(r.acceptedAt) && r.acceptedAt <= now && now - r.acceptedAt < MAX_AGE
    && Number.isFinite(r.highCredits) && r.highCredits > 0 && estimate.highCredits! < r.highCredits * 1.25)
}
export function rememberAgentCostConfirmation(estimate: Estimate, now = Date.now()): void {
  if (estimate.presentation !== 'confirm' || !estimate.selectionKey || estimate.highCredits == null || estimate.highCredits <= 0) return
  memory = read().filter(r => now - r.acceptedAt < MAX_AGE && r.selectionKey !== estimate.selectionKey).slice(-99)
  memory.push({ selectionKey: estimate.selectionKey, highCredits: estimate.highCredits, ruleVersion: estimate.ruleVersion, acceptedAt: now })
  const current = getAuthorRuleStorageScope()
  if (current) {
    try { useStageHost().storage.set(STORAGE_KEY, JSON.stringify({ scope: current, receipts: memory })) } catch { /* memory receipt remains */ }
  }
}
