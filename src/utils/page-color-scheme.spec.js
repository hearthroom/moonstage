// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'

import { claimPageColorScheme } from './page-color-scheme.js'

const meta = () => document.head.querySelector('meta[name="color-scheme"]')

afterEach(() => {
  const m = meta()
  if (m) m.remove()
})

describe('claimPageColorScheme', () => {
  it('掛上聲明，撤掉後 head 回到原樣', () => {
    expect(meta()).toBeNull()
    const release = claimPageColorScheme()
    expect(meta()?.getAttribute('content')).toBe('light dark')
    release()
    expect(meta()).toBeNull()
  })

  it('頁面本來就有聲明：只改內容，撤掉時還原原值', () => {
    const own = document.createElement('meta')
    own.setAttribute('name', 'color-scheme')
    own.setAttribute('content', 'light')
    document.head.appendChild(own)
    const release = claimPageColorScheme('dark')
    expect(meta()).toBe(own)
    expect(own.getAttribute('content')).toBe('dark')
    release()
    expect(own.getAttribute('content')).toBe('light')
    expect(meta()).toBe(own)
  })

  it('撤兩次不會出事；沒有 document 時是空操作', () => {
    const release = claimPageColorScheme()
    release()
    expect(() => release()).not.toThrow()
    expect(meta()).toBeNull()
    expect(() => claimPageColorScheme('light dark', null)()).not.toThrow()
  })
})
