// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { fetchPlayground } from '../../worker/index.js'

const env = { API_ORIGIN: 'https://api.harperharbor.com', ASSETS: { fetch: vi.fn() } }
describe('playground API proxy', () => {
  it('preserves POST bodies and bearer auth without forwarding site cookies', async () => {
    const upstream = vi.fn(async (req: Request) => {
      expect(req.url).toBe('https://api.harperharbor.com/oauth/token')
      expect(req.headers.get('authorization')).toBe('Bearer test-token')
      expect(req.headers.has('cookie')).toBe(false)
      expect(req.redirect).toBe('manual')
      expect(await req.text()).toBe('grant_type=refresh_token')
      return new Response('token', { headers: { 'set-cookie': 'not-for-this-origin=x' } })
    })
    const response = await fetchPlayground(new Request('https://playground.hearthroom.club/api/oauth/token', {
      method: 'POST', headers: { authorization: 'Bearer test-token', cookie: 'session=private' }, body: 'grant_type=refresh_token',
    }), env, upstream)
    expect(await response.text()).toBe('token')
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('does not proxy arbitrary paths or hosts', async () => {
    const upstream = vi.fn()
    for (const path of ['/api/admin/users', '/api//evil.example/token']) {
      const response = await fetchPlayground(new Request(`https://playground.hearthroom.club${path}`), env, upstream)
      expect(response.status).toBe(404)
    }
    expect(upstream).not.toHaveBeenCalled()
  })

  it('keeps API errors and redirects out of the SPA fallback', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://console.harperharbor.com/login' } }))
    const response = await fetchPlayground(new Request('https://playground.hearthroom.club/api/oauth/authorize?state=test'), env, upstream)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://console.harperharbor.com/login')
  })

  it('serves application routes through the asset binding', async () => {
    const assets = { fetch: vi.fn().mockResolvedValue(new Response('app')) }
    expect(await (await fetchPlayground(new Request('https://playground.hearthroom.club/pages/oauth/callback'), { ...env, ASSETS: assets })).text()).toBe('app')
    expect(assets.fetch).toHaveBeenCalledOnce()
  })
})
