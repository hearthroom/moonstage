import { describe, it, expect } from 'vitest'
import { shareContextOf, shareLinkOf, shareStateOf } from '../share-context'

describe('分享情境碼', () => {
  it('只收 1–64 個英數與 . _ -，開頭要是英數（~ 留給平台短碼）', () => {
    for (const ok of ['p1-4.b', 's5.-', 'a', 'A'.repeat(64), 'x_y.z-0']) expect(shareContextOf(ok)).toBe(ok)
    for (const bad of ['', '~K7Q2M9XA', '.a', '-a', 'A'.repeat(65), 'a b', '<b>', 'a&b', 'a%20', '中文', 'a"b', 1, null, undefined, {}]) {
      expect(shareContextOf(bad)).toBeNull()
    }
  })

  it('宿主狀態：開關關著時拿掉情境碼；網址不是 http(s) 當沒有；audience 不認得當 null', () => {
    expect(shareStateOf({ enabled: true, context: 'p1-4.b', url: 'https://sukisuki.ai/cards/1?ref=AB', audience: 'link' }))
      .toEqual({ enabled: true, context: 'p1-4.b', url: 'https://sukisuki.ai/cards/1?ref=AB', audience: 'link' })
    expect(shareStateOf({ enabled: false, context: 'p1-4.b', url: 'https://x.test/cards/1', audience: 'public' }))
      .toEqual({ enabled: false, context: null, url: 'https://x.test/cards/1', audience: 'public' })
    expect(shareStateOf({ enabled: true, context: '<b>', url: 'javascript:alert(1)', audience: 'everyone' }))
      .toEqual({ enabled: true, context: null, url: '', audience: null })
    expect(shareStateOf(null)).toBeNull()
  })

  it('分享回流的投票（poll）：開關開著、key 與選項都合規則才帶；最多 12 個選項', () => {
    const base = { enabled: true, context: 'p1-4.b', url: 'https://sukisuki.ai/cards/1', audience: 'link' }
    expect(shareStateOf({ ...base, poll: { key: 'p1-4', options: ['a', 'b'], token: '~K7Q2M9XA' } })!.poll).toEqual({ key: 'p1-4', options: ['a', 'b'] })
    expect(shareStateOf({ ...base, enabled: false, poll: { key: 'p1-4', options: ['a'] } })!.poll).toBeUndefined()
    expect(shareStateOf({ ...base, poll: { key: 'a b', options: ['a'] } })!.poll).toBeUndefined()
    expect(shareStateOf({ ...base, poll: { key: 'p1-4', options: ['a', '<b>', 3] } })!.poll).toEqual({ key: 'p1-4', options: ['a'] })
    expect(shareStateOf({ ...base, poll: { key: 'p1-4', options: [] } })!.poll).toBeUndefined()
    expect(shareStateOf({ ...base, poll: { key: 'p1-4', options: Array.from({ length: 13 }, (_, i) => `o${i}`) } })!.poll!.options).toHaveLength(12)
  })

  it('連結：保留推薦碼、換掉舊的 share；沒給情境就是一般連結', () => {
    const state = shareStateOf({ enabled: true, context: null, url: 'https://sukisuki.ai/cards/100271?ref=ABCD&share=old', audience: 'public' })
    expect(shareLinkOf(state, 'p1-4.b')).toEqual({ ok: true, url: 'https://sukisuki.ai/cards/100271?ref=ABCD&share=p1-4.b' })
    expect(shareLinkOf(state)).toEqual({ ok: true, url: 'https://sukisuki.ai/cards/100271?ref=ABCD' })
  })

  it('開關關著：情境不帶，但照樣給一般連結（卡片的分享鈕不壞）', () => {
    const state = shareStateOf({ enabled: false, url: 'https://sukisuki.ai/cards/1', audience: 'public' })
    expect(shareLinkOf(state, 'p1-4.b')).toEqual({ ok: true, url: 'https://sukisuki.ai/cards/1' })
  })

  it('壞的情境碼先報 invalid；宿主沒有網址報 unavailable', () => {
    const state = shareStateOf({ enabled: true, url: 'https://sukisuki.ai/cards/1' })
    expect(shareLinkOf(state, 'a b')).toEqual({ ok: false, code: 'invalid' })
    expect(shareLinkOf(null, 'a b')).toEqual({ ok: false, code: 'invalid' })
    expect(shareLinkOf(null, 'p1')).toEqual({ ok: false, code: 'unavailable' })
    expect(shareLinkOf(shareStateOf({ enabled: true, url: '' }), 'p1')).toEqual({ ok: false, code: 'unavailable' })
  })
})
