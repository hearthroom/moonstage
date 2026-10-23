import { describe, expect, it } from 'vitest'
import { filterCardActions, isInputPolicyFilter, isUnknownOutputFilter, cardRetryTarget, type FilterCardContext } from '../canvas-filter-card'

const labels = { retryAsIs: '直接重試', streamOffRetry: '關閉流式輸出並重試', switchLane: '切換線路', editMessage: '修改訊息', resendLane: '用新線路重送', resendModel: '用新模型重送' }
const retry = { action: 'retry', label: '重試' }
const switchModel = { action: 'switch_model', label: '切換模型' }
const unknown = { finishReason: 'content_filter', failureCause: 'content_filter', filterReason: 'unknown' }
const input = { finishReason: 'content_filter', failureCause: 'content_filter', filterReason: 'input_policy' }

function ctx(over: Partial<FilterCardContext> = {}): FilterCardContext {
  return { item: unknown, base: [retry, switchModel], streaming: 'on', streamingApplies: true, canEditMessage: true, hasOtherLanes: true, switchedTo: '', labels, ...over }
}
const actions = (over: Partial<FilterCardContext> = {}) => filterCardActions(ctx(over)).ctas.map(e => e.action)

describe('哪一種內容限制', () => {
  it('輸入端：伺服器標成 input_policy，或舊的 content_filter_input', () => {
    expect(isInputPolicyFilter(input)).toBe(true)
    expect(isInputPolicyFilter({ finishReason: 'content_filter_input' })).toBe(true)
    expect(isInputPolicyFilter(unknown)).toBe(false)
  })
  it('跟卡上的字同一個判斷：舊紀錄 failureCause 是 content_filter、finishReason 被換成 content_filter_input 時，字是「原因未提供」，鍵也照舊（不給輸入端的鍵，也不給流式輸出出口）', () => {
    const legacy = { failureCause: 'content_filter', finishReason: 'content_filter_input' }
    expect(isInputPolicyFilter(legacy)).toBe(false)
    expect(isUnknownOutputFilter(legacy)).toBe(false)
    expect(isInputPolicyFilter({ failureCause: 'content_filter_input', filterReason: 'unknown' })).toBe(false)
  })
  it('原因未提供的輸出端停止：沒有原因或 unknown，而且不是輸入端', () => {
    expect(isUnknownOutputFilter(unknown)).toBe(true)
    expect(isUnknownOutputFilter({ finishReason: 'content_filter' })).toBe(true)
    expect(isUnknownOutputFilter({ finishReason: 'content_filter_input' })).toBe(false)
    expect(isUnknownOutputFilter({ failureCause: 'content_filter_input', finishReason: 'content_filter' })).toBe(false)
    expect(isUnknownOutputFilter(input)).toBe(false)
    for (const filterReason of ['safety', 'privacy', 'recitation', 'refusal', 'prohibited'])
      expect(isUnknownOutputFilter({ ...unknown, filterReason })).toBe(false)
    expect(isUnknownOutputFilter({ finishReason: 'refusal' })).toBe(false)
    expect(isUnknownOutputFilter({ finishReason: 'server_error' })).toBe(false)
  })
})

describe('原因未提供：流式輸出出口', () => {
  it('A：流式開、能重試、能切換 → [直接重試][切換模型][關閉流式輸出並重試]', () => {
    const r = filterCardActions(ctx())
    expect(r.ctas).toEqual([{ action: 'retry', label: '直接重試' }, switchModel, { action: 'retry_stream_off', label: '關閉流式輸出並重試' }])
    expect(r).toMatchObject({ offersStreamOff: true, streamingOff: false, stacked: true })
  })
  it('A′：不能切換時只有兩顆，仍疊排', () => {
    const r = filterCardActions(ctx({ base: [retry] }))
    expect(r.ctas.map(e => e.action)).toEqual(['retry', 'retry_stream_off'])
    expect(r.stacked).toBe(true)
  })
  it('伺服器給的是別的重試動作時照樣接上，按下去走那一顆', () => {
    const base = [{ action: 'retry_rewrite', label: '重試' }, switchModel]
    expect(actions({ base })).toEqual(['retry_rewrite', 'switch_model', 'retry_stream_off'])
    expect(cardRetryTarget(base)).toBe('retry_rewrite')
    expect(cardRetryTarget([switchModel])).toBe('')
  })
  it('B：流式已關 → 動作不變，說明改建議切換模型', () => {
    const r = filterCardActions(ctx({ streaming: 'off' }))
    expect(r.ctas).toEqual([retry, switchModel])
    expect(r).toMatchObject({ offersStreamOff: false, streamingOff: true, stacked: false })
  })
  it('C：流式值還沒讀到、世界模式／Agent（不吃這個偏好）、不能重試 → 完全照舊', () => {
    for (const over of [{ streaming: '' as const }, { streamingApplies: false }, { base: [switchModel] }]) {
      const r = filterCardActions(ctx(over))
      expect(r.ctas).toEqual(ctx(over).base)
      expect(r.offersStreamOff).toBe(false)
      expect(r.stacked).toBe(false)
    }
    expect(filterCardActions(ctx({ streamingApplies: false, streaming: 'off' })).streamingOff).toBe(false)
  })
  it('其他原因與其他錯誤卡：照舊', () => {
    for (const item of [{ ...unknown, filterReason: 'safety' }, { finishReason: 'refusal' }, { finishReason: 'server_error' }]) {
      const r = filterCardActions(ctx({ item }))
      expect(r).toEqual({ ctas: [retry, switchModel], offersStreamOff: false, streamingOff: false, stacked: false, switched: '' })
    }
  })
})

describe('前置被擋：修改訊息、切換線路、切換模型', () => {
  it('全部可用 → [切換線路][切換模型][修改訊息]，拿掉重試，疊排', () => {
    const r = filterCardActions(ctx({ item: input }))
    expect(r.ctas).toEqual([{ action: 'switch_lane', label: '切換線路' }, switchModel, { action: 'edit_message', label: '修改訊息' }])
    expect(r.stacked).toBe(true)
    expect(r.offersStreamOff).toBe(false)
  })
  it('流式開也不給關閉流式輸出（內容根本沒開始生成）', () => {
    expect(actions({ item: { finishReason: 'content_filter_input' } })).not.toContain('retry_stream_off')
  })
  it('沒有其他線路：切換線路不出現，兩顆不疊排', () => {
    const r = filterCardActions(ctx({ item: input, hasOtherLanes: false }))
    expect(r.ctas.map(e => e.action)).toEqual(['switch_model', 'edit_message'])
    expect(r.stacked).toBe(false)
  })
  it('不能切換模型：線路也不給，只剩修改訊息', () => {
    expect(actions({ item: input, base: [retry] })).toEqual(['edit_message'])
  })
  it('不能編輯（舊卡、時間軸鎖住）：沒有修改訊息', () => {
    expect(actions({ item: input, canEditMessage: false })).toEqual(['switch_lane', 'switch_model'])
  })
  it('伺服器各種重試動作都拿掉', () => {
    const base = [{ action: 'retry_rewrite', label: '重試' }, { action: 'rewrite', label: '重試' }, switchModel]
    expect(actions({ item: input, base })).toEqual(['switch_lane', 'switch_model', 'edit_message'])
  })

  it('從這張卡換了線路、選好之後：主行動換成用新線路重送（照卡上那顆重試走），修改訊息讓位', () => {
    const r = filterCardActions(ctx({ item: input, switchedTo: 'lane' }))
    expect(r.ctas).toEqual([{ action: 'switch_lane', label: '切換線路' }, switchModel, { action: 'resend_filtered', label: '用新線路重送' }])
    expect(r.stacked).toBe(true)
    expect(r.switched).toBe('lane')
  })
  it('換的是別的模型：用新模型重送', () => {
    expect(filterCardActions(ctx({ item: input, switchedTo: 'model' })).ctas.at(-1)).toEqual({ action: 'resend_filtered', label: '用新模型重送' })
    expect(filterCardActions(ctx({ item: input, switchedTo: 'model' })).switched).toBe('model')
  })
  it('伺服器沒給任何重試動作時沒有重送可走：維持修改訊息', () => {
    expect(actions({ item: input, switchedTo: 'lane', base: [switchModel] })).toEqual(['switch_lane', 'switch_model', 'edit_message'])
    // 卡上沒有重送鍵時，說明也不能說「可以直接重送」
    expect(filterCardActions(ctx({ item: input, switchedTo: 'lane', base: [switchModel] })).switched).toBe('')
  })
  it('還沒換（只是打開選單看看）不給重送；原因未提供的卡不受影響', () => {
    expect(actions({ item: input })).not.toContain('resend_filtered')
    expect(actions({ switchedTo: 'model' })).not.toContain('resend_filtered')
  })
})
