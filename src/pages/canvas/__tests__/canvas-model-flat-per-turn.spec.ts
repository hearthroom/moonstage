/**
 * 按次計費線路（flatPerTurn）：每一檔是一個確定價，不是 costScore × 檔位，也不是估算。
 *
 * 目錄裡一般的固定計價模型同樣是 billingType=fixed，所以辨識只看 flatPerTurn；
 * 兩種混著判斷會讓 256K 被算成 400 × 2 = 800，而玩家實際被扣 500。
 */
import { describe, it, expect } from 'vitest'
import {
  variantPrice,
  scoreParts,
  priceMeaning,
  balanceWarning,
  flatPriceFrom,
  isFlatPerTurn,
} from '../canvas-model-catalog'
import {
  getContextBudgetOptions,
  getContextBudgetLevelOptions,
  contextForSelection,
} from '../../../utils/model-context-options'
import { agentBlockedByLane, projectAgentEnabled } from '../../../utils/multi-pass'

const flatOptions = [
  { value: 1, tokens: 192000, label: '192K', text: '192K', fixedCredits: 400 },
  { value: 2, tokens: 256000, label: '256K', text: '256K', fixedCredits: 500 },
  { value: 3, tokens: 512000, label: '512K', text: '512K', fixedCredits: 750 },
  { value: 4, tokens: 768000, label: '768K', text: '768K', fixedCredits: 1000 },
]

const flatLane = {
  value: 'gemini-4-argon-dawn-turn',
  name: 'Gemini 4 Argon',
  channel: 'lane:dawn-turn',
  billingType: 'fixed',
  flatPerTurn: true,
  supportsMultiPass: false,
  costScore: 400,
  maxScore: 400,
  isCacheStable: true,
  contextBudgetOptions: flatOptions,
}

const ordinaryFixed = {
  value: 'gemini-4-argon-dawn',
  billingType: 'fixed',
  costScore: 400,
  isCacheStable: true,
  contextBudgetOptions: [
    { value: 1, tokens: 64000 },
    { value: 2, tokens: 96000 },
  ],
}

const t = (key: string, params: Record<string, unknown>) => `${key}:${JSON.stringify(params)}`

describe('按次線的每輪價格', () => {
  it('照選中那一檔的 fixedCredits，不乘檔位', () => {
    expect(variantPrice(flatLane, { context: 1 })).toMatchObject({ isDynamic: false, fixed: 400 })
    expect(variantPrice(flatLane, { context: 2 })).toMatchObject({ isDynamic: false, fixed: 500 })
    expect(variantPrice(flatLane, { context: 3 }).fixed).toBe(750)
    expect(variantPrice(flatLane, { context: 4 }).fixed).toBe(1000)
    expect(scoreParts(flatLane, { context: 2 })).toEqual({ text: '500', dynamic: false })
  })

  it('檔位不在表上（舊殘留的 5 或 MAX）時用最低檔，不寫出一個沒有人會被收的數', () => {
    expect(variantPrice(flatLane, { context: 5 }).fixed).toBe(400)
    expect(variantPrice(flatLane, { context: 100 }).fixed).toBe(400)
    expect(variantPrice(flatLane, {}).fixed).toBe(400)
  })

  it('一般固定計價模型照舊是 costScore × 檔位', () => {
    expect(isFlatPerTurn(ordinaryFixed)).toBe(false)
    expect(variantPrice(ordinaryFixed, { context: 2 }).fixed).toBe(800)
  })

  it('「起」價取最低一檔', () => {
    expect(flatPriceFrom(flatLane)).toBe(400)
    expect(flatPriceFrom({ ...flatLane, contextBudgetOptions: [...flatOptions].reverse() })).toBe(400)
    expect(flatPriceFrom(ordinaryFixed)).toBeNull()
  })

  it('價格的意思是每輪固定，不是估算', () => {
    expect(priceMeaning(flatLane)).toBe('flat')
    expect(priceMeaning(ordinaryFixed)).toBe('fixed')
  })

  it('積分不夠選中那一檔就提醒；一般固定模型照舊不提醒', () => {
    expect(balanceWarning(flatLane, { context: 2 }, 450, t)).toBe('chat.balanceBelowFlat:{"have":450,"need":500}')
    expect(balanceWarning(flatLane, { context: 2 }, 500, t)).toBe('')
    expect(balanceWarning(ordinaryFixed, { context: 2 }, 10, t)).toBe('')
  })
})

describe('按次線的上下文檔位', () => {
  it('檔位保留每一檔的固定價與容量', () => {
    const options = getContextBudgetOptions(flatLane)
    expect(options.map((o) => [o.value, o.tokens, o.text, o.fixedCredits])).toEqual([
      [1, 192000, '192K', 400],
      [2, 256000, '256K', 500],
      [3, 512000, '512K', 750],
      [4, 768000, '768K', 1000],
    ])
    expect(getContextBudgetLevelOptions(flatLane)[3]).toMatchObject({ fixedCredits: 1000, isCap: true })
  })

  it('從別的線路換進來一律回到最低檔', () => {
    // 原本在別的模型選第 3 檔：在按次線上第 3 檔是 512K、每輪 750，不能沒問就沿用。
    expect(contextForSelection(3, flatLane, true)).toBe(1)
    expect(contextForSelection(100, flatLane, true)).toBe(1)
  })

  it('已經在按次線上（重開選單、只調檔位）時保留玩家選的檔', () => {
    expect(contextForSelection(3, flatLane, false)).toBe(3)
    expect(contextForSelection(5, flatLane, false)).toBe(1)
  })

  it('一般模型照現行正規化', () => {
    expect(contextForSelection(2, ordinaryFixed, true)).toBe(2)
    expect(contextForSelection(9, ordinaryFixed, true)).toBe(1)
  })
})

describe('按次線不開 Agent', () => {
  it('由目錄旗標同步判斷，不等偏好設定讀回', () => {
    expect(agentBlockedByLane(flatLane)).toBe(true)
    expect(agentBlockedByLane(ordinaryFixed)).toBe(false)
    expect(agentBlockedByLane(null)).toBe(false)
  })

  it('舊殘留的開啟在按次線上投影成關；其他線路照原值', () => {
    expect(projectAgentEnabled(true, flatLane)).toBe(false)
    expect(projectAgentEnabled(true, ordinaryFixed)).toBe(true)
    expect(projectAgentEnabled(false, ordinaryFixed)).toBe(false)
  })
})
