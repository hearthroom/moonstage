import { renderAuthorMarkdown } from '@/common/author-html-markdown'
import { applyTavernRules } from '../canvas-rule-engine'
import { installCard, renderContent } from '../../../sandbox/rules'
// highlightText 現在也綁這兩支（圍欄保護與前端區塊標記），跟頁面裡一樣是真實函式。
import { withFencesProtected } from '../../../common/markdown-fences'
import { tagFrontendBlocks } from '../../../common/frontend-block'
import { stylePolicyFor } from '../../../common/author-style-policy'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  isHeavyHtml,
  sanitizeHtml,
  getMarkdownIt,
  renderTaskLists,
  dedentHtmlBlockLines,
  findStableBoundary,
  getStreamCacheEntry,
  setStreamCacheEntry,
  unwrapSingleHtmlFence,
} from '../../../utils/rich-text-renderer.js'
// highlightText 現在直接呼叫這兩支（非標準標籤剝除與對白上色）；這些測試驗的是別的管線行為，
// 綁真實函式、來源給 tavern，等價於「沒有 MMD 預設」的路徑，跟改動前一樣。
import { stripUnknownTags, wrapDialogue } from '../canvas-platform-defaults'
// highlightText 也畫原生 [status]／[choices] 區塊（common/native-blocks）；跟頁面裡一樣是真實函式。
import { drawNativeBlocks } from '../../../common/native-blocks'
import { convertVisibleHtml } from '../canvas-display-script'

/*
  重 HTML（訊息以區塊 tag 開頭）也要過 Markdown。

  MMD 的管線是「正則→整段進 Vditor（CommonMark）→淨化」：HTML 區塊之間空一行之後
  Markdown 照常解析，區塊裡面不解析。先前畫布把重 HTML 整段跳過 markdown-it，
  卡片前後的 `---`、`**粗體**` 全部原樣印出來（owner 2026-09-04：「它實際上是能
  渲染 Markdown 的，我們現在還不行」）。
*/
const root = process.cwd()
const CHAT_VUE_PATH = path.join(root, 'src/pages/canvas/canvas.vue')

function extractHighlightTextSource(): string {
  const source = fs.readFileSync(CHAT_VUE_PATH, 'utf8')
  const anchor = 'const highlightText = (content, type, cacheKey, streaming) => {'
  const startIdx = source.indexOf(anchor)
  if (startIdx === -1) throw new Error('highlightText 錨點找不到')
  const braceStart = source.indexOf('{', startIdx + anchor.length - 1)
  let depth = 0
  let i = braceStart
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') { depth--; if (depth === 0) { i++; break } }
  }
  return source.slice(startIdx, i)
}

function buildHighlightText(): (content: string, type?: number, cacheKey?: string | null) => string {
  const wrapped = `(function () {\n${extractHighlightTextSource()}\nreturn highlightText;\n})()`
  const context = vm.createContext({
    renderAuthorMarkdown,
    applyTavernRules, authorRuleOptions: () => ({ macros: { user: '小明', char: '星' } }),
    withFencesProtected, tagFrontendBlocks, stylePolicyFor,
    isHeavyHtml, sanitizeHtml, getMarkdownIt, renderTaskLists, dedentHtmlBlockLines,
    findStableBoundary, getStreamCacheEntry, setStreamCacheEntry, unwrapSingleHtmlFence,
    stripUnknownTags, wrapDialogue, drawNativeBlocks,
    cardFormat: { value: 'tavern' },
    convertVisibleHtml,
    displayScript: (text: string) => text,
    applyDisplayRules: (text: string) => ({ html: text, rollbacks: [] }),
    activeAuthorAsset: { value: { rules: [], version: 0, crossLine: false } },
    authorRules: { provisional: 0, display: (text: string) => text },
    console,
  })
  return new vm.Script(wrapped, { filename: 'canvas-highlightText-heavy-markdown.js' }).runInContext(context)
}

function render(content: string): HTMLElement {
  const html = buildHighlightText()(content, 0, null)
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

describe('重 HTML 訊息裡的 Markdown', () => {
  it('HTML 區塊之間空一行的 `---` 與 `**粗體**` 照 CommonMark 渲染（MMD 同款）', () => {
    const el = render('<div class="card">狀態欄</div>\n\n---\n\n**今天的安排**：先到辦公室。\n\n<div class="card">下一段</div>')
    expect(el.querySelectorAll('div.card').length).toBe(2)
    expect(el.querySelector('hr')).not.toBeNull()
    expect(el.querySelector('strong')?.textContent).toBe('今天的安排')
    expect(el.textContent).not.toContain('---')
    expect(el.textContent).not.toContain('**')
  })

  it('HTML 區塊裡面的 `---` 不解析——區塊內是作者的地盤（CommonMark html block）', () => {
    const el = render('<div class="card">\n內容\n---\n下一段\n</div>')
    expect(el.querySelector('hr')).toBeNull()
    expect(el.querySelector('div.card')?.textContent).toContain('---')
  })

  it('區塊裡作者用 \\n 排的行仍然是行（<br>），markdown-it 自己排版的換行不會再轉一次', () => {
    const el = render('<div class="card">第一行\n第二行</div>\n\n- 甲\n- 乙')
    expect(el.querySelector('div.card')?.innerHTML).toContain('第一行<br>第二行')
    // 清單項與 <ul> 之間 markdown-it 自己的換行不能多出 <br>
    expect(el.querySelectorAll('li').length).toBe(2)
    expect(el.querySelector('ul')?.querySelectorAll('br').length ?? 0).toBe(0)
  })

  it('display:none 的機讀資料 span 在重 HTML 過 markdown 之後仍然一字不差', () => {
    const raw = '[角色1]\n名字=測試\n身份=老師'
    const el = render('<div class="card"><span class="zz-data" style="display:none">' + raw + '</span>正文</div>\n\n---')
    expect(el.querySelector('.zz-data')?.textContent).toBe(raw)
    expect(el.querySelector('hr')).not.toBeNull()
  })

  it('非重 HTML（敘事在前）的路徑不變', () => {
    const el = render('早安。\n\n<div class="card">卡</div>\n\n---\n\n*輕聲*')
    expect(el.querySelector('hr')).not.toBeNull()
    expect(el.querySelector('div.card')).not.toBeNull()
  })
})

// Author HTML can be indented independently of its surrounding panel. The display
// engine normalizes relative trigger sources, but the whole tag must stay live HTML.
describe('indented display-rule image triggers', () => {
  const handler = "this.closest('.panel').setAttribute('title', 'ready'); this.remove()"
  const image = `<img src="x" style="display:none" onerror="${handler}">`

  it.each(['    ', '        ', '\t'])('keeps the image after a panel and a blank line (%j)', (indent) => {
    const rules = [{ id: 'boot', find: '{{panel}}', replace: `<div class="panel">Choose\n\n${indent}${image}\n</div>\n\n**Next**` }]
    const applied = applyTavernRules('{{panel}}', rules).html
    const el = render(applied)
    expect(el.querySelector('img')?.getAttribute('src')).toBe('data:,')
    expect(el.querySelector('img')?.getAttribute('onerror')).toBe(handler)
    expect(el.querySelector('img')?.getAttribute('style')).toBe('display:none')
    expect(el.textContent).not.toContain('<img')
    expect(el.querySelector('strong')?.textContent).toBe('Next')
    const img = el.querySelector('img')!
    new Function(img.getAttribute('onerror')!).call(img)
    expect(el.querySelector('.panel')?.getAttribute('title')).toBe('ready')
    expect(el.querySelector('img')).toBeNull()

    const installed = installCard(rules, stylePolicyFor('mmd'))
    const sandbox = document.createElement('div')
    sandbox.innerHTML = renderContent('{{panel}}', installed.rules, { macros: { user: 'Player', char: 'Card' }, doc: document })
    expect(sandbox.querySelector('img')?.getAttribute('src')).toBe('data:,')
    expect(sandbox.querySelector('img')?.getAttribute('onerror')).toBe(handler)
    expect(sandbox.textContent).not.toContain('<img')
  })

  it('keeps intentionally fenced image source visible', () => {
    const el = render('Example:\n\n```html\n    ' + image + '\n```')
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('pre code')?.textContent).toContain('<img')
  })
})


// Exercise the real DOM-based script conversion, even when no characters change:
// parsing shielded HTML before restoration is part of the production path.
describe('attribute quotes through the complete classic renderer', () => {
  it.each(["it's", 'a"b', 'a=b"c'])(
    'preserves tags and author handlers after an unquoted %s value', (value) => {
      const raw = '<img class="portrait" src="https://example.com/portrait.png">'
      const handler = "this.closest('.panel').setAttribute('title', 'ready')"
      const content = `<div data-x=${value}></div><div class="panel">狀態` +
        `<textarea hidden>${raw}</textarea><img src="data:," onerror="${handler}"></div>` +
        '<style>.panel { color: red; }</style><script>window.authorReady = true</script>'
      const el = document.createElement('div')
      el.innerHTML = buildHighlightText()(content, 0, null)
      expect(el.querySelector('[data-x]')?.getAttribute('data-x')).toBe(value)
      expect(el.querySelector('textarea')?.textContent).toBe(raw)
      expect(el.querySelector('img')?.getAttribute('onerror')).toBe(handler)
      expect(el.querySelector('style')?.textContent).toBe('.panel { color: red; }')
      expect(el.querySelector('script')?.textContent).toBe('window.authorReady = true')
      const img = el.querySelector('img')!
      new Function(img.getAttribute('onerror')!).call(img)
      expect(el.querySelector('.panel')?.getAttribute('title')).toBe('ready')
    },
  )

  it.each(['"', "'"])(
    'shields angle brackets in a genuinely quoted %s attribute value', (quote) => {
      const content = `<div title = \t${quote}a > b < c${quote}>狀態</div><img src="https://example.com/a.png">`
      const el = document.createElement('div')
      el.innerHTML = buildHighlightText()(content, 0, null)
      expect(el.querySelector('div')?.getAttribute('title')).toBe('a > b < c')
      expect(el.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png')
    },
  )
})
