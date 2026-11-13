import { describe, expect, it } from 'vitest'
import { compileCardCss, resolveCardCssAsset } from '../card-css'
import { compileDialectCss, normalizeCssDialect } from '../rule-css-dialect'
import postcss from 'postcss'

function ruleMatches(css: string, property: string, element: Element): boolean {
  let matched = false
  postcss.parse(css).walkRules(rule => {
    if (rule.nodes.some(node => node.type === 'decl' && node.prop === property) && element.matches(rule.selector)) matched = true
  })
  return matched
}

describe('new Fengyue imports retain their source platform base', () => {
  const css = '\r\n#customized-answer-content { padding:18px 14px; line-height:1.85; border-top-width:3px; border-style:solid }\r\n'

  it('keeps the version on explicit card CSS, never upgrading a legacy carrier or rule dialect', () => {
    expect(resolveCardCssAsset({ cardCss: css, cardCssDialect: 'fengyue-v2' }).cardCssDialect).toBe('fengyue-v2')
    expect(normalizeCssDialect('fengyue-v2')).toBeNull()
    expect(resolveCardCssAsset({ rules: [{ id: 'hearthroom-fengyue-inner-css', find: '/([\\s\\S])$/', replace: `$1<style>${css}</style>`, enabled: true }] }).cardCssDialect).toBe('fengyue')
    for (const dialect of ['fengyue', 'mmd', 'tavern'] as const) {
      expect(compileCardCss({ cardCss: css, cardCssDialect: dialect })).toBe(compileDialectCss(css, dialect))
    }
  })

  it('provides source light/dark defaults below author CSS and preserves the separate markdown line height', () => {
    const out = compileCardCss({ cardCss: css, cardCssDialect: 'fengyue-v2' })
    expect(out).toContain('@layer lt-base, lt-fengyue-base, lt-card-css, lt-author-fengyue;')
    expect(out).toContain('hsl(240 6% 97%)')
    expect(out).toContain('hsl(210 2% 20%)')
    expect(out).toContain('hsl(0 0% 99%)')
    expect(out).toContain('hsl(210 2% 16%)')
    expect(out).toContain('font-size:14px')
    expect(out).toContain('line-height:1.5')
    expect(out).toContain('line-height:1.85')
    expect(out.indexOf('@layer lt-fengyue-base {')).toBeLessThan(out.indexOf('@layer lt-author-fengyue {'))
    expect(compileCardCss({ cardCss: css })).not.toContain('lt-fengyue-base')
    expect(compileCardCss({ cardCss: '', cardCssDialect: 'fengyue-v2' })).toBe('')
  })

  it('uses source defaults rather than the old inferred readable color for an authored background', () => {
    const source = '#customized-answer-content{background:#fff}'
    expect(compileCardCss({ cardCss: source, cardCssDialect: 'fengyue' })).toContain('color:#1f2328')
    expect(compileCardCss({ cardCss: source, cardCssDialect: 'fengyue-v2' })).not.toContain('color:#1f2328')
  })

  it('keeps imported styles and high-specificity card rules below explicit display-rule styles', () => {
    const out = compileCardCss({ cardCss: '@import url("https://styles.example/theme.css") layer(theme) screen; #installedBuiltInCss #customized-answer #customized-answer-content{background:red}', cardCssDialect: 'fengyue-v2' })
    expect(out).toContain('@import url("https://styles.example/theme.css") layer(lt-card-css.theme) screen;')
    expect(out).toMatch(/@layer lt-card-css \{\s*@layer lt-author-fengyue \{/)
  })

  it('lets the explicit native root and Fengyue ids in one stylesheet reach their own nodes', () => {
    const root = document.createElement('div')
    root.className = 'canvas-root'
    root.innerHTML = '<div class="mes" data-lt-role="ai"><div class="mes_text"></div></div><div class="composer-field"></div><span id="ai-native-widget"></span>'
    const source = '.canvas-root { outline:4px solid #834 } #customized-answer-content { border-left:3px solid #137 } .canvas-root #ai-chat-input { border-bottom:2px solid #369 } .canvas-root #ai-native-widget { border-right:2px solid #965 }'
    const out = compileCardCss({ cardCss: source, cardCssDialect: 'fengyue-v2' })
    expect(ruleMatches(out, 'border-left', root.querySelector('.mes_text')!)).toBe(true)
    expect(ruleMatches(out, 'outline', root), 'native root must not need a second ancestor root').toBe(true)
    expect(ruleMatches(out, 'border-bottom', root.querySelector('.composer-field')!)).toBe(true)
    expect(ruleMatches(out, 'border-right', root.querySelector('#ai-native-widget')!)).toBe(true)
  })

  it('keeps native dark-root and comma-list branches while legacy hints retain their old scope', () => {
    const root = document.createElement('div')
    root.className = 'canvas-root'
    root.dataset.ltTheme = 'dark'
    const source = '.canvas-root, #customized-answer-content { outline:4px solid #834 } .dark .canvas-root { outline-offset:2px }'
    const out = compileCardCss({ cardCss: source, cardCssDialect: 'fengyue-v2' })
    expect(ruleMatches(out, 'outline', root)).toBe(true)
    expect(ruleMatches(out, 'outline-offset', root)).toBe(true)
    for (const dialect of ['fengyue', 'mmd', 'tavern'] as const) {
      expect(compileCardCss({ cardCss: source, cardCssDialect: dialect })).toBe(compileDialectCss(source, dialect))
    }
  })

  it('does not treat lookalike class names or quoted attributes as an explicit native root', () => {
    for (const suffix of ['ish', '-extra', '\u6839']) {
      const outside = document.createElement('div')
      outside.className = `canvas-root${suffix}`
      const out = compileCardCss({ cardCss: `.canvas-root${suffix}{outline:4px solid #834}`, cardCssDialect: 'fengyue-v2' })
      expect(ruleMatches(out, 'outline', outside)).toBe(false)
    }
    const outside = document.createElement('div')
    outside.dataset.selector = '.canvas-root'
    const out = compileCardCss({ cardCss: '[data-selector=".canvas-root"]{outline:4px solid #834}', cardCssDialect: 'fengyue-v2' })
    expect(ruleMatches(out, 'outline', outside)).toBe(false)
  })
})
