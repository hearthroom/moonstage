/**
 * 模型清單的兩層與線路收合。
 *
 * 用的是正式站真的回過的那一份目錄切片（`fixtures/model-catalog-live.json`）——
 * 收合、去重、基礎代號換算三件事都只在真實形狀下才會出事：假資料裡沒有二十四條
 * 線路的家族，也沒有同時掛在兩個群組底下的模型。
 */
import { describe, it, expect } from 'vitest'
import live from './fixtures/model-catalog-live.json'
import {
  LANE_VISIBLE_LIMIT,
  buildFamilyList,
  laneTagOf,
  isDeadLane,
  isFamilySelected,
  primaryVariant,
  visibleLanes,
  hiddenLaneCount,
  composeModelDisplayName,
  resolveStoredModel,
  createModelLookup,
} from '../canvas-model-lanes'
import { resolveVariant } from '../canvas-model-catalog'

const CLAUDE_BASE = 'relay-claude-sonnet-4-5'
const CLAUDE_RIPPLE = 'relay-claude-sonnet-4-5-ripple'
const CLAUDE_STABLE1 = 'official-claude-sonnet-4-5'

function familyNamed(name: string) {
  return buildFamilyList(live as any).find((f) => f.family === name)!
}

describe('模型清單攤成一顆一列', () => {
  it('同一顆模型同時掛在兩個群組底下時只出現一次，留最前面那一份', () => {
    const list = buildFamilyList(live as any)
    const names = list.map((f) => f.family)
    expect(names.filter((n) => n === 'DeepSeek V4 Flash').length).toBe(1)
    expect(list[0].family).toBe('DeepSeek V4 Flash')
    expect(list[0].group).toBe('Global Top')
  })

  it('每一顆模型帶著它自己的線路，次序照伺服器給的（便宜到貴）', () => {
    const claude = familyNamed('Claude Sonnet 4.5')
    expect(claude.variants.map((v) => v.value)).toEqual([
      CLAUDE_RIPPLE, 'relay-claude-sonnet-4-5-drizzle', CLAUDE_STABLE1, 'relay2-claude-sonnet-4-5',
    ])
    expect(claude.variants[0].costScore).toBeLessThanOrEqual(claude.variants[3].costScore!)
  })

  it('空目錄不炸', () => {
    expect(buildFamilyList(null)).toEqual([])
    expect(buildFamilyList([{ group: 'g' } as any])).toEqual([])
  })

  it('代表線路是玩家選的那條，沒選過就是最便宜的那條', () => {
    const claude = familyNamed('Claude Sonnet 4.5')
    expect(primaryVariant(claude, '')!.value).toBe(CLAUDE_RIPPLE)
    expect(primaryVariant(claude, CLAUDE_STABLE1)!.value).toBe(CLAUDE_STABLE1)
    expect(primaryVariant(null, '')).toBe(null)
  })

  it('標得出哪一顆模型是現在用的', () => {
    const claude = familyNamed('Claude Sonnet 4.5')
    expect(isFamilySelected(claude, CLAUDE_RIPPLE)).toBe(true)
    expect(isFamilySelected(claude, 'deepseek-v4-flash-ripple')).toBe(false)
    expect(isFamilySelected(claude, '')).toBe(false)
  })
})

describe('線路收合：自己接的在前，名冊補位到四條', () => {
  const deepseek = () => familyNamed('DeepSeek V4 Flash')
  const listedOf = () => deepseek().variants.filter((v) => (v as any).laneAutoListed)
  const manual = (value: string, laneTag = '') => ({ value, laneTag }) as any
  const withOfficialAt = (i: number) =>
    listedOf().map((v, j) => (j === i ? { ...v, laneTag: 'official' } : v)) as any[]
  const values = (xs: any[]) => xs.map((v) => v.value)

  it('線路少的家族全部露出來，也沒有展開鍵', () => {
    const claude = familyNamed('Claude Sonnet 4.5')
    expect(visibleLanes(claude.variants, CLAUDE_RIPPLE, false).length).toBe(4)
    expect(hiddenLaneCount(claude.variants, CLAUDE_RIPPLE, false)).toBe(0)
  })

  it('手配兩條、名冊沒有官方：補最便宜的兩條', () => {
    const family = deepseek()
    const shown = visibleLanes(family.variants, 'deepseek-v4-flash-ripple', false)
    expect(values(shown)).toEqual([
      'deepseek-v4-flash-ripple', 'deepseek-v4-flash-mist', family.variants[2].value, family.variants[3].value,
    ])
    expect(hiddenLaneCount(family.variants, 'deepseek-v4-flash-ripple', false)).toBe(family.variants.length - LANE_VISIBLE_LIMIT)
  })

  it('手配兩條都不是官方、名冊有官方：補一條官方加一條最便宜的', () => {
    const listed = withOfficialAt(5)
    const shown = visibleLanes([manual('a', 'value'), manual('b', 'value'), ...listed], '', false)
    expect(values(shown)).toEqual(['a', 'b', listed[0].value, listed[5].value])
  })

  it('手配裡已經有官方：名冊不再補官方，只補最便宜的', () => {
    const listed = withOfficialAt(5)
    const shown = visibleLanes([manual('a', 'value'), manual('o', 'official'), ...listed], '', false)
    expect(values(shown)).toEqual(['a', 'o', listed[0].value, listed[1].value])
  })

  it('手配一條：補一條官方加兩條最便宜的', () => {
    const listed = withOfficialAt(7)
    const shown = visibleLanes([manual('a', 'value'), ...listed], '', false)
    expect(values(shown)).toEqual(['a', listed[0].value, listed[1].value, listed[7].value])
  })

  it('沒有手配：名冊自己補四條；供應商不夠就有幾條補幾條', () => {
    const listed = withOfficialAt(0)
    expect(values(visibleLanes(listed, '', false))).toEqual(values(listed.slice(0, 4)))
    expect(values(visibleLanes(listed.slice(0, 3), '', false))).toEqual(values(listed.slice(0, 3)))
    expect(hiddenLaneCount(listed.slice(0, 3), '', false)).toBe(0)
  })

  it('手配已經滿四條：名冊一條都不露，自己接的也不收', () => {
    const shown = visibleLanes([manual('a'), manual('b'), manual('c'), manual('d'), manual('e'), ...listedOf()], '', false)
    expect(values(shown)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('自己接的永遠排在最前面，就算伺服器把它排在名冊後面', () => {
    const listed = listedOf()
    const shown = visibleLanes([...listed, manual('bare', 'official')], '', false)
    expect(shown[0].value).toBe('bare')
    expect(values(visibleLanes([...listed, manual('bare')], '', true))[0]).toBe('bare')
  })

  it('玩家現在用的那條就算不在補位名單裡也一定看得到', () => {
    const family = deepseek()
    const last = family.variants[family.variants.length - 1]
    const shown = visibleLanes(family.variants, last.value, false)
    expect(shown.some((v) => v.value === last.value)).toBe(true)
    expect(shown.length).toBe(LANE_VISIBLE_LIMIT + 1)
  })

  it('展開就全部給，展開鍵在展開之後還在', () => {
    const family = deepseek()
    expect(visibleLanes(family.variants, '', true).length).toBe(family.variants.length)
    expect(hiddenLaneCount(family.variants, '', false)).toBeGreaterThan(0)
    expect(hiddenLaneCount(family.variants, '', true)).toBe(family.variants.length - LANE_VISIBLE_LIMIT)
  })

  it('沒有線路也不炸', () => {
    expect(visibleLanes(null, '', false)).toEqual([])
    expect(hiddenLaneCount(undefined, '', false)).toBe(0)
  })
})

describe('壞掉的線路不列出來', () => {
  const dead = (value: string, extra: any = {}) =>
    ({ value, laneAutoListed: true, status: { uptime: { percent24h: 0, samples24h: 90 } }, ...extra }) as any
  const ok = (value: string, extra: any = {}) =>
    ({ value, laneAutoListed: true, status: { uptime: { percent24h: 99, samples24h: 90 } }, ...extra }) as any

  it('近 24 小時幾乎沒有成功、樣本又夠的才算壞；樣本不足不下結論', () => {
    expect(isDeadLane(dead('a'))).toBe(true)
    expect(isDeadLane({ status: { uptime: { percent24h: 0, samples24h: 3 } } })).toBe(false)
    expect(isDeadLane({ status: { uptime: { percent24h: 40, samples24h: 90 } } })).toBe(false)
    expect(isDeadLane({})).toBe(false)
  })

  it('壞掉的官方不拿來補位，改補下一家活著的官方', () => {
    const lanes = [
      { value: 'relay', laneTag: 'value' } as any,
      ok('cheap'), dead('dead-official', { laneTag: 'official' }), ok('ok2'), ok('alive-official', { laneTag: 'official' }),
    ]
    expect(visibleLanes(lanes, '', false).map((v: any) => v.value)).toEqual(['relay', 'cheap', 'ok2', 'alive-official'])
    expect(visibleLanes(lanes, '', true).map((v: any) => v.value)).not.toContain('dead-official')
    expect(hiddenLaneCount(lanes, '', false)).toBe(0)
  })

  it('玩家正在用的那條就算壞了也看得到', () => {
    const lanes = [ok('a'), dead('b')]
    expect(visibleLanes(lanes, 'b', false).map((v: any) => v.value)).toEqual(['a', 'b'])
  })
})

describe('線路標籤', () => {
  it('只認伺服器給的 official / value，其他一律不標', () => {
    expect(laneTagOf({ laneTag: 'official' })).toBe('official')
    expect(laneTagOf({ laneTag: 'value' })).toBe('value')
    expect(laneTagOf({ laneTag: 'premium' })).toBe('')
    expect(laneTagOf({})).toBe('')
    expect(laneTagOf(null)).toBe('')
  })
})

describe('顯示名', () => {
  it('模型名加線路名', () => {
    const claude = familyNamed('Claude Sonnet 4.5')
    expect(composeModelDisplayName(claude.variants[0], claude.family)).toBe('Claude Sonnet 4.5 · Ripple')
  })

  it('沒有線路名就只寫模型名', () => {
    expect(composeModelDisplayName({ value: 'x', name: 'Free Model 1' } as any, 'Free Model 1'))
      .toBe('Free Model 1')
  })

  it('內部代號不當顯示名用——除非連模型名都沒有', () => {
    expect(composeModelDisplayName({ value: 'x' } as any, '家族名')).toBe('家族名')
    expect(composeModelDisplayName({ value: 'x' } as any, '')).toBe('x')
    expect(composeModelDisplayName(null)).toBe('')
  })
})

describe('已存的模型代號換算', () => {
  it('目錄裡有這個代號就直接用它', () => {
    const hit = resolveStoredModel(live as any, CLAUDE_RIPPLE)
    expect(hit.exact).toBe(true)
    expect(hit.variant!.value).toBe(CLAUDE_RIPPLE)
    expect(hit.family!.family).toBe('Claude Sonnet 4.5')
  })

  it('線路上線前存下的基礎代號換算得到家族與它的代表線路', () => {
    const hit = resolveStoredModel(live as any, CLAUDE_BASE)
    expect(hit.exact).toBe(false)
    expect(hit.family!.family).toBe('Claude Sonnet 4.5')
    expect(hit.variant!.value).toBe(CLAUDE_RIPPLE)
  })

  it('基礎代號只認整條線路的尾巴，不做子字串猜測', () => {
    // 'relay-claude-sonnet-4' 不是任何一條線路的基礎形態
    expect(resolveStoredModel(live as any, 'relay-claude-sonnet-4').family).toBe(null)
  })

  it('換算不到就是查無此模型，不亂挑一顆頂上', () => {
    expect(resolveStoredModel(live as any, '不存在的模型')).toEqual({ variant: null, family: null, exact: false })
    expect(resolveStoredModel(live as any, '')).toEqual({ variant: null, family: null, exact: false })
    expect(resolveStoredModel(null, CLAUDE_BASE)).toEqual({ variant: null, family: null, exact: false })
  })
})

/*
  2026-10-01：串流中每個 chunk 整串重畫，每則 AI 回覆都查一次它的模型。每次都把整份目錄攤平，
  手機上一輪生成有一半的主執行緒時間花在這裡。查表要對同一份目錄只走一遍。
*/
describe('按目錄記住的模型查表', () => {
  function counting(groups: any[]) {
    let reads = 0
    const wrap = (v: any): any => (v && typeof v === 'object'
      ? new Proxy(v, { get(t, k, r) { reads++; return wrap(Reflect.get(t, k, r)) } })
      : v)
    return { groups: wrap(groups), reads: () => reads }
  }

  it('跟逐次查（精確代號優先、再換算基礎代號）結果相同', () => {
    const lookup = createModelLookup(live as any)
    for (const code of [CLAUDE_RIPPLE, CLAUDE_BASE, CLAUDE_STABLE1, 'relay-claude-sonnet-4', '不存在的模型', '']) {
      const expected = resolveVariant(live as any, code) || resolveStoredModel(live as any, code).variant
      expect(lookup(code)?.value ?? null, code).toBe(expected?.value ?? null)
    }
    expect(createModelLookup(null)(CLAUDE_BASE)).toBe(null)
  })

  it('同一份目錄查幾百次，目錄只走一遍', () => {
    const c = counting(live as any)
    const lookup = createModelLookup(c.groups)
    lookup(CLAUDE_RIPPLE)
    lookup(CLAUDE_BASE)
    const afterFirst = c.reads()
    for (let i = 0; i < 300; i++) { lookup(CLAUDE_RIPPLE); lookup(CLAUDE_BASE) }
    expect(c.reads()).toBe(afterFirst)
  })
})
