import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import en from '@/locale/en.json'
import zhHant from '@/locale/zh-Hant.json'
import zhHans from '@/locale/zh-Hans.json'
import ja from '@/locale/ja.json'
import ko from '@/locale/ko.json'
describe('Agent cost copy contract', () => {
  it('formats singular English typical credits without changing the high estimate', () => {
    const { t } = createI18n({ legacy: false, locale: 'en', messages: { en } }).global
    expect(t('modelSelect.agentCostConfirmObserved', { typical: '1', high: '1,000' }, 1)).toContain('1 credit per turn')
    expect(t('modelSelect.agentCostConfirmObserved', { typical: '2', high: '1,000' }, 2)).toContain('2 credits per turn')
    expect(t('modelSelect.agentCostInlineEstimated', { typical: '1', high: '1,000' }, 1)).toContain('1 credit per turn')
  })
  it('ships the same keys in all five locales and retires the old family-price advice', () => {
    const keys = Object.keys(en).filter(k => k.startsWith('modelSelect.agentCost'))
    for (const locale of [en, zhHant, zhHans, ja, ko]) {
      for (const key of keys) expect((locale as Record<string, string>)[key]).toBeTruthy()
      expect((locale as Record<string, string>)['modelSelect.deepPrepCostSuggest']).toBeUndefined()
    }
  })
})
