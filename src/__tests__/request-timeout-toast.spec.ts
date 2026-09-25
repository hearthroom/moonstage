import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 一個請求逾時曾經彈兩個提示：請求層取消請求後走進 fail 先彈「網路錯誤」，攔截器再彈「逾時」
// （小米使用者 2026-09-25 截圖：三組「网络错误，请重试」＋「Request timed out」）。
// 而且背景讀取自己有重試或退回預設值，內部處理好的失敗不該打擾使用者（owner 2026-09-25）。

type Pending = { fail: (e: unknown) => void; complete: (e: unknown) => void; success: (r: unknown) => void }

async function load() {
  vi.resetModules()
  const pending: Pending[] = []
  const showToast = vi.fn()
  vi.stubGlobal('uni', {
    request: (o: Pending) => {
      pending.push(o)
      return { abort: () => { const e = { errMsg: 'request:fail abort' }; o.fail(e); o.complete(e) } }
    },
    showToast,
    showLoading: () => {},
    hideLoading: () => {},
    getStorageSync: () => 'zh-Hans',
    getLocale: () => 'zh-Hans',
  })
  const http = (await import('@/components/firstui/fui-request/index.js')).default as any
  const { setupHttp } = await import('@/api/http-setup.js')
  const toast = { timeout: vi.fn(), networkError: vi.fn(), serverError: vi.fn(), error: vi.fn(), unauthorized: vi.fn() }
  setupHttp(http, {
    host: 'https://api.example',
    loading: { show: () => {}, hide: () => {} },
    toast,
    getLocale: () => 'zh-Hans',
    getFreshAccessToken: async () => null,
    refreshAccessToken: async () => null,
    clearTokens: () => {},
    redirectToLogin: () => {},
  })
  return { http, toast, showToast, pending }
}

describe('請求層的傳輸失敗提示', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('逾時只提示一次「逾時」，不再多彈一個「網路錯誤」', async () => {
    const { http, toast, showToast } = await load()
    const p = http.get('/x', { showLoading: false, timeout: 3000 }).catch((e: any) => e)
    await vi.advanceTimersByTimeAsync(3100)
    expect((await p).statusCode).toBe(-9999)
    expect(toast.timeout).toHaveBeenCalledTimes(1)
    expect(showToast).not.toHaveBeenCalled()
  })

  it('呼叫端宣告自己處理（quietTransport）：逾時與斷線都不提示，但仍然 reject 給呼叫端', async () => {
    const { http, toast, showToast, pending } = await load()
    const timedOut = http.get('/x', { showLoading: false, timeout: 3000, quietTransport: true }).catch((e: any) => e)
    await vi.advanceTimersByTimeAsync(3100)
    expect((await timedOut).statusCode).toBe(-9999)
    const dropped = http.get('/y', { showLoading: false, quietTransport: true }).catch((e: any) => e)
    await vi.advanceTimersByTimeAsync(0)
    const req = pending.at(-1)!
    req.fail({ errMsg: 'request:fail' }); req.complete({})
    expect((await dropped).errMsg).toBe('request:fail')
    expect(toast.timeout).not.toHaveBeenCalled()
    expect(toast.networkError).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it('沒宣告的請求真的斷線，照樣提示網路錯誤（使用者按下去的動作不能沒反應）', async () => {
    const { http, showToast, pending } = await load()
    const p = http.get('/x', { showLoading: false }).catch((e: any) => e)
    await vi.advanceTimersByTimeAsync(0)
    const req = pending.at(-1)!
    req.fail({ errMsg: 'request:fail' }); req.complete({})
    await p
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast.mock.calls[0][0].title).toBe('网络错误，请重试')
  })

  it('請求已經回來，之後逾時計時器不再中止或提示', async () => {
    const { http, toast, showToast, pending } = await load()
    const p = http.get('/x', { showLoading: false, timeout: 3000 })
    await vi.advanceTimersByTimeAsync(0)
    const req = pending.at(-1)!
    req.success({ statusCode: 200, data: {} }); req.complete({})
    expect((await p).statusCode).toBe(200)
    await vi.advanceTimersByTimeAsync(3100)
    expect(toast.timeout).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })
})

describe('嵌入模式的錯誤提示跟著宿主語言', () => {
  it('沒設定文字時讀舞台語言包，不在中文介面冒英文', async () => {
    const { hostToast } = await import('@/stage/index')
    const say = vi.fn()
    let locale = 'zh-Hans'
    const t = hostToast({ ui: { toast: say }, locale: { get: () => locale, set: () => {} } } as any)
    t.timeout()
    locale = 'zh-Hant'
    t.networkError()
    locale = 'xx'
    t.timeout()
    expect(say.mock.calls.map((c) => c[0])).toEqual(['请求超时，请重试', '網路錯誤，請重試', 'Request timed out. Please try again.'])
  })
})
