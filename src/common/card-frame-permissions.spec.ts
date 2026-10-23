import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { mountFrontendBlocks } from './frontend-block'

const permissions = ['autoplay', 'fullscreen', 'web-share', 'clipboard-write']
const tokens = (value: string | null) => (value || '').split(';').map(x => x.trim()).filter(Boolean).sort()

describe('card iframe permissions', () => {
  it('delegates only playback, sharing and clipboard writes to the sandbox page', () => {
    const source = readFileSync('src/pages/canvas/canvas.vue', 'utf8')
    const frame = source.match(/<iframe[\s\S]*?<\/iframe>/)?.[0] || ''
    expect(tokens(frame.match(/\ballow="([^"]*)"/)?.[1] || null)).toEqual([...permissions].sort())
    expect(frame).toContain(':sandbox="sandboxAttr"')
  })

  it('delegates the same capabilities to frontend blocks in classic and sandbox messages', () => {
    const root = document.createElement('div')
    root.innerHTML = '<pre class="lt-frontend"><code>&lt;html&gt;&lt;body&gt;card&lt;/body&gt;&lt;/html&gt;</code></pre>'
    expect(mountFrontendBlocks(root)).toBe(1)
    expect(tokens(root.querySelector('iframe')!.getAttribute('allow'))).toEqual([...permissions].sort())
    expect(mountFrontendBlocks(root)).toBe(0)
  })
})
