import { describe, expect, it } from 'vitest'
import { compileCardCss, resolveCardCssAsset } from '../card-css'
import { compileDialectCss, normalizeCssDialect } from '../rule-css-dialect'

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
})
