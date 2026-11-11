import { describe, expect, it } from 'vitest'
import { applyStylePolicy, applyStylePolicyToHtml, stylePolicyFor } from '../author-style-policy'
import { compileRuleCssDialects } from '../rule-css-dialect'
import { translateFengyueCss } from '../fengyue-css'

describe('未標來源的作者 CSS 逐選擇器相容', () => {
  it('同一段的風月掛點會轉譯，本站 .mes 保留原本的版面與 important', () => {
    const css = '#ai-send-button,.mes{width:99px;color:red !important}'
    const out = applyStylePolicy(css, stylePolicyFor('mmd'))
    expect(out).toContain(':where(.lt-send)')
    expect(out).toContain('.mes{width:99px;color:red !important}')
    expect(out).not.toContain('.mes_text .mes')
    expect(out).not.toContain('#ai-send-button')
    expect(out.match(/width:99px/g)).toHaveLength(1)
  })

  it('酒館只替原生選擇器套既有訊息範圍；風月輸入框不被縮進氣泡', () => {
    const out = applyStylePolicy('#ai-chat-input{color:red} .letter{color:blue}', stylePolicyFor('tavern'))
    expect(out).toContain(':where(.composer-field)')
    expect(out).toContain('.mes_text .letter{color:blue}')
    expect(out).not.toContain('.mes_text :where')
  })

  it('巢狀條件與訊息 HTML 共用相容層；字串、註解與未知 ai-* 不算掛點', () => {
    const css = '/* #ai-chat-input */ @media(min-width:1px){#ai-chat-input{color:red}.mes{width:2px}}'
    expect(applyStylePolicyToHtml(`<style>${css}</style>`, stylePolicyFor('mmd'))).toContain(':where(.composer-field)')
    for (const native of ['.mes{color:red}', '#ai-card{color:red}', '.x{content:"#ai-chat-input"}', 'a[href="#ai-chat-input"]{color:red}']) {
      expect(applyStylePolicy(native, stylePolicyFor('mmd'))).toBe(native)
    }
  })

  it('舊 cssDialect 明確提示優先，三種寫法結果保持原樣', () => {
    const css = 'body{background:red} #ai-chat-input{color:blue} .mes{width:2px !important}'
    for (const dialect of ['mmd', 'tavern', 'fengyue']) {
      const [rule] = compileRuleCssDialects([{ cssDialect: dialect, replace: `<style>${css}</style>` }])
      const rendered = applyStylePolicyToHtml(rule.replace, stylePolicyFor('tavern'))
      const expected = dialect === 'mmd' ? css : dialect === 'fengyue' ? translateFengyueCss(css) : '.mes_text body{background:red} .mes_text #ai-chat-input{color:blue} .mes_text .mes{width:2px !important}'
      expect(rendered).toContain(`>${expected}</style>`)
    }
  })
})
