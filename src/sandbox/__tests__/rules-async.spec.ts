// @vitest-environment jsdom
/**
 * 沙箱殼自己渲染正文時（宿主沒給 html：獨立殼、狀態欄），作者規則同樣交給 worker：
 * 殼不等規則、先畫暫時的，結果到了換上；腳本等完整結果才啟動。產物跟同步 renderContent 逐字相同。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { createShell, type Shell } from '../shell'
import { installCard, renderContent } from '../rules'
import { stylePolicyFor, applyStylePolicyToHtml } from '@/common/author-style-policy'
import type { SandboxHelloConfig } from '../protocol'
import { createRuleRunner, type RuleExecutor, type ExecutorJob, type RulePersist } from '@/common/author-rules'
import { executeRuleJob, type RuleResult } from '@/common/author-rules/rule-job'

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
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); await nextTick() }

const RULES = [
  { id: 1, find: '/<zt>([\\s\\S]*?)<\\/zt>/', replace: '<div class="panel">$1</div>' },
  { id: 2, find: '/^開場/', replace: '【序】' },
]

function config(over: Partial<SandboxHelloConfig> = {}): SandboxHelloConfig {
  return {
    theme: 'dark',
    locale: 'zh-Hant',
    role: { name: '露娜', avatarUrl: '' },
    user: { nickname: '小明', avatarUrl: '' },
    card: { rules: RULES, statusbar: '' },
    capabilities: { saves: false, edit: false, send: true },
    composer: true,
    ...over,
  }
}

let shell: Shell | null = null
afterEach(() => { shell?.dispose(); shell = null; delete (window as unknown as Record<string, unknown>).sdk; delete (window as unknown as Record<string, unknown>).__ran })

function boot(cfg: SandboxHelloConfig, executor: RuleExecutor, persist?: RulePersist) {
  document.body.innerHTML = '<div id="app"></div>'
  const ruleRunner = createRuleRunner({ executor, persist, engineVersion: persist ? 'v1' : '' })
  shell = createShell({ doc: document, win: window as Window & typeof globalThis, mount: document.getElementById('app')!, config: cfg, transport: { send: () => {} }, ruleRunner })
  return shell
}

const body = (s: Shell, i = 0) => s.refs.list.querySelectorAll('[data-chat="message-body"]')[i] as HTMLElement

describe('殼的正文渲染：規則在 worker 裡跑', () => {
  it('串流：字立刻出現、不等規則；尾巴半截標籤藏著；結果到了換上完整套用的產物', async () => {
    const { executor, started, finishAll } = manualExecutor()
    const s = boot(config(), executor)
    s.handle({ type: 'messages', messages: [] })
    s.handle({ type: 'message.new', message: { id: 'l1', role: 'ai', content: '', serverId: null } })
    s.handle({ type: 'message.stream', id: 'l1', content: '開場<zt>體力 10</zt>然後<span cla' })
    await nextTick()
    expect(started.length).toBe(1)
    expect(body(s).textContent).toContain('然後')
    expect(body(s).innerHTML).not.toContain('<span cla')
    expect(body(s).innerHTML).not.toContain('class="panel"')
    finishAll()
    await settle()
    expect(body(s).innerHTML).toContain('<div class="panel">體力 10</div>')
  })

  it('定稿結果跟同步 renderContent 逐字相同（歷史訊息：先畫原文，結果到了換上）', async () => {
    const { executor, finishAll } = manualExecutor()
    const s = boot(config(), executor)
    const content = '開場，{{user}}<zt>好感 3</zt>'
    s.handle({ type: 'messages', messages: [{ id: 'h1', role: 'ai', content, serverId: '1' }] })
    expect(body(s).innerHTML).not.toContain('class="panel"')
    finishAll()
    await settle()
    const policy = stylePolicyFor(undefined)
    const card = installCard(RULES as any, policy)
    const expected = applyStylePolicyToHtml(renderContent(content, card.rules, { macros: { user: '小明', char: '露娜' }, doc: document, fencedDocument: policy.fencedDocument }), policy)
    expect(expected).toContain('【序】，小明')
    expect(expected).toContain('<div class="panel">好感 3</div>')
    expect(body(s).innerHTML).toContain(expected)
  })

  it('狀態欄（宿主沒給 html）也是：先畫暫時的，結果到了重畫', async () => {
    const { executor, finishAll } = manualExecutor()
    const s = boot(config({ card: { rules: RULES, statusbar: '<zt>狀態</zt>' } }), executor)
    expect(s.refs.statusbar!.innerHTML).not.toContain('class="panel"')
    finishAll()
    await settle()
    expect(s.refs.statusbar!.innerHTML).toContain('<div class="panel">狀態</div>')
  })

  it('串流最後一版就是定稿全文：定稿那一刻向排程器要定稿結果（寫進持久層，重整立刻命中），不重跑規則', async () => {
    const { executor, started, finishAll } = manualExecutor()
    const store = new Map<string, unknown>()
    const persist: RulePersist = { get: async (k) => store.get(k) as any, set: (k, v) => { store.set(k, v) } }
    const s = boot(config(), executor, persist)
    s.handle({ type: 'messages', messages: [] })
    s.handle({ type: 'message.new', message: { id: 'l1', role: 'ai', content: '', serverId: null } })
    const content = '開場<zt>體力 10</zt>完'
    s.handle({ type: 'message.stream', id: 'l1', content })
    await nextTick()
    finishAll()
    await settle()
    expect(body(s).innerHTML).toContain('<div class="panel">體力 10</div>')
    expect(store.size).toBe(0)
    s.handle({ type: 'message.done', id: 'l1', content, serverId: '9' })
    await settle()
    expect(started.length).toBe(0)
    expect(store.size).toBe(1)
    expect(body(s).innerHTML).toContain('<div class="panel">體力 10</div>')
  })
})
