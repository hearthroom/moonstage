import { describe, it, expect } from 'vitest'

import {
  createStageIntentApi,
  SEND_LIMIT_PER_WINDOW,
  INPUT_LIMIT_PER_WINDOW,
  ERR_RATE_LIMITED,
  ERR_NOT_GESTURE,
  ERR_UNSUPPORTED,
} from './stage-intent-api.js'

function makeHost(over) {
  const calls = []
  let draft = ''
  let composing = false
  const host = Object.assign({
    getInput: () => draft,
    setInput: (t) => { draft = t; calls.push(['setInput', t]); return true },
    appendInput: (t) => { draft += t; calls.push(['appendInput', t]); return true },
    submit: () => { calls.push(['submit', draft]); return true },
    setBackground: (u) => { calls.push(['setBackground', u]); return true },
    scrollToTop: () => { calls.push(['scrollToTop']); return true },
    scrollToBottom: () => { calls.push(['scrollToBottom']); return true },
    isComposing: () => composing,
  }, over || {})
  return {
    host,
    calls,
    setComposing: (v) => { composing = v },
    draft: () => draft,
  }
}

function makeApi(over) {
  const h = makeHost(over && over.host)
  let clock = 1000
  const built = createStageIntentApi({
    host: h.host,
    runtime: (over && over.runtime) || null,
    now: () => clock,
  })
  return {
    ...h,
    ...built,
    tick: (ms) => { clock += ms },
    at: () => clock,
  }
}

describe('luna intent api', () => {
  describe('輸入框', () => {
    it('get / set / append 轉給宿主', () => {
      const a = makeApi()
      expect(a.api.input.set('你好')).toBe(true)
      expect(a.api.input.get()).toBe('你好')
      expect(a.api.input.append('世界')).toBe(true)
      expect(a.draft()).toBe('你好世界')
    })

    it('輸入法組字期間拒絕寫入，回 false 不拋錯', () => {
      const a = makeApi()
      a.setComposing(true)
      expect(a.api.input.set('x')).toBe(false)
      expect(a.api.input.append('y')).toBe(false)
      expect(a.draft()).toBe('')
    })

    it('寫入超過限頻後拒絕', () => {
      const a = makeApi()
      for (let i = 0; i < INPUT_LIMIT_PER_WINDOW; i++) {
        expect(a.api.input.set('x')).toBe(true)
      }
      expect(a.api.input.set('x')).toBe(false)
    })

    it('宿主沒有實作該動作時回 false，不拋錯', () => {
      const a = makeApi({ host: { setInput: undefined } })
      expect(a.api.input.set('x')).toBe(false)
    })
  })

  describe('送出', () => {
    it('手勢期間可以送出', async () => {
      const a = makeApi()
      a.api.input.set('嗨')
      a.noteUserGesture()
      await expect(a.api.send()).resolves.toBeTruthy()
      expect(a.calls.some((c) => c[0] === 'submit')).toBe(true)
    })

    // 非手勢送出就是自問自答的來源。競品對此有專門的授權路徑，我們直接拒絕。
    it('沒有手勢時拒絕送出', async () => {
      const a = makeApi()
      await expect(a.api.send()).rejects.toMatchObject({ code: ERR_NOT_GESTURE })
    })

    it('手勢過期後拒絕送出（await 之後再送就不算手勢）', async () => {
      const a = makeApi()
      a.noteUserGesture()
      a.tick(1500)
      await expect(a.api.send()).rejects.toMatchObject({ code: ERR_NOT_GESTURE })
    })

    it('送出超過限頻後拒絕', async () => {
      const a = makeApi()
      for (let i = 0; i < SEND_LIMIT_PER_WINDOW; i++) {
        a.noteUserGesture()
        await a.api.send()
      }
      a.noteUserGesture()
      await expect(a.api.send()).rejects.toMatchObject({ code: ERR_RATE_LIMITED })
    })

    it('宿主沒有送出能力時回明確錯誤碼，不是靜默失敗', async () => {
      const a = makeApi({ host: { submit: undefined } })
      a.noteUserGesture()
      await expect(a.api.send()).rejects.toMatchObject({ code: ERR_UNSUPPORTED })
    })
  })

  describe('beforeSend', () => {
    it('改寫後的文字先回填輸入框再送出', async () => {
      const a = makeApi()
      a.api.input.set('攻擊')
      a.api.beforeSend((text) => text + ' 🎲12')
      a.noteUserGesture()
      await a.api.send()
      expect(a.draft()).toBe('攻擊 🎲12')
      const submit = a.calls.filter((c) => c[0] === 'submit').pop()
      expect(submit[1]).toBe('攻擊 🎲12')
    })

    it('回傳原字串＝不改寫', async () => {
      const a = makeApi()
      a.api.input.set('普通訊息')
      a.api.beforeSend((text) => text)
      a.noteUserGesture()
      await a.api.send()
      expect(a.draft()).toBe('普通訊息')
    })

    // 下面三條是同一個保證的三種失敗形態：不管 handler 怎麼壞，送出都不能被卡住。
    it('handler 拋錯時送原文，不阻斷送出', async () => {
      const a = makeApi()
      a.api.input.set('原文')
      a.api.beforeSend(() => { throw new Error('boom') })
      a.noteUserGesture()
      await expect(a.api.send()).resolves.toBeTruthy()
      expect(a.draft()).toBe('原文')
    })

    it('handler 回傳非字串時送原文', async () => {
      const a = makeApi()
      a.api.input.set('原文')
      a.api.beforeSend(() => ({ nope: true }))
      a.noteUserGesture()
      await a.api.send()
      expect(a.draft()).toBe('原文')
    })

    it('handler 逾時時送原文', async () => {
      const a = makeApi()
      a.api.input.set('原文')
      a.api.beforeSend((text) => { a.tick(500); return text + ' 改過' })
      a.noteUserGesture()
      await a.api.send()
      expect(a.draft()).toBe('原文')
    })

    it('重複註冊以最後一次為準', async () => {
      const a = makeApi()
      a.api.input.set('x')
      a.api.beforeSend((t) => t + '1')
      a.api.beforeSend((t) => t + '2')
      a.noteUserGesture()
      await a.api.send()
      expect(a.draft()).toBe('x2')
    })

    it('宿主自己的送出路徑也能套用改寫', () => {
      const a = makeApi()
      a.api.beforeSend((t) => t + '!')
      expect(a.applyBeforeSend('使用者手打的')).toBe('使用者手打的!')
    })
  })

  describe('背景與捲動', () => {
    it('background.set 轉給宿主（宿主負責寫穿伺服器）', () => {
      const a = makeApi()
      expect(a.api.background.set('https://x/bg.png')).toBe(true)
      expect(a.calls).toContainEqual(['setBackground', 'https://x/bg.png'])
    })

    it('scroll 兩個方向都轉得出去', () => {
      const a = makeApi()
      expect(a.api.scroll.toTop()).toBe(true)
      expect(a.api.scroll.toBottom()).toBe(true)
    })
  })

  describe('事件與邊界', () => {
    it('on 轉給資產執行期', () => {
      const seen = []
      const a = makeApi({ runtime: { subscribe: (e, h) => { seen.push(e); return true } } })
      expect(a.api.on('message:done', () => {})).toBe(true)
      expect(seen).toEqual(['message:done'])
    })

    it('沒有執行期時 on 回 false，不拋錯', () => {
      expect(makeApi().api.on('message:done', () => {})).toBe(false)
    })

    // 通用儲存刻意不提供：偏好進伺服器、進度進對話訊息、當場狀態用記憶體。
    it('不提供 storage', () => {
      expect(makeApi().api.storage).toBeUndefined()
    })

    it('所有同步方法都不拋錯，即使宿主什麼都沒實作', () => {
      const a = createStageIntentApi({ host: {} })
      expect(() => {
        a.api.input.get()
        a.api.input.set('x')
        a.api.input.append('x')
        a.api.background.set('x')
        a.api.scroll.toTop()
        a.api.scroll.toBottom()
        a.api.on('message:done', () => {})
        a.api.beforeSend(() => 'x')
      }).not.toThrow()
    })
  })
})

describe('share（分享情境，與沙箱 sdk.share 同語意）', () => {
  const state = { enabled: true, context: 'p1-4.b', url: 'https://sukisuki.ai/cards/1?ref=AB', audience: 'public' }

  it('宿主沒接：context／audience 是 null、enabled=false；link 回 null；qr 以 not_supported 拒絕', async () => {
    const { api } = makeApi()
    expect(api.share.enabled).toBe(false)
    expect(api.share.context).toBeNull()
    expect(api.share.audience).toBeNull()
    expect(api.share.link('p1')).toBeNull()
    await expect(api.share.qr('x')).rejects.toEqual({ code: ERR_UNSUPPORTED })
  })

  it('讀宿主現值；link 交宿主組（壞碼、給不出連結回 null）；qr 交宿主畫', async () => {
    const links = []
    const { api } = makeApi({ host: {
      shareState: () => state,
      shareLink: (c) => { links.push(c); return c === 'bad one' ? null : `${state.url}&share=${c}` },
      shareQr: async (t) => ({ size: 21, path: t }),
    } })
    expect(api.share.enabled).toBe(true)
    expect(api.share.context).toBe('p1-4.b')
    expect(api.share.audience).toBe('public')
    expect(api.share.link('p1-1.c')).toBe('https://sukisuki.ai/cards/1?ref=AB&share=p1-1.c')
    expect(api.share.link('bad one')).toBeNull()
    expect(links).toEqual(['p1-1.c', 'bad one'])
    expect(await api.share.qr('abc')).toEqual({ size: 21, path: 'abc' })
  })
})

describe('shared 與 share 的回流（與沙箱 sdk.shared 同語意、同錯誤碼）', () => {
  it('宿主沒接：鍵都在，呼叫以 HOST_DENIED 拒絕；poll 是 null', async () => {
    const { api } = makeApi()
    expect(Object.keys(api.shared).sort()).toEqual(['add', 'leaderboard', 'read', 'vote'])
    expect(api.share.poll).toBeNull()
    await expect(api.shared.read('boss')).rejects.toMatchObject({ code: 'HOST_DENIED' })
    await expect(api.shared.add('boss', 1)).rejects.toMatchObject({ code: 'HOST_DENIED' })
    await expect(api.share.tallyLink('p1-4.b', 'p1-4')).rejects.toMatchObject({ code: 'HOST_DENIED' })
    await expect(api.share.respond('a')).rejects.toMatchObject({ code: 'HOST_DENIED' })
    await expect(api.share.results()).rejects.toMatchObject({ code: 'HOST_DENIED' })
  })

  it('交給宿主的 shared 與 shareTally；poll 讀分享狀態的現值', async () => {
    const calls = []
    const rec = (name, value) => (...args) => { calls.push([name, ...args]); return Promise.resolve(value) }
    const { api } = makeApi({ host: {
      shareState: () => ({ enabled: true, context: 'p1-4.b', url: 'https://sukisuki.ai/cards/1', audience: 'link', poll: { key: 'p1-4', options: ['a', 'b'] } }),
      shared: { read: rec('read', { boss: { kind: 'counter', total: 1 } }), vote: rec('vote', { mine: 'a' }), add: rec('add', { total: 2, mine: 1, reachedAt: null }), leaderboard: rec('leaderboard', { items: [] }) },
      shareTally: { tallyLink: rec('tallyLink', 'https://sukisuki.ai/cards/1?share=~K7Q2M9XA'), respond: rec('respond', { ok: true }), results: rec('results', []) },
    } })
    expect(api.share.poll).toEqual({ key: 'p1-4', options: ['a', 'b'] })
    expect(await api.shared.read(['boss'])).toEqual({ boss: { kind: 'counter', total: 1 } })
    expect(await api.shared.leaderboard('boss', { limit: 5 })).toEqual({ items: [] })
    expect(await api.share.tallyLink('p1-4.b', 'p1-4')).toBe('https://sukisuki.ai/cards/1?share=~K7Q2M9XA')
    expect(await api.share.respond('b')).toEqual({ ok: true })
    expect(calls).toEqual([['read', ['boss']], ['leaderboard', 'boss', { limit: 5 }], ['tallyLink', 'p1-4.b', 'p1-4'], ['respond', 'b']])
  })
})
