import { renderAuthorMarkdown } from '@/common/author-html-markdown'
import { applyTavernRules } from '../canvas-rule-engine'
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
import { stripUnknownTags, wrapDialogue } from '../canvas-platform-defaults'
// highlightText 也畫原生 [status]／[choices] 區塊（common/native-blocks）；跟頁面裡一樣是真實函式。
import { drawNativeBlocks } from '../../../common/native-blocks'

/**
 * 訊息裡的 <style>／<script> 內容不得被 markdown 動到。
 *
 * 根因（2026-09-11 社群站用戶回報「狀態欄渲染錯誤、選項點不出來」追查得出）：
 * MMD 規則展開出來的狀態欄是 `<div class="jh"><style>…</style>…</div>`，CSS 裡有空行分段、
 * `content:""` 這種雙引號。訊息以敘事文字開頭時走 markdown-it：`<div` 起頭的那一行是
 * CommonMark 第 6 型 HTML 區塊，遇到空行就結束——後面的 CSS 被當成段落，插進 `<p>`、`<br>`，
 * 雙引號變成 `&quot;`。瀏覽器解析到 `<p>.jh .stage{…}` 這種選擇器就整條丟掉，`.stage` 沒了
 * position:relative，裡面 absolute 的 `.ring` 撐到整個狀態欄大、蓋住底下的選項。
 * 管線註解本來就說 style／script 在 markdown 之前已經 stash，實際上那段 stash 排在 markdown 之後。
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
  if (depth !== 0) throw new Error('highlightText 括號未配對')
  return source.slice(startIdx, i)
}

function buildHighlightText(macros = { user: '小明', char: '星' }): (content: string, type?: number, cacheKey?: string | null) => string {
  const wrapped = `(function () {\n${extractHighlightTextSource()}\nreturn highlightText;\n})()`
  const context = vm.createContext({
    renderAuthorMarkdown,
    applyTavernRules, authorRuleOptions: () => ({ macros }),
    withFencesProtected, tagFrontendBlocks, stylePolicyFor,
    isHeavyHtml, sanitizeHtml, getMarkdownIt, renderTaskLists, dedentHtmlBlockLines, findStableBoundary,
    getStreamCacheEntry, setStreamCacheEntry, unwrapSingleHtmlFence, stripUnknownTags, wrapDialogue, drawNativeBlocks,
    cardFormat: { value: 'mmd' },
    convertVisibleHtml: (html: string) => html,
    displayScript: (text: string) => text,
    applyDisplayRules: (text: string) => ({ html: text, rollbacks: [] }),
    activeAuthorAsset: { value: { rules: [], version: 0, crossLine: false } },
    authorRules: { provisional: 0, display: (text: string) => applyTavernRules(text, [], { macros }).html },
    console,
  })
  return new vm.Script(wrapped, { filename: 'chat-vue-highlightText-raw-text-extract.js' }).runInContext(context)
}

const CSS = '\n.jh{--p:#ed3e81;position:relative}\n\n/* 角色卡 */\n.jh .stage{position:relative;height:668px}\n.jh .userbar:before{content:"";position:absolute}\n'
const JS = '\n(function(){var a="x";\n\nvar b=\'y\';if(a<b){}\n})()\n'

describe('畫布渲染管線：<style>／<script> 內容不被 markdown 動到', () => {
  it('敘事文字在前（非 heavy 路徑）：含空行與雙引號的 CSS 原樣保留，規則全部解析得出來', () => {
    const highlightText = buildHighlightText()
    const content = '手机震了三下。\n\n{{user}}侧躺在床上。\n\n<div class="jh"><style>' + CSS + '</style><div class="stage"><div class="ring"></div></div></div>\n\n后续叙事。'
    const html = highlightText(content, 0, null)
    const container = document.createElement('div')
    container.innerHTML = html
    // 只有掛在文件上的 <style> 才有 sheet 可以驗
    document.body.appendChild(container)
    const style = container.querySelector('.jh style')
    expect(style).not.toBeNull()
    expect(style!.textContent).toBe(CSS)
    expect(html).not.toContain('&quot;')
    const selectors = [...style!.sheet!.cssRules].map((r) => (r as CSSStyleRule).selectorText)
    expect(selectors).toEqual(['.jh', '.jh .stage', '.jh .userbar:before'])
    container.remove()
  })

  it('敘事文字在前：<script> 內容原樣保留（空行、引號、小於號）', () => {
    const highlightText = buildHighlightText()
    const content = '敘事在前。\n\n<div class="w"><script>' + JS + '</script><p>x</p></div>'
    const html = highlightText(content, 0, null)
    const container = document.createElement('div')
    container.innerHTML = html
    const script = container.querySelector('.w script')
    expect(script).not.toBeNull()
    expect(script!.textContent).toBe(JS)
  })

  it('訊息以 HTML 開頭（heavy 路徑）：同樣原樣', () => {
    const highlightText = buildHighlightText()
    const content = '<div class="jh"><style>' + CSS + '</style><div class="stage"></div></div>'
    const html = highlightText(content, 0, null)
    const container = document.createElement('div')
    container.innerHTML = html
    expect(container.querySelector('.jh style')!.textContent).toBe(CSS)
  })
})


describe('正文玩家名稱渲染', () => {
  it('沒有作者正則也替換歷史正文，串流切段同樣生效', () => {
    const render = buildHighlightText()
    for (const key of [null, 'macro-stream']) {
      const html = render('你好，{{user}}。\n\n{{char}}在門口。', 0, key)
      expect(html).toContain('你好，小明。')
      expect(html).toContain('星在門口。')
      expect(html).not.toContain('{{')
    }
  })
})

 it('更換人設名稱後不沿用串流快取中的舊名字', () => {
  const macros = { user: '小明', char: '星' }
  const render = buildHighlightText(macros)
  const content = '{{user}}在門口。' + '這是一段測試敘事。'.repeat(40) + '\n\n結尾。'
  expect(findStableBoundary(content, false)).toBeGreaterThan(0)
  expect(render(content, 0, 'persona-cache')).toContain('小明在門口。')
  macros.user = '小華'
  expect(render(content, 0, 'persona-cache')).toContain('小華在門口。')
 })

/**
 * 整行只有 <script>／<style> 的那幾行不換行。
 *
 * 2026-10-31 作者回報（Fate 卡）：開場白是一串規則名，每行換成一段 <script> 或 <style>，最後才是宣告文字。
 * 這兩種元素在 markdown 之前就收成佔位字元，markdown 把佔位當一般文字、breaks:true 每行補一個 <br>，
 * 開場上方空出一大塊。MMD 走 CommonMark：整行 <script>／<style> 是 HTML 區塊（第 1 型），不產生換行。
 */
describe('整行只有 <script>／<style>：不產生換行', () => {
  const textBeforeFirstLine = (html: string, marker: string) => {
    const container = document.createElement('div')
    container.innerHTML = html
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
    let brs = 0
    let node = walker.nextNode()
    while (node) {
      if (node.nodeType === 3 && (node.nodeValue || '').includes(marker)) return brs
      if (node.nodeType === 1 && (node as Element).tagName === 'BR') brs++
      node = walker.nextNode()
    }
    return -1
  }

  it('開場白：一串腳本與樣式行之後的文字前面沒有 <br>，文字之間的換行照舊', () => {
    const highlightText = buildHighlightText()
    const content = [
      '<script>window.a=1</script>',
      '<script>window.b=2</script>',
      '<style>.x{color:red}</style>',
      '<style>.y{color:blue}</style><script>window.c=3</script>',
      '宣告——',
      '汝身听吾号令。',
    ].join('\n')
    const html = highlightText(content, 0, null)
    expect(textBeforeFirstLine(html, '宣告——')).toBe(0)
    const container = document.createElement('div')
    container.innerHTML = html
    expect(container.querySelectorAll('script').length).toBe(3)
    expect(container.querySelectorAll('style').length).toBe(2)
    expect(container.innerHTML).toMatch(/宣告——<br>\s*汝身听吾号令。/)
  })

  it('文字之間夾一整行腳本：上下兩行仍分開，但不多出一行空白', () => {
    const highlightText = buildHighlightText()
    const html = highlightText('第一行\n<script>window.d=4</script>\n第二行', 0, null)
    expect(textBeforeFirstLine(html, '第二行')).toBe(1)
  })

  it('段落之間的空行照舊；整行腳本後面接標題，標題仍是標題', () => {
    const highlightText = buildHighlightText()
    const html = highlightText('<style>.a{color:red}</style>\n\n<style>.b{color:red}</style>\n# 標題\n\n正文', 0, null)
    const container = document.createElement('div')
    container.innerHTML = html
    expect(container.querySelector('h1')?.textContent).toBe('標題')
    expect(container.querySelectorAll('br').length).toBe(0)
    expect(container.querySelectorAll('style').length).toBe(2)
    expect(html).not.toContain('\x07')
  })

  it('作者 <div> 區塊裡的整行樣式：區塊照原樣，不被拆成段落', () => {
    const highlightText = buildHighlightText()
    const html = highlightText('敘事。\n\n<div class="hud">\n<style>.hud{color:red}</style>\n<span>體力 73</span>\n</div>', 0, null)
    const container = document.createElement('div')
    container.innerHTML = html
    const hud = container.querySelector('.hud')!
    expect(hud.querySelector('style')).not.toBeNull()
    expect(hud.querySelector('p')).toBeNull()
    expect(hud.textContent).toContain('體力 73')
    expect(html).not.toContain('\x07')
  })

  it('腳本跟文字在同一行：那一行的換行照舊', () => {
    const highlightText = buildHighlightText()
    const html = highlightText('第一行<script>window.e=5</script>\n第二行', 0, null)
    expect(textBeforeFirstLine(html, '第二行')).toBe(1)
  })
})
