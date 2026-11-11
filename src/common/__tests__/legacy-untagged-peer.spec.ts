import { expect, it } from 'vitest'
import { resolveCardCssAsset } from '../card-css'
import { compileRuleCssDialects } from '../rule-css-dialect'
import { stylePolicyFor } from '../author-style-policy'
import { installCard } from '@/sandbox/rules'

// STYLE-03 真 QA 合成反例：carrier 原本有 legacy 風月轉譯，後面的無提示規則原本不命中本站 DOM。
it('舊 fixed carrier 規則集中的無提示 peer 保持舊原生政策，不啟用原本 inert 的風月選擇器', () => {
  const rules = [
    { id: 'hearthroom-fengyue-inner-css', name: 'legacy', find: '/([\\s\\S])$/', replace: '$1<style>#ai-chat-input{background:#bde8f2}</style>', enabled: true },
    { id: 'untagged-fengyue-control', name: 'peer', find: '/([\\s\\S])$/', replace: '$1<style>#ai-chat-input{background:#ff6600}</style>', enabled: true },
  ]
  const asset = resolveCardCssAsset({ cardFormat: 'fengyue', rules })
  expect(asset).not.toHaveProperty('cardCss')
  expect(asset.rules).toEqual(rules)
  const installed = installCard(compileRuleCssDialects(asset.rules), stylePolicyFor('fengyue'))
  expect(installed.styles[0]).toContain(':where(.composer-field)')
  expect(installed.styles[1]).toBe('#ai-chat-input{background:#ff6600}')
})
