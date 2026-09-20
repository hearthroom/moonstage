import { afterEach, describe, it, expect, vi } from 'vitest'
import { transformCloudflareImage, cfImageDesktop } from '../image-transform.js'

describe('transformCloudflareImage', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('does not assume image resizing is enabled on a provider domain', () => {
    vi.stubEnv('VITE_IMAGE_RESIZING_ZONE', '')
    const url = 'https://objects.harperharbor.com/abc/avatar.png'
    expect(transformCloudflareImage(url, { width: 160 })).toBe(url)
  })
  it('rewrites images on our own host into the Cloudflare resizing form', () => {
    vi.stubEnv('VITE_IMAGE_RESIZING_ZONE', 'harperharbor.com')
    expect(transformCloudflareImage('https://objects.harperharbor.com/abc/avatar.png', { width: 160, quality: 90, format: 'auto' }))
      .toBe('https://objects.harperharbor.com/cdn-cgi/image/width=160,quality=90,format=auto/abc/avatar.png')
  })

  it('leaves images on other hosts untouched: resizing only exists on our zone, elsewhere the rewritten path is a 404', () => {
    const external = 'https://meimoaiimg.com/202608/2087193851744796672.gif'
    expect(transformCloudflareImage(external, { width: 160, quality: 90, format: 'auto' })).toBe(external)
    expect(cfImageDesktop(external, 'avatarMedium')).toBe(external)
  })

  it('still strips stale query parameters on external hosts', () => {
    expect(transformCloudflareImage('https://cdn.example.com/a.png?imageView2/1', { width: 100 })).toBe('https://cdn.example.com/a.png')
  })
})
