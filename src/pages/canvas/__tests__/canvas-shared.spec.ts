import { describe, it, expect, vi } from 'vitest'
import { createCanvasShared } from '../canvas-shared'

const codeOf = async (p: Promise<unknown>) => { try { await p; return 'ok' } catch (e) { return (e as { code?: string }).code } }

function fakeHost() {
  return {
    read: vi.fn(async () => ({ boss: { kind: 'counter', total: 3 } })),
    vote: vi.fn(async () => ({ mine: 'b' })),
    add: vi.fn(async () => ({ total: 4, mine: 1, reachedAt: null })),
    leaderboard: vi.fn(async () => ({ items: [] })),
    tallyLink: vi.fn(async () => 'https://sukisuki.ai/cards/1?ref=AB&share=~K7Q2M9XA'),
    respond: vi.fn(async () => ({ ok: true })),
    results: vi.fn(async () => ({ items: [] })),
  }
}

describe('畫布的共用狀態（沙箱橋與 window.stage 同一個入口）', () => {
  it('宿主沒接：全部 HOST_DENIED', async () => {
    const shared = createCanvasShared({ host: undefined, roleId: () => '7', writable: () => true })
    expect(await codeOf(shared.run('shared.read', ['boss']))).toBe('HOST_DENIED')
    expect(await codeOf(shared.api.shared.vote('p1-4', 'b'))).toBe('HOST_DENIED')
  })

  it('照這張卡問宿主，參數是驗過整理過的', async () => {
    const host = fakeHost()
    const shared = createCanvasShared({ host, roleId: () => '7', writable: () => true })
    expect(await shared.run('shared.read', [['boss', 'boss']])).toEqual({ boss: { kind: 'counter', total: 3 } })
    expect(host.read).toHaveBeenCalledWith('7', ['boss'])
    await shared.run('shared.add', ['boss', 1])
    expect(host.add).toHaveBeenCalledWith('7', 'boss', 1)
    await shared.run('shared.leaderboard', ['boss'])
    expect(host.leaderboard).toHaveBeenCalledWith('7', 'boss', 10)
    await shared.run('share.tally', ['p1-4.b', 'p1-4'])
    expect(host.tallyLink).toHaveBeenCalledWith('7', 'p1-4.b', 'p1-4')
    await shared.run('share.respond', ['c'])
    expect(host.respond).toHaveBeenCalledWith('7', 'c')
    expect(await codeOf(shared.run('shared.add', ['boss', 5000]))).toBe('INVALID_ARGS')
    expect(await codeOf(shared.run('shared.nope' as 'shared.read', []))).toBe('INVALID_ARGS')
  })

  it('看紀錄（唯讀）時能讀、能看排行與結果，寫入一律 HOST_DENIED', async () => {
    const host = fakeHost()
    const shared = createCanvasShared({ host, roleId: () => '7', writable: () => false })
    expect(await codeOf(shared.run('shared.read', ['boss']))).toBe('ok')
    expect(await codeOf(shared.run('shared.leaderboard', ['boss']))).toBe('ok')
    expect(await codeOf(shared.run('share.results', []))).toBe('ok')
    for (const [op, args] of [['shared.vote', ['p1-4', 'b']], ['shared.add', ['boss', 1]], ['share.tally', ['a', 'p1-4']], ['share.respond', ['c']]] as const) {
      expect(await codeOf(shared.run(op, [...args]))).toBe('HOST_DENIED')
    }
    expect(host.vote).not.toHaveBeenCalled()
  })

  it('宿主丟的錯：名單裡的碼與 data 原樣給卡片，其他當 NETWORK', async () => {
    const host = fakeHost()
    host.add.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'LIMIT_REACHED', data: { reason: 'goal' } }))
    host.vote.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    host.read.mockRejectedValueOnce({ code: 'rate_limited' })
    const shared = createCanvasShared({ host, roleId: () => '7', writable: () => true })
    await expect(shared.run('shared.add', ['boss', 1])).rejects.toMatchObject({ code: 'LIMIT_REACHED', data: { reason: 'goal' } })
    expect(await codeOf(shared.run('shared.vote', ['p1-4', 'b']))).toBe('NETWORK')
    expect(await codeOf(shared.run('shared.read', ['boss']))).toBe('NETWORK')
  })

  it('沒有 roleId（預覽）：HOST_DENIED，不問宿主', async () => {
    const host = fakeHost()
    const shared = createCanvasShared({ host, roleId: () => '', writable: () => true })
    expect(await codeOf(shared.run('shared.read', ['boss']))).toBe('HOST_DENIED')
    expect(host.read).not.toHaveBeenCalled()
  })
})
