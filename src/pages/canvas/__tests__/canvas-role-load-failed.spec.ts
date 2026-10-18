import { afterEach, describe, expect, it, vi } from 'vitest'
import { roleLoadFailureIsOurs } from '../canvas-role-ready'

// 角色細節讀不到時，作者只看到一個「role_not_found」：請求層把伺服器的錯誤碼原樣彈出來。
// 這一頁知道讀的是哪張卡、讀不到代表什麼，該由它講一句人話；請求層對這支不再出聲。
// 逾時、斷線、要重新登入仍由請求層講（2026-10-18 寫卡頁對話測試回報）。

type Pending = { fail: (e: unknown) => void; complete: (e: unknown) => void; success: (r: unknown) => void }

async function load() {
  vi.resetModules()
  const pending: Pending[] = []
  vi.stubGlobal('uni', {
    request: (o: Pending) => { pending.push(o); return { abort: () => {} } },
    showToast: () => {},
    showLoading: () => {},
    hideLoading: () => {},
    getStorageSync: () => 'zh-Hans',
    getLocale: () => 'zh-Hans',
  })
  const http = (await import('@/components/firstui/fui-request/index.js')).default as any
  const { setupHttp } = await import('@/api/http-setup.js')
  const { requestUrl } = await import('@/config/request-url.js')
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
  return { http, toast, pending, url: requestUrl.getRoleDetail as string }
}

async function respond(pending: Pending[], statusCode: number, data: unknown) {
  await vi.waitFor(() => expect(pending.length).toBe(1))
  const res = { statusCode, data, header: {} }
  pending[0].success(res)
  pending[0].complete(res)
}

describe('角色細節讀不到', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('伺服器回 404：請求層不彈錯誤碼，交給這一頁講', async () => {
    const { http, toast, pending, url } = await load()
    const p = http.get(url, { data: { roleId: 'b' }, showLoading: false }).catch((e: any) => e)
    await respond(pending, 404, { error: 'role_not_found' })
    const err = await p
    expect(toast.error).not.toHaveBeenCalled()
    expect(roleLoadFailureIsOurs(err)).toBe(true)
  })

  it('伺服器回 5xx：同樣由這一頁講', async () => {
    const { http, toast, pending, url } = await load()
    const p = http.get(url, { data: { roleId: 'b' }, showLoading: false }).catch((e: any) => e)
    await respond(pending, 503, { error: 'upstream' })
    const err = await p
    expect(toast.serverError).not.toHaveBeenCalled()
    expect(roleLoadFailureIsOurs(err)).toBe(true)
  })

  it('逾時、斷線、要重新登入：請求層已經講過，這一頁不再疊一個', () => {
    expect(roleLoadFailureIsOurs({ statusCode: -9999 })).toBe(false)
    expect(roleLoadFailureIsOurs({ statusCode: -1 })).toBe(false)
    expect(roleLoadFailureIsOurs({ statusCode: 401 })).toBe(false)
    expect(roleLoadFailureIsOurs(new Error('x'))).toBe(false)
  })

  it('400 不被攔截器擋：回應原樣交回，也由這一頁講', () => {
    expect(roleLoadFailureIsOurs({ statusCode: 400, data: { error: 'bad' } })).toBe(true)
  })
})
