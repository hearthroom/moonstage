/**
 * 帳號範圍的接線：宿主給範圍 → 共用持久層換範圍；格式不對當沒給；登出 → 持久層清掉、通知沙箱橋。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const persist = { get: vi.fn(), set: vi.fn(), setScope: vi.fn(() => Promise.resolve()), clear: vi.fn(() => Promise.resolve()) }
vi.mock('../persist-idb', () => ({ createIdbRulePersist: vi.fn(() => persist) }))

const HASH = 'f'.repeat(64)

describe('作者規則的帳號範圍', () => {
  beforeEach(() => { vi.resetModules(); persist.setScope.mockClear(); persist.clear.mockClear() })

  it('給雜湊：共用持久層換成這個範圍；沙箱橋讀得到', async () => {
    const m = await import('../index')
    m.setAuthorRuleStorageScope(HASH)
    expect(persist.setScope).toHaveBeenLastCalledWith(HASH)
    expect(m.getAuthorRuleStorageScope()).toBe(HASH)
  })

  it.each([['數字帳號 ID', '1234567'], ['太短', 'abc'], ['含冒號', 'provider:12345678901234567'], ['沒給', undefined], ['null', null]])(
    '%s：當沒給，持久層不存（範圍 null）', async (_n, value) => {
      const m = await import('../index')
      m.setAuthorRuleStorageScope(value)
      expect(persist.setScope).toHaveBeenLastCalledWith(null)
      expect(m.getAuthorRuleStorageScope()).toBeNull()
    })

  it('登出清除：持久層 clear、範圍變成沒有、通知沙箱橋', async () => {
    const m = await import('../index')
    const events: unknown[] = []
    m.onAuthorRuleStorageChange((e) => events.push(e))
    m.setAuthorRuleStorageScope(HASH)
    await m.clearAuthorRuleStorage()
    expect(persist.clear).toHaveBeenCalledTimes(1)
    expect(m.getAuthorRuleStorageScope()).toBeNull()
    expect(events.at(-1)).toEqual({ type: 'clear' })
  })

  it('排程器用的就是這個共用持久層（範圍晚於排程器建立也生效）', async () => {
    const m = await import('../index')
    const { createIdbRulePersist } = await import('../persist-idb')
    vi.mocked(createIdbRulePersist).mockClear()
    m.getAuthorRuleRunner()
    m.setAuthorRuleStorageScope(HASH)
    expect(vi.mocked(createIdbRulePersist)).toHaveBeenCalledTimes(1)
    expect(persist.setScope).toHaveBeenLastCalledWith(HASH)
  })
})
