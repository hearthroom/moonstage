import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import messages from '@/locale/index.js'
import {
  buildDirectiveSetsView,
  canSaveDirectiveSet,
  clampSetTitle,
  createDirectiveSetsState,
  openDirectiveSets,
  readCardDirectiveChoice,
  readDirectivePresetsResponse,
  type DirectiveItem,
  type DirectiveSetsState,
} from '../canvas-directives'

const i18n = createI18n({ legacy: false, locale: 'zh-Hant', fallbackLocale: 'en', messages })
const tFor = (locale: string) => {
  return (key: string, named?: Record<string, unknown>, plural?: number) => {
    i18n.global.locale.value = locale as any
    return plural === undefined ? i18n.global.t(key, named || {}) : i18n.global.t(key, named || {}, plural)
  }
}

const sets = (over: Partial<DirectiveSetsState> = {}): DirectiveSetsState => ({
  ...createDirectiveSetsState(),
  loaded: true,
  list: [
    { presetId: 'p1', title: '睡前輕鬆', items: ['短段落', '不要說教', '多描寫環境'], cardCount: 1 },
    { presetId: 'p2', title: 'Battle', items: ['戰術清楚'], cardCount: 0 },
  ],
  ...over,
})
const items = (...origins: string[]): DirectiveItem[] => origins.map((origin, i) => ({ sourceId: `d${i}`, text: `t${i}`, origin }))
const ctx = { t: tFor('zh-Hant'), hasConversation: true, streaming: false, canManage: true }

describe('讀伺服器回應', () => {
  it('指令組清單與上限', () => {
    const out = readDirectivePresetsResponse({ list: [{ presetId: 'a', title: 'A', items: ['x'], cardCount: 2 }, { title: 'no id' }], maxCount: 20, maxTitle: 40 })
    expect(out.list).toEqual([{ presetId: 'a', title: 'A', items: ['x'], cardCount: 2 }])
    expect(out.maxCount).toBe(20)
    expect(readDirectivePresetsResponse(null).maxTitle).toBe(40)
  })
  it('卡片選擇只在讀清單時有；新增的回應沒帶就不要蓋掉', () => {
    expect(readCardDirectiveChoice({ list: [], cardPresetId: 'p1', cardPresetChosen: true })).toEqual({ cardPresetId: 'p1', cardChosen: true })
    expect(readCardDirectiveChoice({ success: 'ok', list: [] })).toBeNull()
  })
})

describe('換一組前的摘要', () => {
  it('存檔現在有手動與 AI 整理的條目：說換掉幾條、其中 AI 幾條、放進幾條，並提示先存', () => {
    const vm = buildDirectiveSetsView({ list: items('manual', 'manual', 'ai') }, sets({ view: 'sets', scope: 'save', picked: 'p1' }), ctx)
    expect(vm.sets.summary).toBe('換成「睡前輕鬆」：這個存檔現在的 3 條會被換掉（含 AI 整理的 1 條），放進這組的 3 條。')
    expect(vm.sets.keepHint).toContain('3 條')
    expect(vm.sets.canApply).toBe(true)
  })
  it('存檔本來就空：只說放進幾條，不提示先存', () => {
    const vm = buildDirectiveSetsView({ list: [] }, sets({ view: 'sets', scope: 'save', picked: 'p2' }), ctx)
    expect(vm.sets.summary).toBe('換成「Battle」：放進這組的 1 條。')
    expect(vm.sets.keepHint).toBe('')
  })
  it('英文單複數', () => {
    const one = buildDirectiveSetsView({ list: items('manual') }, sets({ view: 'sets', scope: 'save', picked: 'p1' }), { ...ctx, t: tFor('en') })
    expect(one.sets.summary).toMatch(/the 1 instruction in this save/)
    const many = buildDirectiveSetsView({ list: items('manual', 'manual') }, sets({ view: 'sets', scope: 'save', picked: 'p1' }), { ...ctx, t: tFor('en') })
    expect(many.sets.summary).toMatch(/the 2 instructions in this save/)
  })
  it('還沒選：換不了；對話還沒建立：這個存檔那格停用並說原因', () => {
    expect(buildDirectiveSetsView({ list: [] }, sets({ view: 'sets', scope: 'save' }), ctx).sets.canApply).toBe(false)
    const noConv = buildDirectiveSetsView({ list: [] }, sets({ view: 'sets', scope: 'save', picked: 'p1' }), { ...ctx, hasConversation: false })
    expect(noConv.sets.saveScopeDisabled).toBe(true)
    expect(noConv.sets.canApply).toBe(false)
    expect(noConv.sets.summary).toBe(ctx.t('directive.set.noConversation'))
  })
  it('串流中照樣能換，摘要多一句從下一次回覆生效', () => {
    const vm = buildDirectiveSetsView({ list: [] }, sets({ view: 'sets', scope: 'save', picked: 'p1' }), { ...ctx, streaming: true })
    expect(vm.sets.canApply).toBe(true)
    expect(vm.sets.note).toBe(ctx.t('directive.set.streamingNote'))
  })
})

describe('這張卡的新存檔', () => {
  it('從「更換」進來選中目前那一組；沒改就停用並寫已經是這一組', () => {
    const opened = openDirectiveSets(sets({ cardPresetId: 'p1', cardChosen: true }), 'card')
    expect(opened.picked).toBe('p1')
    const vm = buildDirectiveSetsView({ list: [] }, opened, ctx)
    expect(vm.sets.rows[0]).toMatchObject({ id: '', title: ctx.t('directive.set.none') })
    expect(vm.sets.canApply).toBe(false)
    // 「已經是這一組」自成一行，不接在摘要句尾
    expect(vm.sets.already).toBe(ctx.t('directive.set.already'))
    expect(vm.sets.summary).not.toContain(ctx.t('directive.set.already'))
    expect(vm.sets.applyLabel).toBe(ctx.t('directive.set.card.apply'))
  })
  it('選不自動帶上', () => {
    const vm = buildDirectiveSetsView({ list: [] }, { ...openDirectiveSets(sets({ cardPresetId: 'p1', cardChosen: true }), 'card'), picked: '' }, ctx)
    expect(vm.sets.summary).toBe(ctx.t('directive.set.card.sumNone'))
    expect(vm.sets.canApply).toBe(true)
  })
  it('來源區顯示目前那一組；那一組被刪了就是不自動帶上', () => {
    expect(buildDirectiveSetsView({ list: [] }, sets({ cardPresetId: 'p2', cardChosen: true }), ctx).source.cardValue).toBe('Battle')
    expect(buildDirectiveSetsView({ list: [] }, sets({ cardPresetId: 'gone', cardChosen: true }), ctx).source.cardValue).toBe(ctx.t('directive.set.none'))
  })
})

describe('升級提示與存成指令組', () => {
  it('卡沒選過且存檔有指令才提示；選過、按過不再提示、還沒讀到都不提示', () => {
    expect(buildDirectiveSetsView({ list: items('manual') }, sets(), ctx).upgrade.show).toBe(true)
    expect(buildDirectiveSetsView({ list: [] }, sets(), ctx).upgrade.show).toBe(false)
    expect(buildDirectiveSetsView({ list: items('manual') }, sets({ cardChosen: true }), ctx).upgrade.show).toBe(false)
    expect(buildDirectiveSetsView({ list: items('manual') }, sets({ upgradeDismissed: true }), ctx).upgrade.show).toBe(false)
    expect(buildDirectiveSetsView({ list: items('manual') }, sets({ loaded: false }), ctx).upgrade.show).toBe(false)
  })
  it('存成指令組：要名稱、要有條目、沒滿', () => {
    expect(canSaveDirectiveSet(sets({ name: ' ' }), 2)).toBe(false)
    expect(canSaveDirectiveSet(sets({ name: '晚安' }), 0)).toBe(false)
    expect(canSaveDirectiveSet(sets({ name: '晚安' }), 2)).toBe(true)
    const full = sets({ name: '晚安', maxCount: 2 })
    expect(canSaveDirectiveSet(full, 2)).toBe(false)
    expect(buildDirectiveSetsView({ list: items('manual') }, { ...full, view: 'save-as' }, ctx).saveAs.full).toBe(ctx.t('directive.set.error.full', { max: 2 }))
  })
  it('卡名當組名時超過上限就截', () => {
    expect(clampSetTitle('  ' + '名'.repeat(45), 40)).toBe('名'.repeat(40))
    expect(clampSetTitle('短名', 40)).toBe('短名')
  })
})

describe('讀取與寫入失敗怎麼分', () => {
  it('路徑不存在的 404 是舊供應商：整區不畫；卡玩不到的 404 只是這次讀不到，可以重試', async () => {
    const { directiveSetsLoadOutcome } = await import('../canvas-directives')
    expect(directiveSetsLoadOutcome(200, { list: [] })).toBe('ok')
    expect(directiveSetsLoadOutcome(404, '404 page not found')).toBe('unsupported')
    expect(directiveSetsLoadOutcome(404, { error: 'not_found' })).toBe('failed')
    expect(directiveSetsLoadOutcome(500, { error: 'server_error' })).toBe('failed')
  })
  it('那一組已經被刪掉：要重讀清單，別讓它留在畫面上', async () => {
    const { directiveSetsErrorKind } = await import('../canvas-directives')
    expect(directiveSetsErrorKind({ statusCode: 400, data: { error: 'DIRECTIVE_PRESET_NOT_FOUND' } })).toBe('gone')
    expect(directiveSetsErrorKind({ statusCode: 400, data: { error: 'DIRECTIVE_PRESET_LIMIT_REACHED' } })).toBe('full')
    expect(directiveSetsErrorKind(new Error('timeout'))).toBe('network')
    expect(directiveSetsErrorKind({ statusCode: 503, data: {} })).toBe('other')
  })
})

describe('升級提示失敗：指令組滿了要給出路', () => {
  it('滿了才顯示管理連結', () => {
    const full = buildDirectiveSetsView({ list: items('manual') }, sets({ upgradeError: 'x', upgradeFull: true }), ctx)
    expect(full.upgrade.full).toBe(true)
    expect(buildDirectiveSetsView({ list: items('manual') }, sets({ upgradeError: 'x' }), ctx).upgrade.full).toBe(false)
  })
})

describe('主按鈕與摘要跟著選取', () => {
  it('卡片範圍選「不自動帶上」：主按鈕寫改為不自動帶上', () => {
    const vm = buildDirectiveSetsView({ list: [] }, { ...openDirectiveSets(sets({ cardPresetId: 'p1', cardChosen: true }), 'card'), picked: '' }, ctx)
    expect(vm.sets.applyLabel).toBe(ctx.t('directive.set.card.applyNone'))
  })
  it('這個存檔還沒選組：摘要說選了會看到什麼，不留白', () => {
    const vm = buildDirectiveSetsView({ list: items('manual') }, sets({ view: 'sets', scope: 'save' }), ctx)
    expect(vm.sets.summary).toBe(ctx.t('directive.set.save.pickHint'))
  })
})
