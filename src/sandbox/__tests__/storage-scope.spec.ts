// @vitest-environment jsdom
/**
 * 殼：握手帶來的帳號範圍交給作者規則的持久層；沒帶就清掉；宿主登出時叫殼清掉。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('@/common/author-rules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/author-rules')>()
  return { ...actual, setAuthorRuleStorageScope: vi.fn(), clearAuthorRuleStorage: vi.fn(() => Promise.resolve()) }
})

import { setAuthorRuleStorageScope, clearAuthorRuleStorage } from '@/common/author-rules'
import { createShell, type Shell } from '../shell'
import type { SandboxHelloConfig } from '../protocol'

function config(over: Partial<SandboxHelloConfig> = {}): SandboxHelloConfig {
  return {
    theme: 'dark', locale: 'zh-Hant', role: { name: '露娜', avatarUrl: '' }, user: { nickname: '小明', avatarUrl: '' },
    card: { rules: [], statusbar: '' }, capabilities: { saves: false, edit: false, send: true }, composer: true, ...over,
  }
}

let shell: Shell | null = null
const boot = (cfg: SandboxHelloConfig) => {
  document.body.innerHTML = '<div id="app"></div>'
  shell = createShell({ doc: document, win: window as Window & typeof globalThis, mount: document.getElementById('app')!, config: cfg, transport: { send: () => {} } })
  return shell
}
afterEach(() => { shell?.dispose(); shell = null; vi.mocked(setAuthorRuleStorageScope).mockClear(); vi.mocked(clearAuthorRuleStorage).mockClear() })

describe('殼：作者規則持久層的帳號範圍', () => {
  it('握手帶了範圍：交給持久層（範圍不同時持久層會先清掉舊的）', () => {
    boot(config({ storageScope: 'c'.repeat(64) }))
    expect(setAuthorRuleStorageScope).toHaveBeenCalledWith('c'.repeat(64))
  })

  it('握手沒帶範圍（沒登入、舊宿主）：範圍設成沒有＝刪掉這個 origin 上的資料、只用記憶體', () => {
    boot(config())
    expect(setAuthorRuleStorageScope).toHaveBeenCalledWith(null)
  })

  it('宿主登出時送 storage.clear：殼清掉', () => {
    const s = boot(config({ storageScope: 'c'.repeat(64) }))
    s.handle({ type: 'storage.clear' })
    expect(clearAuthorRuleStorage).toHaveBeenCalledTimes(1)
  })
})
