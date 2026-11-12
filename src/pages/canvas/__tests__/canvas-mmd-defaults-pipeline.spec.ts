import { renderAuthorMarkdown } from '@/common/author-html-markdown'
// highlightText 現在也綁這兩支（圍欄保護與前端區塊標記），跟頁面裡一樣是真實函式。
import { withFencesProtected } from '../../../common/markdown-fences'
import { tagFrontendBlocks } from '../../../common/frontend-block'
import { stylePolicyFor } from '../../../common/author-style-policy'
/**
 * owner 2026-09-06 截圖：AI 回覆以 <思維鏈> 開頭，畫面上不但有字面的 <思維鏈>，括號
 * 斜體的 span 屬性還被對白上色當成引號包掉，露出 `"color: #C4B4A3;…">` 這串字。
 *
 * 用既有的 source-slicing 慣例把 highlightText 抽出來跑真實管線（見
 * chat-summary-format-false-positive.spec.ts 開頭註解）。
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { describe, it, expect } from 'vitest'
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
import { applyTavernRules } from '../canvas-rule-engine'
import { scopeCardHtml } from '../canvas-style-scope'
import { stripUnknownTags, wrapDialogue } from '../canvas-platform-defaults'
// highlightText 也畫原生 [status]／[choices] 區塊（common/native-blocks）；跟頁面裡一樣是真實函式。
import { drawNativeBlocks } from '../../../common/native-blocks'

const CANVAS_VUE = path.join(process.cwd(), 'src/pages/canvas/canvas.vue')

function extractBraced(source: string, anchor: string): string {
  const startIdx = source.indexOf(anchor)
  if (startIdx === -1) throw new Error(`錨點找不到：${anchor}`)
  const braceStart = source.indexOf('{', startIdx + anchor.length - 1)
  let depth = 0
  let i = braceStart
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') { depth--; if (depth === 0) { i++; break } }
  }
  return source.slice(startIdx, i)
}

function buildHighlightText(format: 'mmd' | 'tavern', rules: any[] = []) {
  const fnSource = extractBraced(fs.readFileSync(CANVAS_VUE, 'utf8'), 'const highlightText = (content, type, cacheKey, streaming) => {')
  const context = vm.createContext({
    renderAuthorMarkdown,
    withFencesProtected, tagFrontendBlocks, stylePolicyFor,
    isHeavyHtml, sanitizeHtml, getMarkdownIt, renderTaskLists, dedentHtmlBlockLines,
    findStableBoundary, getStreamCacheEntry, setStreamCacheEntry, unwrapSingleHtmlFence,
    applyTavernRules, scopeCardHtml,
    stripUnknownTags, wrapDialogue, drawNativeBlocks,
    authorRuleOptions: () => ({}),
    cardFormat: { value: format },
    convertVisibleHtml: (html: string) => html,
    displayScript: (text: string) => text,
    activeAuthorAsset: { value: { rules, version: 0, crossLine: false } },
    // 同步版的 authorRules：測試環境沒有 Worker，頁面裡的排程器也是這樣退回同步套用。
    authorRules: { provisional: 0, display: (text: string) => applyTavernRules(text, rules, {}).html },
    console,
  })
  return new vm.Script(`(function(){\n${fnSource}\nreturn highlightText;\n})()`).runInContext(context)
}

const SCREENSHOT = [
  '<思維鏈>',
  '用戶選擇了【出言嘲諷】，我需要：',
  '',
  '1. 讓沈梔語對這句話產生強烈反應',
  '2. 這句話暗示"你見過我的"，沈梔語會聯想到可能的場景（實際她沒見過），陷入幻想',
  '</思維鏈>',
  '',
  '沈梔語微微側身："害我想找你都沒找到。"',
].join('\n')

describe('MMD 來源的畫布：平台預設與對白上色', () => {
  it('括號斜體的 span 屬性不會被對白上色當成引號包掉', () => {
    const html = buildHighlightText('mmd')(SCREENSHOT, 0, null)
    expect(html).not.toContain('color: #C4B4A3;font-style: italic;font-weight: 400;"&gt;')
    expect(html).not.toMatch(/<font color="#DC8333">"color:/)
    expect(html).toMatch(/<span class="lt-inline-aside lt-inline-aside--ai">（實際她沒見過）<\/span>/)
    // 半形引號經 markdown 成了 &quot;，對白仍要上色（原站的對白就是半形引號）
    expect(html).toContain('<font color="#DC8333">&quot;你見過我的&quot;</font>')
    expect(html).toContain('<font color="#DC8333">&quot;害我想找你都沒找到。&quot;</font>')
  })

  it('<思維鏈> 字面標籤消失、內文照留（跟原站一樣）', () => {
    const html = buildHighlightText('mmd')(SCREENSHOT, 0, null)
    expect(html).not.toContain('思維鏈&gt;')
    expect(html).not.toContain('<思維鏈>')
    expect(html).toContain('用戶選擇了【出言嘲諷】')
  })

  it('標準元素照留：hr／u／code 不受非標準標籤剝除影響', () => {
    const html = buildHighlightText('mmd')('<u>底線</u>與<code>碼</code>\n\n<hr>\n\n<status>狀態</status>', 0, null)
    expect(html).toContain('<u>底線</u>')
    expect(html).toContain('<code>碼</code>')
    expect(html).toContain('<hr>')
    expect(html).toContain('狀態')
    expect(html).not.toContain('<status>')
  })

  it('卡片規則先於剝標籤：<AC_UI> 這種觸發標籤先被規則換掉，不會先被剝光', () => {
    const rules = [{ id: 'ui', find: '/<AC_UI>/g', replace: '<div class="ac-ui">UI</div>' }]
    const html = buildHighlightText('mmd', rules)('<AC_UI>\n\n正文', 0, null)
    expect(html).toContain('<div class="ac-ui">UI</div>')
  })

  it('不看格式：酒館格式的卡一樣剝非標準標籤、留內文，標準元素照舊', () => {
    const html = buildHighlightText('tavern')('<u>底線</u>與<status>狀態</status>', 0, null)
    expect(html).toContain('<u>底線</u>')
    expect(html).toContain('狀態')
    expect(html).not.toContain('<status>')
  })
})

/**
 * 2026-09-16 玩家回報：MMD 搬來的卡狀態欄「爆炸」——畫面上直接印出 `DGSPANELSTART▶ts::…◀DGSPANELEND`。
 * 資料庫裡模型寫的是 `DGS_KV_PANEL_V2_START`；「遊戲對白裝飾」的 `_(.*?)_` 分支把 `_KV_`、`_V2_` 當斜體標記，
 * 而回呼只接了四個捕獲組、第五組永遠拿不到，整段被換成空字串——單字裡的底線就這樣被吃掉，
 * 作者的點火器在氣泡裡再也找不到起止標記，只好把原文攤出來。
 */
describe('底線斜體裝飾不吃掉單字裡的底線', () => {
  const panelRule = { id: 'p', find: '/((?:DGS_KV_PANEL_V2_START▶[\\s\\S]*?◀DGS_KV_PANEL_V2_END\\s*)+)/g', replace: '<div class="gt-wrap"><div class="gt-raw">$1</div></div>' }
  const line = 'DGS_KV_PANEL_V2_START▶ts::1719001;;name::甲;;identity::乙;;◀DGS_KV_PANEL_V2_END'

  it('規則抓進 .gt-raw 的機讀標記原樣保留（MMD 卡的狀態欄點火器靠它）', () => {
    const html = buildHighlightText('mmd', [panelRule])(`正文。\n\n${line}`, 0, null)
    expect(html).not.toContain('DGSPANELSTART')
    expect((html.match(/DGS_KV_PANEL_V2_START/g) || []).length).toBe(1)
    expect((html.match(/DGS_KV_PANEL_V2_END/g) || []).length).toBe(1)
  })

  it('snake_case 不動；獨立的 _心聲_ 才轉成括號斜體', () => {
    const html = buildHighlightText('mmd')('<p>檔案 file_name_here 放這。她 _輕嘆_ 一聲。</p>', 0, null)
    expect(html).toContain('file_name_here')
    expect(html).toMatch(/<span class="lt-inline-aside lt-inline-aside--ai">（輕嘆）<\/span>/)
    expect(html).not.toContain('_輕嘆_')
  })
})


describe('括註樣式的作者介面', () => {
  for (const format of ['mmd', 'tavern'] as const) {
    for (const [type, role] of [[0, 'ai'], [1, 'user']] as const) {
      it(`${format} ${role} 括註提供可覆蓋的 class，不再以行內樣式鎖住外觀`, () => {
        const html = buildHighlightText(format)('<p>她（停頓）並 _輕嘆_。</p>', type, null)
        const root = document.createElement('div')
        root.innerHTML = html
        const asides = root.querySelectorAll(`.lt-inline-aside.lt-inline-aside--${role}`)
        expect(asides.length).toBe(2)
        for (const aside of asides) expect(aside.hasAttribute('style')).toBe(false)
        expect(root.textContent).toBe('她（停頓）並 （輕嘆）。')
      })
    }
  }
})


it('真實瀏覽器保留深淺／MMD 括註預設，普通作者 CSS 與變數可覆蓋', () => {
  const chrome = process.env.CHROME_BIN || [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].find(fs.existsSync)
  expect(chrome, 'Install Chrome or set CHROME_BIN for the aside style contract').toBeTruthy()
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'stage-inline-aside-'))
  let retainProfile = false
  try {
    const platformCss = ['src/common/canvas-theme-vars.css', 'src/pages/canvas/canvas.css']
      .map(file => fs.readFileSync(path.join(process.cwd(), file), 'utf8')).join('\n')
    const cases = ['light', 'dark', 'mmd'].map(mode => {
      const render = buildHighlightText(mode === 'mmd' ? 'mmd' : 'tavern')
      const pair = render('<p>她（停頓）。</p>', 0, null) + render('<p>我（點頭）。</p>', 1, null)
      return `<section class="canvas-root ${mode === 'mmd' ? 'lt-theme-dark' : ''}" data-mode="${mode}">
        <div class="default">${pair}</div><div class="author">${pair}</div><div class="vars">${pair}</div></section>`
    }).join('')
    const file = path.join(dir, 'fixture.html')
    fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>
      /* 作者樣式比平台先插入，仍應贏過平台 layer。 */
      .author .lt-inline-aside { color: rgb(12, 34, 56); font-style: normal; font-weight: 700; }
      .vars { --lt-canvas-aside-ai-color: rgb(23, 45, 67); --lt-canvas-aside-user-color: rgb(34, 56, 78); }
      </style><style>${platformCss}</style>${cases}<pre id="result"></pre><script>
      const result = [...document.querySelectorAll('.lt-inline-aside')].map(el => {
        const s = getComputedStyle(el); return [s.color, s.fontStyle, s.fontWeight];
      }); document.querySelector('#result').textContent = JSON.stringify(result);
      </script>`)
    retainProfile = true
    const run = spawnSync(chrome!, ['--headless=new', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${path.join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=1000', `file://${file}`],
      { encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024 })
    expect(run.error, run.stderr).toBeUndefined()
    expect(run.status, `${run.stderr}\nRetained fixture: ${dir}`).toBe(0)
    retainProfile = false
    const result = JSON.parse(run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)![1])
    const expected = [
      ['rgb(196, 180, 163)', 'italic', '400'], ['rgb(102, 91, 101)', 'italic', '400'],
      ['rgb(12, 34, 56)', 'normal', '700'], ['rgb(12, 34, 56)', 'normal', '700'],
      ['rgb(23, 45, 67)', 'italic', '400'], ['rgb(34, 56, 78)', 'italic', '400'],
    ]
    expect(result).toEqual([...expected, ...expected, ...expected])
  } finally { if (!retainProfile) fs.rmSync(dir, { recursive: true, force: true }) }
}, 30000)
