import { describe, expect, it } from 'vitest'
import { applyStylePolicy, applyStylePolicyToHtml, stylePolicyFor } from '../author-style-policy'
import { compileCardCss } from '../card-css'
import { compileRuleCssDialects } from '../rule-css-dialect'
import { translateFengyueCss } from '../fengyue-css'
import { installCard } from '@/sandbox/rules'

describe('只在新 cardCss 自動相容；顯示規則保留原政策', () => {
  it('新 cardCss 混合段逐 selector 映射，本站 .mes 不被猜成酒館', () => {
    const out = compileCardCss({ cardCss: '#ai-send-button,.mes{width:99px;color:red}' })
    expect(out).toContain(':where(.lt-send)')
    expect(out).toContain('.mes{width:99px;color:red}')
    expect(out).not.toContain('.mes_text .mes')
    expect(out).not.toContain('#ai-send-button')
    expect(out.match(/width:99px/g)).toHaveLength(1)
  })

  it('新 cardCss 巢狀條件可映射；字串、註解與未知 id 原樣', () => {
    const css = '/* #ai-chat-input */ @media(min-width:1px){#ai-chat-input{color:red}.mes{width:2px}}'
    expect(compileCardCss({ cardCss: css })).toContain(':where(.composer-field)')
    for (const native of ['.mes{color:red}', '#ai-card{color:red}', '.x{content:"#ai-chat-input"}', 'a[href="#ai-chat-input"]{color:red}']) {
      expect(compileCardCss({ cardCss: native })).toContain(native)
    }
  })

  it.each(['mmd', 'fengyue', 'tavern'])('無提示顯示規則只依既有卡片格式：%s', (format) => {
    const css = '#ai-chat-input{color:red} .mes{color:blue}'
    const expected = format === 'tavern' ? '.mes_text #ai-chat-input{color:red} .mes_text .mes{color:blue}' : css
    expect(applyStylePolicy(css, stylePolicyFor(format))).toBe(expected)
    expect(installCard([{ replace: `<style>${css}</style>` }], stylePolicyFor(format)).styles).toEqual([expected])
    expect(applyStylePolicyToHtml(`<style>${css}</style>`, stylePolicyFor(format))).toBe(`<style>${expected}</style>`)
  })

  it('舊 cssDialect 與已存標記優先，卡片格式不再處理', () => {
    const css = 'body{background:red} #ai-chat-input{color:blue} .mes{width:2px !important}'
    for (const dialect of ['mmd', 'tavern', 'fengyue']) {
      const [rule] = compileRuleCssDialects([{ cssDialect: dialect, replace: `<style>${css}</style>` }])
      const expected = dialect === 'mmd' ? css : dialect === 'fengyue' ? translateFengyueCss(css) : '.mes_text body{background:red} .mes_text #ai-chat-input{color:blue} .mes_text .mes{width:2px !important}'
      expect(applyStylePolicyToHtml(rule.replace, stylePolicyFor('tavern'))).toContain(`>${expected}</style>`)
      expect(installCard([rule], stylePolicyFor('tavern')).styles).toEqual([expected])
      expect(compileCardCss({ cardCss: css, cardCssDialect: dialect })).toBe(expected)
    }
    const marked = '<style data-lt-css="auto">#ai-chat-input{color:red}</style>'
    expect(applyStylePolicyToHtml(marked, stylePolicyFor('tavern'))).toBe(marked)
    expect(installCard([{ replace: marked }], stylePolicyFor('tavern')).styles).toEqual(['#ai-chat-input{color:red}'])
  })

  it.each([
    '<script>const css = "<style>#ai-chat-input{color:red}</style>";</script>',
    '<textarea><style>#ai-chat-input{color:red}</style></textarea>',
    '<!-- <style>#ai-chat-input{color:red}</style> -->',
  ])('保留既有 rawtext 與註解處理：%s', (raw) => {
    const html = raw + '<style>#ai-chat-input{color:blue}</style>'
    expect(applyStylePolicyToHtml(html, stylePolicyFor('mmd'))).toBe(html)
    const tavern = html.replace(/<style>#ai-chat-input/g, '<style>.mes_text #ai-chat-input')
    expect(applyStylePolicyToHtml(html, stylePolicyFor('tavern'))).toBe(tavern)
    const card = installCard([{ replace: html }], stylePolicyFor('mmd'))
    expect(card.styles).toEqual(['#ai-chat-input{color:red}', '#ai-chat-input{color:blue}'])
    expect(card.rules[0].replace).toBe(raw.startsWith('<script>') ? '' : raw.replace('<style>#ai-chat-input{color:red}</style>', ''))
    if (raw.startsWith('<script>')) expect(card.scripts[0]).toMatchObject({ code: 'const css = "";' })
  })

  it('保留酒館僅大寫 STYLE 時的舊早退與混用字面 selector', () => {
    for (const css of ['.native{color:red}', '#ai-chat-input{color:red}', '.native{color:red} #ai-chat-input{color:blue}']) {
      const html = `<STYLE data-x="1">${css}</STYLE>`
      expect(applyStylePolicyToHtml(html, stylePolicyFor('tavern'))).toBe(html)
      expect(applyStylePolicyToHtml(html, stylePolicyFor('mmd'))).toBe(html)
    }
  })
})
