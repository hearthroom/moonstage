import { describe, expect, it } from 'vitest'
import MarkdownIt from 'markdown-it'
import { renderAuthorMarkdown } from './author-html-markdown'
import { convertVisibleHtml } from '@/pages/canvas/canvas-display-script'
const md = new MarkdownIt({ html: true, breaks: true })
const convert = (s: string) => s.replace(/状态/g, '狀態').replace(/穿着/g, '穿著')

describe('scripted author HTML provenance', () => {
  it('preserves raw HTML data and attributes while converting adjacent Markdown prose', () => {
    const source = '她穿着校服\n\n<div class="source" data-key="状态">状态：穿着校服</div>\n\n**穿着校服**'
    const result = convertVisibleHtml(renderAuthorMarkdown(md, source, true), convert)
    const root = document.createElement('div'); root.innerHTML = result
    expect(root.querySelector('.source')?.textContent).toBe('状态：穿着校服')
    expect(root.querySelector('.source')?.getAttribute('data-key')).toBe('状态')
    expect(root.querySelector('p')?.textContent).toBe('她穿著校服')
    expect(root.querySelector('strong')?.textContent).toBe('穿著校服')
  })
  it('handles inline HTML, sibling roots and literal code without converting data', () => {
    const source = '穿着<span class="value">状态：穿着</span>\n\n<div>状态</div><div>穿着</div>\n\n`<span>穿着</span>`'
    const root = document.createElement('div')
    root.innerHTML = convertVisibleHtml(renderAuthorMarkdown(md, source, true), convert)
    expect(root.querySelector('.value')?.textContent).toBe('状态：穿着')
    expect([...root.querySelectorAll('div')].map(e => e.textContent)).toEqual(['状态', '穿着'])
    expect(root.querySelector('p')?.firstChild?.textContent).toBe('穿著')
    expect(root.querySelector('code')?.textContent).toBe('<span>穿着</span>')
  })
  it('preserves containers and tables that span multiple Markdown HTML tokens', () => {
    for (const source of ['<div class="panel">\n\n**穿着**\n\n</div>', '<table><tbody><tr><td>\n\n**穿着**\n\n</td></tr></tbody></table>']) {
      const html = renderAuthorMarkdown(md, source, true)
      expect(html.replace(/ translate="no"/g, '')).toBe(md.render(source))
    }
  })
  it('does not rewrite tag-like text in scripts, styles, comments or quoted attributes', () => {
    const source = '<script>const s="<div>状态</div>"</script>\n\n<div title="x > y"><!-- <span> --><style>.x::after{content:"<b>"}</style>状态</div>'
    expect(renderAuthorMarkdown(md, source, true).replace(/ translate="no"/g, '')).toBe(md.render(source))
  })
  it('keeps raw-text content intact across inline tokens', () => {
    const source = 'prose <textarea><span>状态</span></textarea> <script>const data="<b>状态</b>"</script> 穿着<span>状态</span>'
    const root = document.createElement('div')
    root.innerHTML = renderAuthorMarkdown(md, source, true)
    expect(root.querySelector('textarea')?.value).toBe('<span>状态</span>')
    const baseline = document.createElement('div'); baseline.innerHTML = md.render(source)
    expect(root.querySelector('script')?.textContent).toBe(baseline.querySelector('script')?.textContent)
    expect(root.querySelector('p > span')?.getAttribute('translate')).toBe('no')
  })
  it('preserves literal markup in SVG CDATA', () => {
    const root = document.createElement('div')
    root.innerHTML = renderAuthorMarkdown(md, '<svg><text><![CDATA[<b>状态</b>]]></text></svg>', true)
    expect(root.querySelector('text')?.textContent).toBe('<b>状态</b>')
  })
  it('retains the existing HTML conversion for cards without author scripts', () => {
    expect(convertVisibleHtml(renderAuthorMarkdown(md, '<div>状态：穿着</div>'), convert))
      .toContain('<div>狀態：穿著</div>')
  })
})
