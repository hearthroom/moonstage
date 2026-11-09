// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createAuthorAssetRuntime, AUTHOR_EVENTS, LATEST_REPLAY_EVENTS } from './author-asset-mount.js'
import { createStageIntentApi } from './stage-intent-api.js'
import { VALID_EVENTS } from './author-asset-mount.fixtures.js'

describe('state:change（一般卡的作者事件）', () => {
  it('在事件表裡，夾具同步', () => {
    expect(AUTHOR_EVENTS).toContain('state:change')
    expect(VALID_EVENTS).toEqual(AUTHOR_EVENTS)
    expect(LATEST_REPLAY_EVENTS).toEqual(['state:change'])
  })

  it('晚訂閱只補發最後一份；之後照常收到新的', () => {
    const rt = createAuthorAssetRuntime({ doc: document })
    const early = []
    rt.subscribe('state:change', (p) => early.push(p.messageId))
    rt.emit('state:change', { messageId: '1', data: { a: 0 }, changes: [] })
    rt.emit('state:change', { messageId: '3', data: { a: 1 }, changes: [] })
    const late = []
    rt.subscribe('state:change', (p) => late.push(p.messageId))
    expect(early).toEqual(['1', '3'])
    expect(late).toEqual(['3'])
    rt.emit('state:change', { messageId: '5', data: { a: 2 }, changes: [] })
    expect(early).toEqual(['1', '3', '5'])
    expect(late).toEqual(['3', '5'])
  })

  it('沒有人訂閱時也記下最後一份；換對話（resetReplay）與離場後不補發', () => {
    const rt = createAuthorAssetRuntime({ doc: document })
    rt.emit('state:change', { messageId: '1', data: {}, changes: [] })
    const got = []
    rt.subscribe('state:change', (p) => got.push(p.messageId))
    expect(got).toEqual(['1'])
    rt.resetReplay()
    const after = []
    rt.subscribe('state:change', (p) => after.push(p))
    expect(after).toEqual([])
  })

  it('補發時訂閱者丟錯不影響訂閱成功，錯誤交給 onError', () => {
    const errors = []
    const rt = createAuthorAssetRuntime({ doc: document, onError: (event) => errors.push(event) })
    rt.emit('state:change', { messageId: '1', data: {}, changes: [] })
    expect(rt.subscribe('state:change', () => { throw new Error('boom') })).toBe(true)
    expect(errors).toEqual(['state:change'])
  })

  it('其他事件不補發', () => {
    const rt = createAuthorAssetRuntime({ doc: document })
    rt.emit('share:change')
    const got = []
    rt.subscribe('share:change', () => got.push(1))
    expect(got).toEqual([])
  })

  it('stage.state.get／of 交給宿主；宿主沒接就回 null', () => {
    const now = { messageId: '3', data: { a: 1 }, changes: [] }
    const { api } = createStageIntentApi({ host: { cardState: () => now, cardStateOf: (id) => (id === '1' ? { messageId: '1', data: {}, changes: [] } : null) } })
    expect(api.state.get()).toBe(now)
    expect(api.state.of(1)).toEqual({ messageId: '1', data: {}, changes: [] })
    expect(api.state.of('x')).toBeNull()
    const bare = createStageIntentApi({ host: {} }).api
    expect(bare.state.get()).toBeNull()
    expect(bare.state.of('1')).toBeNull()
  })
})
