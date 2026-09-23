/**
 * 畫布的訊息渲染接上 worker 版的作者規則（一般卡與沙箱卡的宿主都走這條：沙箱殼的 html 也是這裡算的）。
 *
 * 用既有的 source-slicing 慣例把 highlightText／renderMessage 抽出來跑真實原始碼（見
 * chat-summary-format-false-positive.spec.ts 開頭註解），authorRules 換成背後接手動執行器的排程器。
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, it, expect, beforeEach } from 'vitest'
import { withFencesProtected } from '../../../common/markdown-fences'
import { tagFrontendBlocks } from '../../../common/frontend-block'
import { stylePolicyFor } from '../../../common/author-style-policy'
import {
  isHeavyHtml, sanitizeHtml, getMarkdownIt, renderTaskLists, dedentHtmlBlockLines,
  findStableBoundary, getStreamCacheEntry, setStreamCacheEntry, clearStreamCache, unwrapSingleHtmlFence,
} from '../../../utils/rich-text-renderer.js'
import { applyTavernRules } from '../canvas-rule-engine'
import { scopeCardHtml } from '../canvas-style-scope'
import { stripUnknownTags, wrapDialogue } from '../canvas-platform-defaults'
import { createRuleRunner, type RuleExecutor, type ExecutorJob } from '@/common/author-rules'
import { executeRuleJob, type RuleResult } from '@/common/author-rules/rule-job'

const CANVAS_VUE = path.join(process.cwd(), 'src/pages/canvas/canvas.vue')
const SOURCE = fs.readFileSync(CANVAS_VUE, 'utf8')

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

function manualExecutor() {
  const started: Array<{ job: ExecutorJob; resolve: (r: RuleResult) => void }> = []
  const executor: RuleExecutor = {
    available: () => true,
    run: (job) => new Promise<RuleResult>((resolve) => { started.push({ job, resolve }) }),
  }
  const finishAll = () => {
    for (const s of started.splice(0)) s.resolve(executeRuleJob(s.job.engine, s.job.text, s.job.rules as any[], s.job.options))
  }
  return { executor, started, finishAll }
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) }

/** 頁面裡那個 authorRules 的同形：display 交給排程器，暫時結果就把 provisional 加一。 */
function makeAuthorRules(executor: RuleExecutor | null, rules: any[]) {
  const runner = createRuleRunner({ executor })
  const authorRules = {
    provisional: 0,
    display(text: string, streaming: boolean) {
      const out = runner.display({ engine: 'tavern', text, rules, options: {} }, { streaming })
      if (out.provisional) authorRules.provisional++
      return out.html
    },
  }
  return { runner, authorRules }
}

function buildHighlightText(rules: any[], authorRules: unknown, crossLine = false) {
  const fnSource = extractBraced(SOURCE, 'const highlightText = (content, type, cacheKey, streaming) => {')
  const context = vm.createContext({
    withFencesProtected, tagFrontendBlocks, stylePolicyFor,
    isHeavyHtml, sanitizeHtml, getMarkdownIt, renderTaskLists, dedentHtmlBlockLines,
    findStableBoundary, getStreamCacheEntry, setStreamCacheEntry, unwrapSingleHtmlFence,
    applyTavernRules, scopeCardHtml, stripUnknownTags, wrapDialogue,
    authorRules,
    authorRuleOptions: () => ({}),
    cardFormat: { value: 'tavern' },
    convertVisibleHtml: (html: string) => html,
    displayScript: (text: string) => text,
    activeAuthorAsset: { value: { rules, version: 0, crossLine } },
    console,
  })
  return new vm.Script(`(function(){\n${fnSource}\nreturn highlightText;\n})()`).runInContext(context)
}

beforeEach(() => { clearStreamCache() })

const RULE = [{ id: '1', find: '/【([^】\\n]*)】/g', replace: '<b class="tag">$1</b>' }]

describe('highlightText：規則不在這條執行緒上跑', () => {
  it('串流：字立刻出現（上次套完的產物＋原文），半截標籤藏著；結果回來後是完整套用的畫面', async () => {
    const { executor, finishAll } = manualExecutor()
    const { authorRules } = makeAuthorRules(executor, RULE)
    const highlightText = buildHighlightText(RULE, authorRules)
    const first = highlightText('【開場】今天<span cla', 0, 'm1:0:0')
    expect(first).toContain('今天')
    expect(first).not.toContain('class="tag"')
    expect(first).not.toContain('span cla')
    finishAll()
    await settle()
    const second = highlightText('【開場】今天<span cla', 0, 'm1:0:0')
    expect(second).toContain('<b class="tag">開場</b>')
    // 下一個 chunk：立刻看得到新字，前面沿用剛套完的產物
    const third = highlightText('【開場】今天<span class="x">天氣</span>好', 0, 'm1:0:0')
    expect(third).toContain('<b class="tag">開場</b>')
    expect(third).toContain('天氣')
  })

  it('定稿後的畫面跟同步套用的管線逐字相同', async () => {
    const { executor, finishAll } = manualExecutor()
    const { authorRules } = makeAuthorRules(executor, RULE)
    const asyncHighlight = buildHighlightText(RULE, authorRules)
    const syncHighlight = buildHighlightText(RULE, makeAuthorRules(null, RULE).authorRules)
    const text = '【開場】\n\n她說："你好"\n\n【狀態】體力 10'
    asyncHighlight(text, 0, null)
    finishAll()
    await settle()
    expect(asyncHighlight(text, 0, null)).toBe(syncHighlight(text, 0, null))
  })

  it('規則結果還沒回來的前綴段落不進串流快取（快取住就不會再重算）', async () => {
    const { executor, finishAll } = manualExecutor()
    const { authorRules } = makeAuthorRules(executor, RULE)
    const highlightText = buildHighlightText(RULE, authorRules)
    const para = '這是一段夠長的敘事文字，用來撐過兩百字的門檻。'.repeat(5)
    const content = `【甲】${para}\n\n${para}\n\n【乙】尾巴`
    highlightText(content, 0, 'm2:0:0')
    expect(getStreamCacheEntry('m2:0:0')).toBeFalsy()
    finishAll()
    await settle()
    highlightText(content, 0, 'm2:0:0')
    finishAll()
    await settle()
    highlightText(content, 0, 'm2:0:0')
    const entry = getStreamCacheEntry('m2:0:0') as { html: string } | null
    expect(entry && entry.html).toContain('<b class="tag">甲</b>')
  })

  it('病態規則：呼叫端立刻拿到畫面', () => {
    const PATHOLOGICAL = '/^(?!<section class="zzz9-frame")(?!(?:<span class="zzz9-(?:engine|config|css)"[^>]*>[\\s\\S]*?<\\/span>|<img\\b[^>]*>|\\s)+$)([\\s\\S]+)$/'
    const rules = [{ id: 'slow', find: PATHOLOGICAL, replace: '<section class="zzz9-frame">$1</section>' }]
    const text = Array.from({ length: 22 }, (_, i) => `<span class="zzz9-engine" data-i="${i}">e${i}</span>`).join('\n') + '\n<span class="zzz9-config">x</span>'
    const { executor } = manualExecutor()
    const { authorRules } = makeAuthorRules(executor, rules)
    const highlightText = buildHighlightText(rules, authorRules, true)
    const t0 = performance.now()
    highlightText(text, 0, 'm3:0:0')
    expect(performance.now() - t0).toBeLessThan(50)
  })
})

function buildRenderMessage(authorRules: unknown, renderMarkdown: (item: any) => string) {
  const parts = [
    extractBraced(SOURCE, 'function renderMemoKey(item) {'),
    extractBraced(SOURCE, 'function renderMemoHit(entry, key) {'),
    extractBraced(SOURCE, 'function renderIsProvisional(item) {'),
    extractBraced(SOURCE, 'const renderMessage = (item) => {'),
  ].join('\n')
  const activated: string[] = []
  const epoch = { value: 0 }
  const context = vm.createContext({
    authorRules,
    authorRuleEpoch: epoch,
    renderMemo: new WeakMap(),
    renderMarkdown,
    splitThinkingContent: (content: string) => ({ hasThinking: false, visibleContent: content }),
    cardHandlesTag: () => false,
    activeAuthorAsset: { value: { rules: [], version: 0 } },
    displayScript: { value: 'none' },
    streamRenderTick: { value: 0 },
    STREAM_RENDER_INTERVAL_MS: 150,
    streamRenderTimer: 0,
    activateMessageScripts: (_item: unknown, html: string) => { activated.push(html) },
    activateFrontendBlocks: () => {},
    setTimeout, Date, console,
  })
  const renderMessage = new vm.Script(`(function(){\n${parts}\nreturn renderMessage;\n})()`).runInContext(context)
  return { renderMessage, activated, epoch }
}

describe('renderMessage：暫時畫面與定稿', () => {
  it('定稿時結果還沒回來：先留著上一版畫面、不啟動腳本；結果回來（epoch 變）才換上並啟動一次', () => {
    let pending = true
    const authorRules = { provisional: 0 }
    const renderMarkdown = (item: any) => {
      if (pending) { authorRules.provisional++; return `raw:${item.content}` }
      return `final:${item.content}`
    }
    const { renderMessage, activated, epoch } = buildRenderMessage(authorRules, renderMarkdown)
    const item: any = { id: 1, content: '全文', chatFinish: false }
    expect(renderMessage(item)).toBe('raw:全文') // 串流中：暫時畫面照樣換上
    item.chatFinish = true
    expect(renderMessage(item)).toBe('raw:全文') // 定稿：上一版留著，不退回、不啟動
    expect(activated).toEqual([])
    expect(renderMessage(item)).toBe('raw:全文') // 同一個 epoch：記住，不重算
    pending = false
    epoch.value++
    expect(renderMessage(item)).toBe('final:全文')
    expect(activated).toEqual(['final:全文'])
    expect(renderMessage(item)).toBe('final:全文')
    expect(activated).toHaveLength(1)
  })
})

describe('沙箱卡：殼的定稿等規則的完整結果', () => {
  it('hud 讀到的 finished 在暫時畫面時先不放行（殼收到 done 才啟動作者腳本、發 message:done）', () => {
    expect(SOURCE).toContain('finished: !!item.chatFinish && !(sandboxCard.value && renderIsProvisional(item)),')
    // html 一格排在 finished 之前：同一個物件字面裡先算畫面，renderIsProvisional 才讀得到這一趟的結果
    const read = extractBraced(SOURCE, 'messages: list.map((item, index) => {')
    expect(read.indexOf('html: item.chatLoading')).toBeLessThan(read.indexOf('finished: !!item.chatFinish'))
  })
})
