/**
 * 上下文用量面板：一行總數、一條用量條、各部分占容量幾成與剩餘空間。
 *
 * 元件不打 API：資料由頁面整理好餵進來，所以這裡直接餵伺服器回的那種 JSON，
 * 從正規化一路驗到畫出來的列。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import CanvasContextBreakdown from '../components/canvas-context-breakdown.vue'
import {
  BREAKDOWN_META,
  contextRingFromReport,
  createPromptDiagnosticsRequestGate,
  formatTokenCount,
  normalizeServerReport,
  promptBreakdownHasModData,
  promptUsageView,
  visiblePromptBreakdownItems,
} from '../canvas-context-breakdown'

const ITEM_LABELS: Record<string, string> = {
  system: '系統與策略',
  roleCard: '角色卡',
  mod: 'MOD',
  notepad: '手帳',
  directive: '長期指令',
  userProfile: '使用者設定',
  summary: '劇情總結',
  history: '歷史對話',
  worldbook: '世界書',
  memory: '記憶錨點',
  currentInput: '目前輸入',
}

const LABELS = {
  title: '上下文用量',
  subtitle: '依最近一次完成的回覆估算',
  close: '關閉',
  retry: '重試',
  loadFailed: '讀不到',
  unsupportedModel: '目前的模型不支援',
  notReady: '完成一輪回覆後可查看',
  totalTokens: '估算 Token',
  tokenUnit: 'Tokens',
  pointUnit: '點',
  billingTotal: '本輪消耗',
  cacheHitRateFull: '快取命中率',
  localEstimateNote: '各部分的 Token 數為估算。',
  actualInputTokens: '實際輸入 Token',
  free: '剩餘空間',
  hintTurns: '較早的劇情大約再過 {n} 輪會濃縮成摘要。',
  hintLine: '較早的劇情會在用量到達那條線時濃縮成摘要。',
  hintNow: '較早的劇情很快會濃縮成摘要。',
  expandModDetails: '展開各 MOD 用量',
  collapseModDetails: '收起各 MOD 用量',
  modDetailsUnavailable: 'MOD 明細暫時無法顯示',
  modDetailsLegacy: '下一次回覆後可看 MOD 明細',
  items: ITEM_LABELS,
  modsUsed: (n: number) => `本輪使用 ${n} 個 MOD`,
}

/** 伺服器 breakdownVersion=2 的回覆長這樣（連 model 這種內部欄位一起帶著，看它會不會漏出來）。 */
function serverReport(overrides: Record<string, unknown> = {}) {
  const usage = (chars: number, tokens: number) => ({ charCount: chars, estimatedTokens: tokens })
  return {
    schemaVersion: 2,
    supported: true,
    status: 'ok',
    conversationId: 'conv-1',
    roleId: 'role-1',
    model: 'secret-model-name',
    turnIndex: 7,
    items: [
      { key: 'system', labelKey: 'promptBreakdown.system', color: '#60A5FA', available: true, sourceCount: 3, charCount: 1200, estimatedTokens: 300, percent: 30 },
      { key: 'roleCard', labelKey: 'promptBreakdown.roleCard', color: '#F5C542', available: true, sourceCount: 1, charCount: 800, estimatedTokens: 200, percent: 20 },
      {
        key: 'mod', labelKey: 'promptBreakdown.mod', color: '#465CFF', available: true, sourceCount: 2, charCount: 400, estimatedTokens: 100, percent: 10,
        detailsAvailable: true, totalDetailCount: 2,
        positions: { mainPrompt: usage(300, 75), prefixRules: usage(50, 12), suffixRules: usage(50, 13) },
        runtimeSupport: usage(0, 0), sharedOverhead: usage(0, 0),
        details: [
          {
            modId: 'mod-a', enabledVersion: '1', name: '甲', nameEn: 'Alpha', nameJa: '', nameKo: '',
            charCount: 250, estimatedTokens: 60, percent: 60,
            positions: { mainPrompt: usage(200, 50), prefixRules: usage(25, 5), suffixRules: usage(25, 5) },
            runtimeSupport: usage(0, 0), sharedOverhead: usage(0, 0),
          },
          {
            modId: 'mod-b', enabledVersion: '2', name: '乙', nameEn: 'Beta', nameJa: '', nameKo: '',
            charCount: 150, estimatedTokens: 40, percent: 40,
            positions: { mainPrompt: usage(100, 25), prefixRules: usage(25, 7), suffixRules: usage(25, 8) },
            runtimeSupport: usage(0, 0), sharedOverhead: usage(0, 0),
          },
        ],
      },
      { key: 'notepad', labelKey: 'promptBreakdown.notepad', color: '#84CC16', available: true, sourceCount: 1, charCount: 200, estimatedTokens: 50, percent: 5 },
      { key: 'directive', labelKey: 'promptBreakdown.directive', color: '#DB2777', available: true, sourceCount: 0, charCount: 0, estimatedTokens: 0, percent: 0 },
      { key: 'userProfile', labelKey: 'promptBreakdown.userProfile', color: '#34D399', available: true, sourceCount: 1, charCount: 100, estimatedTokens: 25, percent: 3 },
      { key: 'summary', labelKey: 'promptBreakdown.summary', color: '#A78BFA', available: true, sourceCount: 0, charCount: 0, estimatedTokens: 0, percent: 0 },
      { key: 'history', labelKey: 'promptBreakdown.history', color: '#FB7185', available: true, sourceCount: 12, charCount: 1000, estimatedTokens: 250, percent: 25 },
      { key: 'worldbook', labelKey: 'promptBreakdown.worldbook', color: '#22D3EE', available: false, sourceCount: 0, charCount: 0, estimatedTokens: 0, percent: 0 },
      { key: 'memory', labelKey: 'promptBreakdown.memory', color: '#F97316', available: true, sourceCount: 2, charCount: 160, estimatedTokens: 40, percent: 4 },
      { key: 'currentInput', labelKey: 'promptBreakdown.currentInput', color: '#C084FC', available: true, sourceCount: 1, charCount: 120, estimatedTokens: 30, percent: 3 },
    ],
    total: { charCount: 3980, estimatedTokens: 995 },
    cache: { available: true, hitRate: 80, inputTokens: 1000, readTokens: 800, writeTokens: 0 },
    billing: { available: true, totalPoints: 42, inputPoints: 10, cacheReadPoints: 2, outputPoints: 30, cacheHitRate: 80 },
    ...overrides,
  }
}

/** Harbor 的報告多帶一個 window：用量（記憶整理那把尺）、玩家選的容量、開始濃縮的位置。 */
const WINDOW = { available: true, usedTokens: 1990, limitTokens: 64000, compactAtTokens: 58880, percent: 3, turnsLeft: 12 }

function mountSheet(props: Record<string, unknown> = {}) {
  return mount(CanvasContextBreakdown, { props: { labels: LABELS, ...props } })
}

describe('組成：伺服器回覆正規化', () => {
  it('十一個桶照固定順序列出，百分比與 token 對得上伺服器', () => {
    const report = normalizeServerReport(serverReport())!
    expect(report.items.map((i) => i.key)).toEqual(BREAKDOWN_META.map((m) => m.key))
    const byKey = Object.fromEntries(report.items.map((i) => [i.key, i]))
    expect(byKey.system.percent).toBe(30)
    expect(byKey.system.estimatedTokens).toBe(300)
    expect(byKey.history.percent).toBe(25)
    expect(byKey.worldbook.available).toBe(false)
    expect(report.total.estimatedTokens).toBe(995)
    expect(report.billing.totalPoints).toBe(42)
    expect(report.billing.cacheHitRate).toBe(80)
  })

  it('內部欄位不出正規化結果：model／roleId／turnIndex 一個都不留', () => {
    const report = normalizeServerReport(serverReport()) as any
    expect(report).not.toHaveProperty('model')
    expect(report).not.toHaveProperty('roleId')
    expect(report).not.toHaveProperty('turnIndex')
    expect(report.conversationId).toBe('conv-1')
  })

  it('MOD 明細加總對得上才放出來；對不上就標成 invalid_detail 不畫', () => {
    const ok = normalizeServerReport(serverReport())!
    const mod = ok.items.find((i) => i.key === 'mod')!
    expect(mod.detailsAvailable).toBe(true)
    expect(mod.details.map((d) => d.modId)).toEqual(['mod-a', 'mod-b'])

    const broken = serverReport()
    ;(broken.items[2] as any).details[0].estimatedTokens = 999
    const bad = normalizeServerReport(broken)!
    const badMod = bad.items.find((i) => i.key === 'mod')!
    expect(badMod.detailsAvailable).toBe(false)
    expect(badMod.detailsUnavailableReason).toBe('invalid_detail')
  })

  it('伺服器沒給百分比時自己分配，加起來剛好 100', () => {
    const raw = serverReport()
    raw.items.forEach((i: any) => { i.percent = 0 })
    const report = normalizeServerReport(raw)!
    expect(report.items.reduce((sum, i) => sum + i.percent, 0)).toBe(100)
  })

  it('不支援的模型：所有桶歸零、supported=false', () => {
    const report = normalizeServerReport(serverReport({ supported: false, status: 'unsupportedModel' }))!
    expect(report.supported).toBe(false)
    expect(report.status).toBe('unsupportedModel')
    expect(report.items.every((i) => i.estimatedTokens === 0 && i.percent === 0)).toBe(true)
  })

  it('有容量時：各部分換成記憶整理那把尺，占容量幾成；剩餘空間與濃縮線一起算出來', () => {
    const view = promptUsageView(normalizeServerReport(serverReport({ window: WINDOW })))!
    expect(view.hasWindow).toBe(true)
    expect(view.rows.map((r) => r.key)).toEqual(['system', 'roleCard', 'mod', 'notepad', 'userProfile', 'history', 'memory', 'currentInput'])
    // 1990 / 995：每一部分乘 2
    expect(view.rows[0]).toMatchObject({ key: 'system', tokens: 600, percent: 1 })
    expect(view.usedTokens).toBe(1990)
    expect(view.freeTokens).toBe(62010)
    expect(view.freePercent).toBe(97)
    expect(view.compactAt).toBeCloseTo(92)
    expect(view.turnsLeft).toBe(12)
    expect(view.condensing).toBe(false)
  })

  it('沒有容量時（LunaTalk、舊回合）退回占提示詞幾成，不算剩餘空間也不畫線', () => {
    const view = promptUsageView(normalizeServerReport(serverReport()))!
    expect(view.hasWindow).toBe(false)
    expect(view.compactAt).toBeNull()
    expect(view.rows[0]).toMatchObject({ key: 'system', tokens: 300, percent: 30 })
  })

  it('window 不完整或濃縮線超過容量就當沒有，不猜', () => {
    for (const window of [{ ...WINDOW, available: false }, { ...WINDOW, limitTokens: 0 }, { ...WINDOW, compactAtTokens: 70000 }, null]) {
      expect(normalizeServerReport(serverReport({ window }))!.window.available).toBe(false)
    }
  })

  it('小圓環：有容量才有；到了濃縮線就是 full', () => {
    expect(contextRingFromReport(normalizeServerReport(serverReport()))).toBeNull()
    expect(contextRingFromReport(normalizeServerReport(serverReport({ window: WINDOW })))).toEqual({ percent: 3, level: 'low' })
    const full = { ...WINDOW, usedTokens: 59000 }
    expect(contextRingFromReport(normalizeServerReport(serverReport({ window: full })))).toEqual({ percent: 92, level: 'full' })
    expect(contextRingFromReport(normalizeServerReport(serverReport({ status: 'notReady', window: WINDOW })))).toBeNull()
  })

  it('token 數寫成 23.5k、1M 這種', () => {
    expect(formatTokenCount(950)).toBe('950')
    expect(formatTokenCount(23534)).toBe('23.5k')
    expect(formatTokenCount(64000)).toBe('64k')
    expect(formatTokenCount(117400)).toBe('117.4k')
    expect(formatTokenCount(1000000)).toBe('1M')
  })

  it('請求閘：同一段對話進行中不重複發，換對話就作廢舊的', () => {
    const gate = createPromptDiagnosticsRequestGate()
    const first = gate.begin('conv-1')
    expect(first).toBeTruthy()
    expect(gate.begin('conv-1')).toBeNull()
    expect(gate.isCurrent(first)).toBe(true)
    gate.invalidate()
    expect(gate.isCurrent(first)).toBe(false)
    expect(gate.finish(first)).toBe(false)
  })
})

describe('組成：彈窗畫出來的東西', () => {
  it('有容量時：一行「用了多少／容量」、用量條上有濃縮線、各部分一列、最後是剩餘空間', () => {
    const wrapper = mountSheet({ report: normalizeServerReport(serverReport({ window: WINDOW })) })
    const el = wrapper.element as HTMLElement
    expect(el.querySelector('.cb-summary-used')!.textContent).toBe('2k / 64k')
    expect(el.querySelector('.cb-summary-percent')!.textContent).toBe('3%')
    expect(el.querySelectorAll('.cb-bar-seg').length).toBe(8)
    expect((el.querySelector('.cb-bar-line') as HTMLElement).style.left).toBe('92%')
    expect(el.querySelector('.cb-hint')!.textContent).toBe('較早的劇情大約再過 12 輪會濃縮成摘要。')
    const rows = Array.from(el.querySelectorAll('.cb-row'))
    expect(rows.map((r) => r.getAttribute('data-key'))).toEqual(['system', 'roleCard', 'mod', 'notepad', 'userProfile', 'history', 'memory', 'currentInput', 'free'])
    expect(rows[0].querySelector('.cb-row-tokens')!.textContent).toBe('600')
    expect(rows[0].querySelector('.cb-row-percent')!.textContent).toBe('1%')
    const free = rows[rows.length - 1]
    expect(free.querySelector('.cb-row-title')!.textContent).toBe('剩餘空間')
    expect(free.querySelector('.cb-row-tokens')!.textContent).toBe('62k')
    expect(free.querySelector('.cb-row-percent')!.textContent).toBe('97%')
    // 模型回報的數字收在最後一行
    expect(el.querySelector('.cb-foot')!.textContent).toContain('實際輸入 Token 1,000')
    expect(el.querySelector('.cb-foot')!.textContent).toContain('快取命中率 80%')
    expect(el.querySelector('.cb-foot')!.textContent).toContain('本輪消耗 42 點')
    // 內部欄位不出現在畫面上
    expect(el.textContent).not.toContain('secret-model-name')
    wrapper.unmount()
  })

  it('濃縮線說明：剩一輪以內或已經到線就說「很快」，算不出輪數就說那條線是什麼', () => {
    const hint = (window: Record<string, unknown>) => {
      const wrapper = mountSheet({ report: normalizeServerReport(serverReport({ window: { ...WINDOW, ...window } })) })
      const text = (wrapper.element as HTMLElement).querySelector('.cb-hint')!.textContent
      wrapper.unmount()
      return text
    }
    expect(hint({ turnsLeft: 1 })).toBe('較早的劇情很快會濃縮成摘要。')
    expect(hint({ turnsLeft: null, usedTokens: 60000 })).toBe('較早的劇情很快會濃縮成摘要。')
    expect(hint({ turnsLeft: null })).toBe('較早的劇情會在用量到達那條線時濃縮成摘要。')
  })

  it('沒有容量時：只寫估算總數，不畫剩餘空間、濃縮線與說明', () => {
    const el = mountSheet({ report: normalizeServerReport(serverReport()) }).element as HTMLElement
    expect(el.querySelector('.cb-summary-used')!.textContent).toBe('995')
    expect(el.querySelector('.cb-summary-percent')!.textContent).toBe('估算 Token')
    expect(el.querySelector('.cb-bar-line')).toBeNull()
    expect(el.querySelector('.cb-hint')).toBeNull()
    expect(el.querySelector('[data-key="free"]')).toBeNull()
    expect(el.querySelector('.cb-row .cb-row-percent')!.textContent).toBe('30%')
  })

  it('MOD 那一列可以展開明細，每個 MOD 一列、名字跟著語言走', async () => {
    const wrapper = mountSheet({ report: normalizeServerReport(serverReport()), modDetailsExpanded: true, locale: 'en' })
    const el = wrapper.element as HTMLElement
    const names = Array.from(el.querySelectorAll('.cb-mod-detail-name')).map((n) => n.textContent)
    expect(names).toEqual(['Alpha', 'Beta'])
    const mod = el.querySelector<HTMLElement>('.cb-row[data-key="mod"]')!
    expect(mod.querySelector('.cb-row-sub')!.textContent).toContain('本輪使用 2 個 MOD')
    mod.click()
    expect(wrapper.emitted('toggle-mod-details')?.length).toBe(1)
    wrapper.unmount()
  })

  it('載入中：骨架，沒有列', () => {
    const el = mountSheet({ loading: true }).element as HTMLElement
    expect(el.querySelector('.cb-loading')).toBeTruthy()
    expect(el.querySelectorAll('.cb-row').length).toBe(0)
  })

  it('讀不到：一句話加重試，按了發 retry', async () => {
    const wrapper = mountSheet({ loadFailed: true })
    const el = wrapper.element as HTMLElement
    expect(el.querySelector('.cb-empty-text')!.textContent).toBe('讀不到')
    el.querySelector<HTMLElement>('.cb-retry')!.click()
    expect(wrapper.emitted('retry')?.length).toBe(1)
    wrapper.unmount()
  })

  it('不支援的模型：明確空狀態，不畫全 0 的用量條', () => {
    const el = mountSheet({ report: normalizeServerReport(serverReport({ supported: false, status: 'unsupportedModel' })) }).element as HTMLElement
    expect(el.querySelector('.cb-empty-text')!.textContent).toBe('目前的模型不支援')
    expect(el.querySelector('.cb-bar')).toBeNull()
    expect(el.querySelector('.cb-subtitle')!.textContent).toBe('目前的模型不支援')
  })

  it('還沒完成一輪：副標寫「完成一輪回覆後可查看」，不畫用量條也沒有列', () => {
    const raw = serverReport({ status: 'notReady', total: { charCount: 0, estimatedTokens: 0 }, billing: { available: false } })
    raw.items.forEach((i: any) => { i.estimatedTokens = 0; i.charCount = 0; i.percent = 0; i.sourceCount = 0 })
    const el = mountSheet({ report: normalizeServerReport(raw) }).element as HTMLElement
    expect(el.querySelector('.cb-subtitle')!.textContent).toBe('完成一輪回覆後可查看')
    expect(el.querySelector('.cb-bar')).toBeNull()
    expect(el.querySelectorAll('.cb-row').length).toBe(0)
    expect(el.querySelector('.cb-foot')!.textContent).not.toContain('本輪消耗')
  })

  it('關閉鍵發 close', async () => {
    const wrapper = mountSheet({ report: normalizeServerReport(serverReport()) })
    ;(wrapper.element as HTMLElement).querySelector<HTMLElement>('.cb-close')!.click()
    expect(wrapper.emitted('close')?.length).toBe(1)
    wrapper.unmount()
  })
})

describe('組成：吃得到作者的美化', () => {
  const source = readFileSync(resolve(__dirname, '../components/canvas-context-breakdown.vue'), 'utf8')
  const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')

  it('元件沒有自己的 <style>，樣式全在 canvas.css 的 layer 裡', () => {
    expect(source).not.toContain('<style')
    const start = css.indexOf('.context-breakdown-scope')
    expect(start).toBeGreaterThan(css.indexOf('@layer lt-base'))
  })

  it('只用瀏覽器原生標籤', () => {
    const template = source.slice(0, source.indexOf('<script'))
    for (const tag of ['view', 'text', 'image', 'textarea', 'input', 'scroll-view', 'button', 'navigator']) {
      expect(template).not.toMatch(new RegExp(`<${tag}[\\s/>]`))
    }
  })

  it('用量條不會被壓扁：矮螢幕上面板內容比面板高時，沒有字的條也要保住高度', () => {
    const start = css.indexOf('  .cb-bar {')
    const body = css.slice(start, css.indexOf('}', start))
    expect(body).toMatch(/flex: none;/)
  })

  it('這一段不寫 margin、不寫死深色底與灰字——底色與字色都從卡片的文字色調出來', () => {
    const start = css.indexOf('/* ── 這則回覆的組成')
    const end = css.indexOf('/* ── 手機')
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const block = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(block).not.toMatch(/(^|[^-])margin(-\w+)?\s*:/)
    expect(block).not.toMatch(/!\s*important/)
    // 只有用量條的分段用語意色（來自資料的 inline background），樣式本身不寫任何色碼
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(block).not.toMatch(/rgba?\(/)
  })
})

it('keeps the selected reply and actual usage separate from estimated composition', () => {
 const report = normalizeServerReport({supported:true,status:'ok',schemaVersion:2,conversationId:'fixture',chatId:'reply-one',items:[],total:{estimatedTokens:120,charCount:360},cache:{available:true,inputTokens:100,readTokens:20,hitRate:20},billing:{available:true,totalPoints:1,componentsAvailable:false,cacheHitRate:20}})!
 expect(report.chatId).toBe('reply-one')
 const wrapper=mount(CanvasContextBreakdown,{props:{report,loading:false,loadFailed:false,modDetailsExpanded:false,locale:'en',labels:{...LABELS,actualInputTokens:'Actual input'}}})
 expect(wrapper.find('.cb-summary-used').text()).toBe('120')
 expect(wrapper.find('.cb-foot').text()).toContain('Actual input 100')
 expect(wrapper.find('.cb-foot').text()).toContain('快取命中率 20%')
})

it('rejects a late response when another reply in the same conversation is selected',()=>{
 const gate=createPromptDiagnosticsRequestGate()
 const first=gate.begin('conversation:reply-one')!
 const second=gate.begin('conversation:reply-two')!
 expect(gate.isCurrent(first)).toBe(false)
 expect(gate.isCurrent(second)).toBe(true)
})

it('does not turn missing historical cache usage into a measured zero',()=>{
 const report=normalizeServerReport({supported:true,status:'ok',items:[],cache:{available:false,hitRate:null},billing:{available:true,totalPoints:1,componentsAvailable:false,cacheHitRate:null}})!
 expect(report.billing.cacheHitRate).toBeNull()
 expect(report.cache.hitRate).toBeNull()
})

// ── 沒有 MOD 的供應商（HarperHarbor）──────────────────────────────────
//
// 同一份舞台同時接 LunaTalk（有 MOD）與 HarperHarbor（沒有 MOD）。舞台不知道
// 自己接的是哪一家，能看的只有報告本身：MOD 那桶沒有 token、也沒有明細，就代表
// 這一家沒有 MOD 可講，那一列與 MOD 相關的字都不該出現。
function harborReport() {
  const raw = serverReport()
  ;(raw.items as any[])[2] = { key: 'mod', labelKey: 'prompt.mod', color: '#6831FF', available: false, sourceCount: 0, charCount: 0, estimatedTokens: 0, percent: 0, detailsAvailable: false }
  return raw
}

describe('上下文用量：沒有 MOD 的供應商', () => {
  it('MOD 那桶沒有資料：判定為沒有 MOD，列表不列 MOD', () => {
    const report = normalizeServerReport(harborReport())!
    expect(promptBreakdownHasModData(report)).toBe(false)
    expect(visiblePromptBreakdownItems(report.items).map((i) => i.key)).not.toContain('mod')
  })

  it('彈窗不畫 MOD 那一列，也沒有任何 MOD 字樣', () => {
    const wrapper = mountSheet({ report: normalizeServerReport(harborReport()) })
    const el = wrapper.element as HTMLElement
    const titles = Array.from(el.querySelectorAll('.cb-row-title')).map((n) => n.textContent)
    expect(titles).not.toContain('MOD')
    expect(el.querySelectorAll('.cb-row').length).toBe(7)
    expect(el.textContent).not.toContain('MOD')
    wrapper.unmount()
  })

  it('有 MOD 的供應商照舊：MOD 有 token 時那一列還在', () => {
    const report = normalizeServerReport(serverReport())!
    expect(promptBreakdownHasModData(report)).toBe(true)
    expect(visiblePromptBreakdownItems(report.items).map((i) => i.key)).toContain('mod')
  })
})

describe('上下文用量：五語文案', () => {
  const locales = ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko'] as const
  const table = (l: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../locale', l + '.json'), 'utf8')) as Record<string, string>
  const expectedTitle: Record<string, string> = {
    'zh-Hant': '上下文用量', 'zh-Hans': '上下文用量', en: 'Context usage', ja: 'コンテキスト使用量', ko: '컨텍스트 사용량',
  }

  it('標題叫「上下文用量」；圓環的說明帶百分比，選單裡有「這一輪的用量」', () => {
    for (const l of locales) {
      const t = table(l)
      expect(t['promptBreakdown.title']).toBe(expectedTitle[l])
      expect(t['canvas.context.ring'], l).toContain('{percent}')
      expect(t['canvas.context.hintTurns'], l).toContain('{n}')
      for (const key of ['canvas.context.thisTurn', 'canvas.context.free', 'canvas.context.hintLine', 'canvas.context.hintNow']) {
        expect(t[key], l + ' ' + key).toBeTruthy()
      }
    }
  })

  it('一般副標、讀取失敗與不支援的文案都不提 MOD，也不再叫「這則回覆的組成」', () => {
    for (const l of locales) {
      const t = table(l)
      for (const key of ['promptBreakdown.subtitle', 'promptBreakdown.loadError', 'promptBreakdown.unsupportedModel']) {
        expect(t[key], l + ' ' + key).toBeTruthy()
        expect(t[key], l + ' ' + key).not.toMatch(/MOD/)
      }
      expect(Object.values(t).join('\n')).not.toMatch(/這則回覆的組成|这则回复的组成|What's in this reply|この返信の内訳|이 답장의 구성/)
      expect(t).not.toHaveProperty('promptBreakdown.modDetailsLoadError')
    }
  })
})

// 伺服器給的命中率是原始比例（例如 91.59398…）：面板只要到小數一位，整數不帶小數。
describe('formatHitRate', () => {
  it('rounds to one decimal and drops a trailing .0', async () => {
    const { formatHitRate } = await import('../canvas-context-breakdown')
    expect(formatHitRate(91.59398496240601)).toBe('91.6')
    expect(formatHitRate(80)).toBe('80')
    expect(formatHitRate(99.96)).toBe('100')
    expect(formatHitRate(0.04)).toBe('0')
    expect(formatHitRate(null)).toBe('--')
    expect(formatHitRate(Number.NaN)).toBe('--')
  })
  it('is what the panel shows', async () => {
    const { readFileSync } = await import('node:fs')
    const vue = readFileSync('src/pages/canvas/components/canvas-context-breakdown.vue', 'utf8')
    expect(vue).toContain('formatHitRate(report.billing.cacheHitRate)')
  })
})
