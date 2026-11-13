/**
 * 擴充（工坊）在畫布上的三件事：
 *   一、擴充帶的開場併在原卡開場後面，選到它時開對話要走「帶開場新開」，不能退回原卡的開場序號。
 *   二、這場對話的擴充（伺服器回的檢視）：開場來源 chip 的名字、入口小圓點只在有常駐降為觸發載入時亮。
 *   三、顯示資產的 hash 變了才重建規則安裝；沒擴充（空 hash）也是一種狀態。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasMessage from '../components/canvas-message.vue'
import CanvasHeader from '../components/canvas-header.vue'
import {
  normalizeWorkshopOpenings,
  composeOpenings,
  openingStartTarget,
  normalizeWorkshopView,
  workshopAlert,
  needsAssetRebuild,
  assetWorkshopHash,
  selectedOpeningExtras,
  viewOpeningSource,
  preselectOpening,
} from '../canvas-workshop'

const snow = {
  workshopId: 'w1', workshopName: '雪夜篇', openingId: 'o1', mode: 'greeting',
  greeting: '燈塔的光已經三天沒亮了。', openingPage: '', prologue: ['我去看看燈塔。'],
}

describe('擴充開場併入原卡開場', () => {
  it('原卡在前、擴充依伺服器順序在後，來源一一對上', () => {
    const openings = normalizeWorkshopOpenings({ items: [snow, { ...snow, openingId: 'o2', greeting: '第二條' }] })
    const { list, sources } = composeOpenings(['原卡主', '原卡備選'], openings)
    expect(list).toEqual(['原卡主', '原卡備選', '燈塔的光已經三天沒亮了。', '第二條'])
    expect(sources.map((s) => s.kind)).toEqual(['base', 'base', 'workshop', 'workshop'])
    expect(sources[3]).toMatchObject({ workshopId: 'w1', openingId: 'o2', workshopName: '雪夜篇' })
  })

  it('沒有擴充開場時清單與原卡完全一樣', () => {
    const { list, sources } = composeOpenings(['原卡主'], normalizeWorkshopOpenings(undefined))
    expect(list).toEqual(['原卡主'])
    expect(sources).toEqual([{ kind: 'base' }])
  })

  it('壞資料丟掉：沒有 id、greeting 模式沒字、page 模式沒網頁', () => {
    const openings = normalizeWorkshopOpenings({ items: [
      { ...snow, workshopId: '' },
      { ...snow, openingId: 'o3', greeting: '  ' },
      { ...snow, openingId: 'o4', mode: 'page', greeting: '', openingPage: '' },
      { ...snow, openingId: 'o5', mode: 'page', greeting: '', openingPage: '<p>網頁</p>' },
      null,
    ] })
    expect(openings.map((o) => o.openingId)).toEqual(['o5'])
  })

  it('prologue 只留非空字串', () => {
    const [o] = normalizeWorkshopOpenings({ items: [{ ...snow, prologue: ['a', '', 3, ' b '] }] })
    expect(o.prologue).toEqual(['a', ' b '])
  })
})

describe('開對話帶的開場', () => {
  const { sources } = composeOpenings(['原卡主', '原卡備選'], normalizeWorkshopOpenings({ items: [snow] }))

  it('選原卡開場：沒有擴充目標，照舊帶序號', () => {
    expect(openingStartTarget(sources, 1)).toBeNull()
  })

  it('選擴充開場：帶 workshopId 與 openingId', () => {
    expect(openingStartTarget(sources, 2)).toEqual({ kind: 'workshop', workshopId: 'w1', openingId: 'o1' })
  })

  it('序號超出清單：當原卡處理', () => {
    expect(openingStartTarget(sources, 9)).toBeNull()
  })

  it('作者試玩：原卡開場也走帶開場新開，帶第幾條', () => {
    expect(openingStartTarget(sources, 1, true)).toEqual({ kind: 'base', index: 1 })
    expect(openingStartTarget(sources, 2, true)).toEqual({ kind: 'workshop', workshopId: 'w1', openingId: 'o1' })
    expect(openingStartTarget(sources, 9, true)).toEqual({ kind: 'base', index: 0 })
  })

  it('試玩網址指定的開場：base 或找不到停在原卡主開場', () => {
    expect(preselectOpening(sources, 'o1')).toBe(2)
    expect(preselectOpening(sources, 'base')).toBe(0)
    expect(preselectOpening(sources, 'nope')).toBe(0)
    expect(preselectOpening(sources, '')).toBe(0)
    // 試玩草稿的開場用位置當 id（welcome／alt-<n>）
    const draft = composeOpenings(['原卡主'], normalizeWorkshopOpenings({ items: [{ ...snow, openingId: 'welcome' }, { ...snow, openingId: 'alt-1', greeting: '備選' }] })).sources
    expect(preselectOpening(draft, 'alt-1')).toBe(2)
    expect(preselectOpening(draft, 'welcome')).toBe(1)
  })
})

describe('選中開場附帶的開場網頁與開場選項', () => {
  const base = { openingPage: '<p>原卡</p>', openingMode: 'greeting', prologue: ['原卡選項'] }
  const { sources } = composeOpenings(['原卡主'], normalizeWorkshopOpenings({ items: [
    snow,
    { ...snow, openingId: 'o2', mode: 'page', greeting: '', openingPage: '<p>擴充網頁</p>', prologue: [] },
  ] }))

  it('原卡開場用原卡的', () => {
    expect(selectedOpeningExtras(sources[0], base)).toEqual(base)
  })

  it('擴充開場換成它自己的，沒有網頁就沒有', () => {
    expect(selectedOpeningExtras(sources[1], base)).toEqual({ openingPage: '', openingMode: 'greeting', prologue: ['我去看看燈塔。'] })
    expect(selectedOpeningExtras(sources[2], base)).toEqual({ openingPage: '<p>擴充網頁</p>', openingMode: 'page', prologue: [] })
  })
})

describe('這場對話的擴充', () => {
  const raw = {
    selectionRevision: 3, manifestHash: 'h1',
    openingSource: { kind: 'workshop', workshopId: 'w1', workshopName: '雪夜篇', openingId: 'o1' },
    items: [
      { workshopId: 'w1', name: '雪夜篇', coverUrl: 'https://x/c.png', kinds: ['lore', 'opening', 'bogus'], residentChars: 620, status: 'triggered' },
      { workshopId: 'w2', name: '日誌介面', kinds: ['display'], residentChars: 0, status: 'resident' },
      { workshopId: '', name: '壞的' },
    ],
    triggeredCount: 1,
  }

  it('正規化：丟壞列、未知種類與狀態不放行', () => {
    const view = normalizeWorkshopView({ ...raw, capacityRevision: 4 })!
    expect(view.capacityRevision).toBe(4)
    expect(normalizeWorkshopView(raw)!.capacityRevision).toBe(0)
    expect(view.items.map((i) => i.workshopId)).toEqual(['w1', 'w2'])
    expect(view.items[0].kinds).toEqual(['lore', 'opening'])
    expect(view.items[0].status).toBe('triggered')
    expect(normalizeWorkshopView({ ...raw, items: [{ workshopId: 'w3', name: 'x', status: '怪' }] })!.items[0].status).toBe('resident')
  })

  it('讀不到或不是物件：null', () => {
    expect(normalizeWorkshopView(null)).toBeNull()
    expect(normalizeWorkshopView('x')).toBeNull()
  })

  it('重新整理後的開場來源：照伺服器記下的開場網頁與開場選項', () => {
    const view = normalizeWorkshopView({ ...raw, openingSource: { ...raw.openingSource, mode: 'page', openingPage: '<p>頁</p>', prologue: ['走吧', ''] } })!
    expect(viewOpeningSource(view)).toMatchObject({ kind: 'workshop', workshopName: '雪夜篇', mode: 'page', openingPage: '<p>頁</p>', prologue: ['走吧'] })
    expect(viewOpeningSource(normalizeWorkshopView({ ...raw, openingSource: { kind: 'base' } })!)).toEqual({ kind: 'base' })
  })

  it('小圓點：有常駐降為觸發載入才亮；件數以列為準，不只信 triggeredCount', () => {
    expect(workshopAlert(normalizeWorkshopView(raw))).toBe(true)
    const none = normalizeWorkshopView({ ...raw, triggeredCount: 0, items: raw.items.map((i) => ({ ...i, status: 'resident' })) })
    expect(workshopAlert(none)).toBe(false)
    expect(workshopAlert(normalizeWorkshopView({ ...raw, triggeredCount: undefined }))).toBe(true)
    expect(workshopAlert(null)).toBe(false)
  })
})

describe('顯示資產重建', () => {
  it('讀資產的 hash：沒有欄位＝空字串', () => {
    expect(assetWorkshopHash({ workshopHash: 'abc' })).toBe('abc')
    expect(assetWorkshopHash({})).toBe('')
    expect(assetWorkshopHash(null)).toBe('')
  })

  it('還沒裝過不算重建；hash 一樣不重建；不同（含變空）才重建', () => {
    expect(needsAssetRebuild(null, 'a')).toBe(false)
    expect(needsAssetRebuild('a', 'a')).toBe(false)
    expect(needsAssetRebuild('', '')).toBe(false)
    expect(needsAssetRebuild('a', 'b')).toBe(true)
    expect(needsAssetRebuild('a', '')).toBe(true)
    expect(needsAssetRebuild('', 'b')).toBe(true)
  })
})

describe('畫面：開場來源 chip 與資訊入口的小圓點（一般頁與沙箱殼共用這兩個元件）', () => {
  const BASE = { mesid: 0, role: 'ai' as const, name: '月港', avatar: '', html: '<p>燈塔</p>', finished: true }

  it('開場來自擴充：氣泡上方畫 chip；沒有來源不畫', () => {
    const on = mount(CanvasMessage, { props: { message: { ...BASE, origin: '來自「雪夜篇」' } } })
    expect(on.find('[data-lt="opening-origin"]').text()).toBe('來自「雪夜篇」')
    expect(on.find('.mes_text').classes()).not.toContain('is-origin-only')
    const off = mount(CanvasMessage, { props: { message: BASE } })
    expect(off.find('[data-lt="opening-origin"]').exists()).toBe(false)
  })

  it('只有開場網頁的擴充開場：留 chip，氣泡收起（不畫空氣泡）', () => {
    const w = mount(CanvasMessage, { props: { message: { ...BASE, html: '', origin: '來自「雪夜篇」', swipes: { index: 1, total: 2 } } } })
    expect(w.find('[data-lt="opening-origin"]').exists()).toBe(true)
    expect(w.find('.mes_text').classes()).toContain('is-origin-only')
    expect(w.find('.swipes-counter').exists()).toBe(true)
  })

  it('小圓點：有字樣才畫；字樣同時給讀屏（aria-description）與滑鼠提示', () => {
    const props = { roleName: '月港', avatar: '', commentsSupported: true, commentsLabel: '卡片資訊' }
    const lit = mount(CanvasHeader, { props: { ...props, commentsAlert: '有 1 個擴充的常駐內容改為關鍵詞觸發' } })
    const toggle = lit.find('.comments-toggle')
    expect(toggle.attributes('aria-label')).toBe('卡片資訊')
    expect(toggle.attributes('aria-description')).toBe('有 1 個擴充的常駐內容改為關鍵詞觸發')
    expect(lit.find('.comments-alert').attributes('title')).toBe('有 1 個擴充的常駐內容改為關鍵詞觸發')
    const plain = mount(CanvasHeader, { props: { ...props, commentsAlert: '' } })
    expect(plain.find('.comments-alert').exists()).toBe(false)
    expect(plain.find('.comments-toggle').attributes('aria-description')).toBeUndefined()
  })
})
