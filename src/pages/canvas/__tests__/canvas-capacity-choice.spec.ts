/**
 * 第一輪就裝不下的卡：玩家在「調到建議的容量」與「用目前容量玩」之間選一個，
 * 存好設定後同一則訊息自動重送。這裡守三件事：只給伺服器說裝得下的選項、
 * 存的是對的那一個欄位、存失敗就不重送。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  applyCapacityChoice,
  capacityChoiceOptions,
  capacityChoicePatch,
  capacitySituation,
  capacitySizeLabel,
  capacityTitleKey,
} from '../canvas-capacity-choice'

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}(${JSON.stringify(params)})` : key)
const both = { requiredTier: 3, requiredTokens: 128000, trimFits: true }

describe('容量選項', () => {
  it('兩種都裝得下：先給調高容量，再給用目前容量玩', () => {
    const options = capacityChoiceOptions(both, t)
    expect(options.map((o) => o.key)).toEqual(['raise', 'trim'])
    expect(options[0].label).toBe('canvas.capacity.raise({"size":"128K"})')
    expect(options[0].desc).toBe('canvas.capacity.raiseSub')
    expect(options[1].label).toBe('canvas.capacity.trim')
    expect(options[1].desc).toBe('canvas.capacity.trimSub')
  })

  it('只給伺服器說裝得下的那一個', () => {
    expect(capacityChoiceOptions({ requiredTier: null, requiredTokens: null, trimFits: true }, t).map((o) => o.key)).toEqual(['trim'])
    expect(capacityChoiceOptions({ ...both, trimFits: false }, t).map((o) => o.key)).toEqual(['raise'])
    expect(capacityChoiceOptions(null, t)).toEqual([])
  })

  it('容量寫成玩家在模型選單看到的樣子', () => {
    expect(capacitySizeLabel(128000)).toBe('128K')
    expect(capacitySizeLabel(64000)).toBe('64K')
    expect(capacitySizeLabel(null)).toBe('')
  })

  it('沒帶大小時用模型選單那一檔的大小', () => {
    const options = capacityChoiceOptions({ requiredTier: 3, requiredTokens: null, trimFits: false }, t, 128000)
    expect(options[0].label).toBe('canvas.capacity.raise({"size":"128K"})')
  })
})

describe('要存的欄位', () => {
  it('調高容量只動檔位；用目前容量玩只打開精簡', () => {
    // 之前選過精簡的玩家改調高容量：要一起關掉精簡，否則調高了設定還是被截掉
    expect(capacityChoicePatch('raise', both)).toEqual({ context: 3, trimConstantLore: false })
    expect(capacityChoicePatch('trim', both)).toEqual({ trimConstantLore: true })
  })

  it('伺服器沒說裝得下的選項不存任何東西', () => {
    expect(capacityChoicePatch('raise', { ...both, requiredTier: null })).toBe(null)
    expect(capacityChoicePatch('trim', { ...both, trimFits: false })).toBe(null)
    expect(capacityChoicePatch('other' as any, both)).toBe(null)
  })
})

describe('選了之後', () => {
  it('調高容量：先存檔位，存好才重送同一則訊息', async () => {
    const calls: string[] = []
    const save = vi.fn(async (patch) => { calls.push('save:' + JSON.stringify(patch)); return true })
    const resend = vi.fn((draft: string) => { calls.push('resend:' + draft) })
    await expect(applyCapacityChoice({ key: 'raise', advice: both, draft: '你好', save, resend })).resolves.toBe(true)
    expect(calls).toEqual(['save:{"context":3,"trimConstantLore":false}', 'resend:你好'])
  })

  it('用目前容量玩：先存精簡，存好才重送', async () => {
    const save = vi.fn(async () => true)
    const resend = vi.fn()
    await applyCapacityChoice({ key: 'trim', advice: both, draft: '你好', save, resend })
    expect(save).toHaveBeenCalledWith({ trimConstantLore: true })
    expect(resend).toHaveBeenCalledWith('你好')
  })

  it('存失敗就不重送，選項留著讓玩家再選', async () => {
    const resend = vi.fn()
    await expect(applyCapacityChoice({ key: 'raise', advice: both, draft: '你好', save: async () => false, resend })).resolves.toBe(false)
    await expect(applyCapacityChoice({ key: 'raise', advice: both, draft: '你好', save: async () => { throw new Error('offline') }, resend })).resolves.toBe(false)
    expect(resend).not.toHaveBeenCalled()
  })

  it('不在選項裡的選擇什麼都不做', async () => {
    const save = vi.fn(async () => true)
    const resend = vi.fn()
    await expect(applyCapacityChoice({ key: 'trim', advice: { ...both, trimFits: false }, draft: '你好', save, resend })).resolves.toBe(false)
    expect(save).not.toHaveBeenCalled()
    expect(resend).not.toHaveBeenCalled()
  })
})

// 送出前的容量檢查每一輪都跑：第一輪放不下是這張卡本身，聊到後面放不下是這段對話。
// 標題要說對是哪一個，不能一律說成角色設定。
describe('放不下的是什麼', () => {
  const opening = { type: 0, content: '開場白' }
  const player = { type: 1, content: '你好' }
  const reply = { type: 0, content: '回覆' }
  const errorBubble = { type: 0, content: '', systemOnly: true }

  it('只有開場白、或玩家先開口的卡：是這張卡', () => {
    expect(capacitySituation([opening], false)).toBe('start')
    expect(capacitySituation([opening, player], false)).toBe('start')
    expect(capacitySituation([player], false)).toBe('start')
    expect(capacitySituation([opening, errorBubble, player], false)).toBe('start')
    expect(capacitySituation([], false)).toBe('start')
  })

  it('已經有 AI 回過玩家、有摘要、或還有更舊的紀錄：是這段對話', () => {
    expect(capacitySituation([opening, player, reply], false)).toBe('later')
    expect(capacitySituation([player, reply], false)).toBe('later')
    expect(capacitySituation([{ type: 0, content: '前情', isSummary: true }, player], false)).toBe('later')
    expect(capacitySituation([player], true)).toBe('later')
  })

  it('還在載入的空白回覆、沒有內容的失敗列不算回過', () => {
    expect(capacitySituation([opening, player, { type: 0, content: '', chatLoading: true }], false)).toBe('start')
    // 第一輪斷線或逾時留下的列（重新整理後從歷史載回來也是這個形狀），之後重送才被擋
    expect(capacitySituation([opening, player, { type: 0, content: '', chatFinish: true, finishReason: 'upstream_timeout' }], false)).toBe('start')
    expect(capacitySituation([opening, player, { type: 0, content: '連線中斷', chatFinish: true, isApplicationError: true }], false)).toBe('start')
    // 有思考但沒有正文，或正常結束的回覆，都算回過
    expect(capacitySituation([opening, player, { type: 0, content: '', thinkingContent: '想', finishReason: 'reasoning_only' }], false)).toBe('later')
    expect(capacitySituation([opening, player, { type: 0, content: '回覆', finishReason: 'stop' }], false)).toBe('later')
  })

  it('兩種情況各用一句標題', () => {
    expect(capacityTitleKey('start')).toBe('canvas.capacity.titleStart')
    expect(capacityTitleKey('later')).toBe('canvas.capacity.titleLater')
  })
})
