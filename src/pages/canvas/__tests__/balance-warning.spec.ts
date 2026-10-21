import { expect, it } from 'vitest'
import { balanceWarning } from '../canvas-model-catalog'
const variant = {billingType:'dynamic',estMinScore:30,estMaxScore:170}
it('warns below the current upper estimate and clears when model, balance or quote changes', () => {
 const t = (key: string, p: any) => key + ':' + p.have
 expect(balanceWarning(variant,{},100,t)).toBe('chat.balanceBelowEstimate:100')
 expect(balanceWarning(variant,{},170,t)).toBe('')
 expect(balanceWarning(variant,{},null,t)).toBe('')
 expect(balanceWarning({...variant,estMaxScore:90},{},100,t)).toBe('')
 expect(balanceWarning({costScore:200},{},100,t)).toBe('')
})
