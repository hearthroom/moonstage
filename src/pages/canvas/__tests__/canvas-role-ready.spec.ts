import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { whenRoleDetail } from '../canvas-role-ready'

describe('whenRoleDetail', () => {
  it('這張卡的角色細節已在：立刻往下', async () => {
    const role = ref<any>({ characterRoleId: 'b', language: 'zh-Hant' })
    let ok = false
    whenRoleDetail(role, () => role.value, 'b').then(() => { ok = true })
    await Promise.resolve()
    expect(ok).toBe(true)
  })
  it('store 還是上一張卡：等這張卡的細節到了才往下', async () => {
    const role = ref<any>({ characterRoleId: 'a' })
    let ok = false
    whenRoleDetail(role, () => role.value, 'b').then(() => { ok = true })
    await nextTick(); await Promise.resolve()
    expect(ok).toBe(false)
    role.value = { characterRoleId: 'b', language: 'zh-Hant' }
    await nextTick(); await Promise.resolve()
    expect(ok).toBe(true)
  })
  it('一直讀不到：逾時照樣往下', async () => {
    vi.useFakeTimers()
    const role = ref<any>(null)
    let ok = false
    whenRoleDetail(role, () => role.value, 'b', 3000).then(() => { ok = true })
    vi.advanceTimersByTime(2999)
    await Promise.resolve()
    expect(ok).toBe(false)
    vi.advanceTimersByTime(1)
    await Promise.resolve()
    expect(ok).toBe(true)
    vi.useRealTimers()
  })
})
