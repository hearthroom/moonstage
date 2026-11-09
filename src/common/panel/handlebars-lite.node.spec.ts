// @vitest-environment node
// 沒有 DOM 時 sanitizePanelHtml 走字串清理；這份測試在 node 環境裡跑那條路。
import { describe, expect, it } from 'vitest'
import { renderPanel, sanitizePanelHtml } from './handlebars-lite'

describe('sanitizePanelHtml string fallback (no DOM)', () => {
  it('runs without a document', () => {
    expect(typeof document).toBe('undefined')
  })

  it('removes script elements with their content, including tricky content', () => {
    expect(sanitizePanelHtml('a<script>alert(1)</script>b')).toBe('ab')
    expect(sanitizePanelHtml('a<SCRIPT type="x">if (a<b) { s = "<a href=\'x" }</SCRIPT >b')).toBe('ab')
    expect(sanitizePanelHtml('a<script>never closed')).toBe('a')
    expect(sanitizePanelHtml('a<iframe src="x"><p>in</p></iframe>b<embed src="y">c')).toBe('abc')
  })

  it('removes on* attributes, also slash-separated and with quoted >', () => {
    expect(sanitizePanelHtml('<img/onerror=alert(1) src="a.png">')).toBe('<img src="a.png">')
    expect(sanitizePanelHtml('<div title="a > b" ONCLICK=\'x()\' class=k>t</div>')).toBe('<div title="a > b" class=k>t</div>')
    expect(sanitizePanelHtml('<br/>')).toBe('<br />')
  })

  it('removes javascript: URLs, including obfuscated ones', () => {
    expect(sanitizePanelHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizePanelHtml('<a href=" java\tscript:x">x</a>')).toBe('<a>x</a>')
    expect(sanitizePanelHtml('<a href="&#106;avascript&colon;x">x</a>')).toBe('<a>x</a>')
    expect(sanitizePanelHtml('<a href="https://ok.example/?a=1&amp;b=2">x</a>')).toBe('<a href="https://ok.example/?a=1&amp;b=2">x</a>')
  })

  it('keeps style and comments verbatim', () => {
    const css = '<style>.a > .b{content:"<script>"}</style><!-- <b onclick=x> -->'
    expect(sanitizePanelHtml(css)).toBe(css)
  })

  it('renderPanel works without a DOM', () => {
    const r = renderPanel('<p onclick="x">{{#each l}}{{this}}{{/each}}</p><script>x</script>', { l: [1, 2] })
    expect(r).toEqual({ html: '<p>12</p>' })
  })
})
