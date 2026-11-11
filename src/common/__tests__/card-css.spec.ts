import { afterEach, describe, expect, it } from 'vitest'
import { compileCardCss, createCardCssMount, resolveCardCssAsset } from '../card-css'
import { translateFengyueCss } from '../fengyue-css'

const legacy = { id: 'hearthroom-fengyue-inner-css', find: '/([\\s\\S])$/', replace: '$1<style>#ai-chat-input{color:red}</style>', enabled: true }
afterEach(() => document.head.querySelectorAll('[data-lt="card-css"]').forEach(node => node.remove()))

describe('獨立卡片樣式', () => {
  it('新 CSS 在獨立層內，原文字串不變，important 不得反過來壓過顯示規則', () => {
    const source = '.mes{color:red !important}'
    const out = compileCardCss({ cardCss: source })
    expect(out).toContain('@layer lt-base, lt-card-css, lt-author-fengyue;')
    expect(out).toContain('@layer lt-card-css')
    expect(out).not.toContain('!important')
    expect(source).toContain('!important')
  })

  it('隱藏舊提示維持既有轉譯結果', () => {
    const css = '#ai-chat-input{color:red}'
    expect(compileCardCss({ cardCss: css, cardCssDialect: 'fengyue' })).toBe(translateFengyueCss(css))
    expect(compileCardCss({ cardCss: css, cardCssDialect: 'mmd' })).toBe(css)
  })

  it('受管外觀變數在舊風月提示下仍命中根，其他舊CSS維持原轉譯', () => {
    const css = '#ai-chat-input{color:red}'
    const appearance = '/* lt-card-appearance:start */\n.canvas-root { --lt-canvas-bubble-ai-bg: green; --lt-canvas-accent: blue; }\n/* lt-card-appearance:end */'
    const out = compileCardCss({ cardCss: css + appearance, cardCssDialect: 'fengyue' })
    expect(out).toContain(translateFengyueCss(css))
    expect(out).toContain('@layer lt-card-css')
    expect(out).toContain('.canvas-root { --lt-canvas-bubble-ai-bg: green; --lt-canvas-accent: blue; }')
    expect(out).not.toContain('.canvas-root):not(#lt-fy) .canvas-root')
    expect(out).not.toContain('!important')
  })

  it('字串中的 import/important 不變；真正的外部樣式也在卡片層', () => {
    const out = compileCardCss({ cardCss: '@import url("https://fonts.example/a.css") screen; .x{content:"@import x; !important";color:red!important}' })
    expect(out).toContain('@import url("https://fonts.example/a.css") layer(lt-card-css) screen;')
    expect(out).toContain('content:"@import x; !important"')
    expect(out).not.toContain('color:red!important')
  })

  it('只有欄位不存在才搬標準舊假規則；停用、重複與非標準內容不搬', () => {
    const out = resolveCardCssAsset({ rules: [legacy] })
    expect(out.cardCss).toBe('#ai-chat-input{color:red}')
    expect(out.cardCssDialect).toBe('fengyue')
    expect(out.rules).toEqual([])
    expect(resolveCardCssAsset({ cardCss: '', rules: [legacy] }).cardCss).toBe('')
    for (const rules of [[{ ...legacy, enabled: false }], [legacy, legacy], [{ ...legacy, replace: '$1<style>x{}</style><script>x()</script>' }]]) {
      expect(resolveCardCssAsset({ rules }).rules).toEqual(rules)
      expect(resolveCardCssAsset({ rules }).cardCss).toBe('')
    }
  })

  it('同頁更新只留一個 style，清除與離場移除，不依賴訊息數', () => {
    const mount = createCardCssMount(document)
    mount.set('.mes{color:red}')
    const first = document.head.querySelector('[data-lt="card-css"]')
    mount.set('.mes{color:blue}')
    expect(document.head.querySelectorAll('[data-lt="card-css"]')).toHaveLength(1)
    expect(first?.textContent).toContain('color:blue')
    mount.set('')
    expect(document.head.querySelector('[data-lt="card-css"]')).toBeNull()
    mount.set('.mes{color:red}')
    mount.dispose()
    expect(document.head.querySelector('[data-lt="card-css"]')).toBeNull()
  })
})
