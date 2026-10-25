import { describe, it, expect, vi } from 'vitest'
import { createCanvasShare } from '../canvas-share'

const state = { enabled: true, context: 'p1-4.b', url: 'https://sukisuki.ai/cards/1?ref=AB', audience: 'link' as const }

describe('畫布的分享情境（兩種 pageMode 同一份值）', () => {
  it('宿主沒接：沒有沙箱分享、一般卡讀到空值', () => {
    const share = createCanvasShare({ host: undefined, roleId: () => '7', historyMode: () => false })
    expect(share.state()).toBeNull()
    expect(share.sandbox()).toBeNull()
    const intent = share.intentHost()
    expect(intent.shareState()).toEqual({})
    expect(intent.shareLink('p1')).toBeNull()
    expect(intent.shareQr).toBeUndefined()
  })

  it('照這張卡問宿主；宿主給的壞值被濾掉', () => {
    const read = vi.fn(() => ({ ...state, context: '<b>' }))
    const share = createCanvasShare({ host: { read }, roleId: () => '7', historyMode: () => false })
    expect(share.state()).toEqual({ ...state, context: null })
    expect(read).toHaveBeenCalledWith('7')
  })

  it('看自己的紀錄時不帶朋友的情境碼，但連結照給', () => {
    const share = createCanvasShare({ host: { read: () => state }, roleId: () => '7', historyMode: () => true })
    expect(share.state()).toEqual({ ...state, context: null })
    expect(share.intentHost().shareLink('p1-1.c')).toBe('https://sukisuki.ai/cards/1?ref=AB&share=p1-1.c')
  })

  it('看自己的紀錄時也不帶朋友連結上的投票（那不是從分享連結開的一局）', () => {
    const poll = { key: 'p1-4', options: ['a', 'b'] }
    expect(createCanvasShare({ host: { read: () => ({ ...state, poll }) }, roleId: () => '7', historyMode: () => false }).state()!.poll).toEqual(poll)
    expect(createCanvasShare({ host: { read: () => ({ ...state, poll }) }, roleId: () => '7', historyMode: () => true }).state()!.poll).toBeUndefined()
  })

  it('沙箱與一般卡拿到同一份值；qr、變化通知原樣轉給宿主', async () => {
    const listeners: Array<() => void> = []
    const host = { read: () => state, qr: vi.fn(async (t: string) => ({ size: 21, path: t })), onChange: (fn: () => void) => { listeners.push(fn); return () => {} } }
    const share = createCanvasShare({ host, roleId: () => '7', historyMode: () => false })
    expect(share.sandbox()!.read()).toEqual(state)
    expect(share.intentHost().shareState()).toEqual(state)
    expect(share.intentHost().shareLink('a b')).toBeNull()
    expect(await share.sandbox()!.qr!('x')).toEqual({ size: 21, path: 'x' })
    expect(await share.intentHost().shareQr!('y')).toEqual({ size: 21, path: 'y' })
    const fn = vi.fn()
    share.onChange(fn)
    listeners.forEach((l) => l())
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
