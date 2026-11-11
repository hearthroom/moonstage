import { describe, expect, it } from 'vitest'
import { applyStylePolicy, applyStylePolicyToHtml, stylePolicyFor } from '../author-style-policy'
import { compileRuleCssDialects } from '../rule-css-dialect'
import { translateFengyueCss } from '../fengyue-css'
import { installCard } from '@/sandbox/rules'

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

  it.each([
    '<script>const css = "<style>#ai-chat-input{color:red}</style>";</script>',
    '<textarea><style>#ai-chat-input{color:red}</style></textarea>',
    '<!-- <style>#ai-chat-input{color:red}</style> -->',
  ])('不改raw text／註解裡的偽style位元組，外面真style仍映射：%s', (raw) => {
    const html = raw + '<style>#ai-chat-input{color:blue}</style>'
    const out = applyStylePolicyToHtml(html, stylePolicyFor('mmd'))
    expect(out.startsWith(raw)).toBe(true)
    expect(out.slice(raw.length)).not.toContain('#ai-chat-input')
    expect(out.slice(raw.length)).toContain(':where(.composer-field)')
  })

  it('sandbox維持既有字串抽取與script code，只阻止假CSS新增自動映射', () => {
    const code = 'const css = "<style>#ai-chat-input{color:red}</style>";'
    const card = installCard([{ find: 'x', replace: `<script>${code}</script><style>#ai-chat-input{color:blue}</style>` }], stylePolicyFor('mmd'))
    expect(card.styles).toHaveLength(2)
    expect(card.styles[0]).toBe('#ai-chat-input{color:red}')
    expect(card.styles[1]).toContain('color:blue')
    expect(card.scripts[0]).toMatchObject({ code: 'const css = "";' })
  })

  it.each(['<textarea><style>#ai-chat-input{color:red}</style></textarea>', '<!--<style>#ai-chat-input{color:red}</style>-->'])('sandbox維持舊抽取位元組而不映射raw text／註解偽style：%s', (raw) => {
    const card = installCard([{ find: 'x', replace: raw + '<style>#ai-chat-input{color:blue}</style>' }], stylePolicyFor('mmd'))
    expect(card.styles).toHaveLength(2)
    expect(card.styles[0]).toBe('#ai-chat-input{color:red}')
    expect(card.styles[1]).toContain('color:blue')
    expect(card.rules[0].replace).toBe(raw.replace('<style>#ai-chat-input{color:red}</style>', ''))
  })

  it('raw text裡的酒館前綴位元組維持舊結果，不新增風月映射', () => {
    const raw = '<script>const css="<style>#ai-chat-input{color:red}</style>";</script>'
    const out = applyStylePolicyToHtml(raw + '<style>#ai-chat-input{color:blue}</style>', stylePolicyFor('tavern'))
    expect(out.startsWith(raw.replace('<style>#ai-chat-input', '<style>.mes_text #ai-chat-input'))).toBe(true)
    expect(out).toContain(':where(.composer-field)')
  })

  it('只有大寫native STYLE時維持酒館舊早退位元組，真正風月掛點仍能新auto', () => {
    const native = '<STYLE data-x="1">.native{color:red}</STYLE>'
    expect(applyStylePolicyToHtml(native, stylePolicyFor('tavern'))).toBe(native)
    expect(applyStylePolicyToHtml(native, stylePolicyFor('mmd'))).toBe(native)
    const mapped = applyStylePolicyToHtml('<STYLE>#ai-chat-input{color:red}</STYLE>', stylePolicyFor('tavern'))
    expect(mapped).toContain(':where(.composer-field)')
    expect(mapped).not.toContain('#ai-chat-input')
  })
})
