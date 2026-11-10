/**
 * 每條規則自己的 CSS 寫法：不按卡片格式開關，一張卡可以同時有風月寫法與 MMD／本站寫法的規則。
 */
import { describe, it, expect } from 'vitest'
import { compileRuleCssDialects, ruleCssDialect, LEGACY_FENGYUE_CSS_RULE_ID } from '../rule-css-dialect'
import { applyStylePolicyToHtml, stylePolicyFor } from '../author-style-policy'
import { installCard } from '../../sandbox/rules'

const rule = (over: Record<string, unknown>) => ({ id: 'r', name: 'r', find: '/([\\s\\S])$/', replace: '', enabled: true, ...over })

describe('寫法怎麼決定', () => {
  it('規則自己標的優先；沒標照卡片格式（回傳 null）', () => {
    expect(ruleCssDialect(rule({ cssDialect: 'fengyue' }))).toBe('fengyue')
    expect(ruleCssDialect(rule({ cssDialect: 'TAVERN' }))).toBe('tavern')
    expect(ruleCssDialect(rule({ cssDialect: 'nonsense' }))).toBeNull()
    expect(ruleCssDialect(rule({}))).toBeNull()
  })

  it('這個欄位出現前匯入的風月內置 CSS（固定 id、沒標）當風月寫法；標了別的就照標的', () => {
    expect(ruleCssDialect(rule({ id: LEGACY_FENGYUE_CSS_RULE_ID }))).toBe('fengyue')
    expect(ruleCssDialect(rule({ id: LEGACY_FENGYUE_CSS_RULE_ID, cssDialect: 'mmd' }))).toBe('mmd')
  })
})

describe('進畫布前轉好', () => {
  it('風月寫法：轉到我們的節點、包進層並標記；沒標的規則原封不動（同一個物件）', () => {
    const plain = rule({ id: 'mine', replace: '$1<style>.mes_text{color:red}</style>' })
    const fy = rule({ id: 'fy', cssDialect: 'fengyue', replace: '$1<style>#customized-answer-content{color:#2C4A6B}</style>' })
    const [a, b] = compileRuleCssDialects([plain, fy])
    expect(a).toBe(plain)
    expect(b.replace).toMatch(/^\$1<style data-lt-css="fengyue">@layer lt-author-fengyue \{/)
    expect(b.replace).toContain('.mes[data-lt-role="ai"] .mes_text')
    expect(fy.replace).toContain('#customized-answer-content') // 原文不動
  })

  it('程式碼圍欄裡的 <style> 是字面文字，不轉', () => {
    const fenced = rule({ cssDialect: 'fengyue', replace: '```html\n<style>#ai-chat-input{color:red}</style>\n```' })
    expect(compileRuleCssDialects([fenced])[0]).toBe(fenced)
  })

  it('酒館寫法的規則放在 MMD 卡上：照酒館接訊息層前綴', () => {
    const [r] = compileRuleCssDialects([rule({ cssDialect: 'tavern', replace: '<style>p{color:red}</style>' })])
    expect(r.replace).toContain('.mes_text p{color:red}')
  })
})

describe('卡片格式那一層看到標記就不再處理', () => {
  it('一般頁：酒館卡上的 MMD 寫法規則不被加訊息層前綴', () => {
    const [r] = compileRuleCssDialects([rule({ cssDialect: 'mmd', replace: '<style>body{background:#000}</style>' })])
    const html = applyStylePolicyToHtml(r.replace, stylePolicyFor('tavern'))
    expect(html).toContain('<style data-lt-css="mmd">body{background:#000}</style>')
  })

  it('沙箱殼：installCard 收下轉好的樣式，不再套卡片格式；沒標的照舊', () => {
    const rules = compileRuleCssDialects([
      rule({ id: 'fy', cssDialect: 'fengyue', replace: '$1<style>#ai-chat-input{background:#fff}</style>' }),
      rule({ id: 'plain', replace: '$1<style>p{color:red}</style>' }),
    ])
    const card = installCard(rules as any, stylePolicyFor('tavern'))
    expect(card.styles[0]).toContain('@layer lt-author-fengyue')
    expect(card.styles[0]).not.toContain('.mes_text :where') // 沒被酒館前綴再包一次
    expect(card.styles[1]).toBe('.mes_text p{color:red}')
  })
})
