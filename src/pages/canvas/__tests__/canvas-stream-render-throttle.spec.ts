import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { createStreamRenderThrottle, streamRenderKey, nextStreamRenderInterval, STREAM_RENDER_MIN_INTERVAL_MS, STREAM_RENDER_MAX_INTERVAL_MS } from '../canvas-stream-render'

const SOURCE = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')

function extractBraced(source: string, head: string): string {
  const start = source.indexOf(head)
  if (start < 0) throw new Error('missing: ' + head)
  let depth = 0
  for (let i = source.indexOf('{', start + head.length - 1); i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1)
  }
  throw new Error('unbalanced: ' + head)
}

function buildRenderMessage(clock: { now: number }) {
  const parts = [
    extractBraced(SOURCE, 'function renderMemoKey(item) {'),
    extractBraced(SOURCE, 'function renderMemoHit(entry, key) {'),
    extractBraced(SOURCE, 'const renderMessage = (item) => {'),
  ].join('\n')
  const rendered: string[] = []
  const FakeDate = { now: () => clock.now }
  const context = vm.createContext({
    authorRules: { provisional: 0 },
    authorRuleEpoch: { value: 0 },
    renderMemo: new WeakMap(),
    renderMarkdown: (item: any) => { rendered.push(item.content); return `html:${item.content}` },
    splitThinkingContent: (content: string) => ({ hasThinking: false, visibleContent: content }),
    cardHandlesTag: () => false,
    activeAuthorAsset: { value: { rules: [], version: 0 } },
    displayScript: { value: 'none' },
    streamRenderTick: { value: 0 },
    streamRenderThrottle: createStreamRenderThrottle(),
    streamRenderKey,
    streamRenderTimer: 0,
    activateMessageScripts: () => {},
    activateFrontendBlocks: () => {},
    decorateSpeakers: (html: string) => html,
    worldMembers: () => [],
    roleView: { value: {} },
    setTimeout: () => 1, Date: FakeDate, console,
  })
  const renderMessage = new vm.Script(`(function(){\n${parts}\nreturn renderMessage;\n})()`).runInContext(context)
  return { renderMessage, rendered, context }
}

describe('串流中的那一則：節流看的是訊息身分，不是物件', () => {
  it('每個 chunk 都換成新物件時，150ms 內只排版一次', () => {
    const clock = { now: 1000 }
    const { renderMessage, rendered } = buildRenderMessage(clock)
    const bubble = (content: string) => ({ id: 'c1', operationBubbleId: 'op-1', content, chatFinish: false })
    expect(renderMessage(bubble('一'))).toBe('html:一')
    clock.now += 40
    expect(renderMessage(bubble('一二'))).toBe('html:一')
    clock.now += 40
    expect(renderMessage(bubble('一二三'))).toBe('html:一')
    expect(rendered).toEqual(['一'])
    clock.now += 100
    expect(renderMessage(bubble('一二三四'))).toBe('html:一二三四')
    expect(rendered).toEqual(['一', '一二三四'])
  })

  it('定稿那一次一定完整排版，不吃節流', () => {
    const clock = { now: 1000 }
    const { renderMessage, rendered } = buildRenderMessage(clock)
    renderMessage({ id: 'c1', operationBubbleId: 'op-1', content: '一', chatFinish: false })
    clock.now += 10
    expect(renderMessage({ id: 'c1', operationBubbleId: 'op-1', content: '一二', chatFinish: true })).toBe('html:一二')
    expect(rendered).toEqual(['一', '一二'])
  })

  it('已完成的訊息記住結果時，不再掃一次思考標籤', () => {
    let splits = 0
    const clock = { now: 1000 }
    const { renderMessage, context } = buildRenderMessage(clock)
    ;(context as any).splitThinkingContent = (content: string) => { splits++; return { hasThinking: false, visibleContent: content } }
    const item = { id: 'h1', content: '舊訊息', chatFinish: true }
    renderMessage(item)
    renderMessage(item)
    renderMessage(item)
    expect(splits).toBe(1)
  })
})

describe('變速：排版越貴，間隔越長', () => {
  it('便宜的排版維持最短間隔，昂貴的拉長但有上限', () => {
    expect(nextStreamRenderInterval(1)).toBe(STREAM_RENDER_MIN_INTERVAL_MS)
    expect(nextStreamRenderInterval(100)).toBe(400)
    expect(nextStreamRenderInterval(5000)).toBe(STREAM_RENDER_MAX_INTERVAL_MS)
    expect(nextStreamRenderInterval(Number.NaN)).toBe(STREAM_RENDER_MIN_INTERVAL_MS)
  })

  it('節流器照上一次的成本決定下一次什麼時候能換畫面', () => {
    const throttle = createStreamRenderThrottle()
    throttle.record('k', '<p>a</p>', 100, 0)
    expect(throttle.cached('k', 399)).toEqual({ html: '<p>a</p>', waitMs: 1 })
    expect(throttle.cached('k', 400)).toBeNull()
    throttle.forget('k')
    expect(throttle.cached('k', 1)).toBeNull()
  })
})
