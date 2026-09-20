import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/config/env', () => ({ API_BASE: '/api', API_ORIGIN: 'https://api.harperharbor.com' }))
import { ensureClientId, OPEN_API_RESOURCE, OPEN_API_SCOPE, useExternalAuth, getFreshAccessToken } from '../open-oauth'

describe('playground provider authorization', () => {
  beforeEach(() => { localStorage.clear(); useExternalAuth(null); vi.unstubAllGlobals() })

  it('registers a public client with the scopes needed to read, author and play', async () => {
    const request = vi.fn((options) => options.success({ statusCode: 201, data: { client_id: 'playground-client' } }))
    vi.stubGlobal('uni', { request })
    expect(await ensureClientId()).toBe('playground-client')
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/oauth/register', method: 'POST',
      data: expect.objectContaining({
        client_name: 'Moonstage',
        scope: 'profile.read role.read role.write chat.play',
        token_endpoint_auth_method: 'none',
      }),
    }))
    expect(OPEN_API_SCOPE).toBe('profile.read role.read role.write chat.play')
    expect(OPEN_API_RESOURCE).toBe('https://api.harperharbor.com/open/v1')
  })

  it('keeps embedded credentials under host control', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('host-token')
    useExternalAuth({ getAccessToken, onUnauthorized: vi.fn() })
    expect(await getFreshAccessToken()).toBe('host-token')
    expect(localStorage.length).toBe(0)
    useExternalAuth(null)
  })
})
