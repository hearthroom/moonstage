import { afterEach, describe, expect, it } from 'vitest'
import { rememberAgentCostConfirmation, needsAgentCostConfirmation, clearAgentCostConfirmations } from './agent-cost-confirmation'
import { updateStorageScope } from '@/common/author-rules/storage-scope'
const estimate = (overrides: any = {}) => ({ status: 'observed', presentation: 'confirm', selectionKey: 'stable-choice', highCredits: 1000, ruleVersion: 'v1', ...overrides })
afterEach(() => { clearAgentCostConfirmations(); updateStorageScope(null) })
describe('cost confirmation receipts', () => {
  it('deduplicates the same selection for30 days;25% higher costs and new rules require confirmation', () => {
    updateStorageScope('opaque_account_scope_123456')
    rememberAgentCostConfirmation(estimate(), 100)
    expect(needsAgentCostConfirmation(estimate({ highCredits: 1249 }), 101)).toBe(false)
    expect(needsAgentCostConfirmation(estimate({ highCredits: 1250 }), 101)).toBe(true)
    expect(needsAgentCostConfirmation(estimate({ ruleVersion: 'v2' }), 101)).toBe(true)
    expect(needsAgentCostConfirmation(estimate({ selectionKey: 'other-lane' }), 101)).toBe(true)
    expect(needsAgentCostConfirmation(estimate(), 100 + 30 * 86400000)).toBe(true)
  })
  it('clears receipts when accounts change or log out', () => {
    updateStorageScope('opaque_account_scope_123456')
    rememberAgentCostConfirmation(estimate())
    expect(needsAgentCostConfirmation(estimate())).toBe(false)
    updateStorageScope('different_opaque_scope_123456')
    expect(needsAgentCostConfirmation(estimate())).toBe(true)
    updateStorageScope(null)
    expect(needsAgentCostConfirmation(estimate())).toBe(true)
  })
})
