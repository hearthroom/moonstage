/**
 * 首屏就緒：宿主在舞台還沒畫出東西之前蓋著自己的載入畫面，這裡決定什麼時候叫它收掉。
 */
import { describe, it, expect, vi } from 'vitest'
import { contentShown, createContentReady } from '../canvas-content-ready'

const base = { sandboxCard: false, sandboxShellReady: false, sandboxFailed: false, authorAssetSettled: true, messageCount: 1 }

describe('contentShown', () => {
  it('一般卡：版面規則到手、第一則訊息在畫面上才算', () => {
    expect(contentShown(base)).toBe(true)
    expect(contentShown({ ...base, messageCount: 0 })).toBe(false)
    // 版面還沒到：先收掉載入畫面，下一刻作者的版面才套上去，整頁會跳一下
    expect(contentShown({ ...base, authorAssetSettled: false })).toBe(false)
  })
  it('沙箱卡：要等殼畫好喊 ready；本頁的訊息列表先有東西不算', () => {
    const sandbox = { ...base, sandboxCard: true }
    expect(contentShown(sandbox)).toBe(false)
    expect(contentShown({ ...sandbox, sandboxShellReady: true })).toBe(true)
  })
  it('殼握手逾時也算：提示要露出來，不能一直蓋著', () => {
    expect(contentShown({ ...base, sandboxCard: true, sandboxFailed: true })).toBe(true)
  })
})

describe('createContentReady', () => {
  it('只通知一次，而且等畫面真的畫出來之後', async () => {
    const notify = vi.fn()
    const frames: Array<() => void> = []
    const ready = createContentReady(notify, (cb) => { frames.push(cb) })
    ready.mark()
    ready.mark()
    expect(notify).not.toHaveBeenCalled()
    frames.splice(0).forEach((cb) => cb())
    frames.splice(0).forEach((cb) => cb())
    expect(notify).toHaveBeenCalledTimes(1)
    ready.mark()
    frames.splice(0).forEach((cb) => cb())
    expect(notify).toHaveBeenCalledTimes(1)
  })
  it('頁面已經收掉就不再通知（換卡時舊的畫布晚到）', () => {
    const notify = vi.fn()
    const frames: Array<() => void> = []
    const ready = createContentReady(notify, (cb) => { frames.push(cb) })
    ready.mark()
    ready.dispose()
    while (frames.length) frames.shift()!()
    expect(notify).not.toHaveBeenCalled()
  })
  it('宿主沒實作也不出錯', () => {
    const ready = createContentReady(undefined, (cb) => cb())
    expect(() => ready.mark()).not.toThrow()
  })
})
