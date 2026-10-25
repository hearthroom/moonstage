import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
    const shared = createCanvasShared({ host: undefined, roleId: () => '7', writable: () => true }).forRole('7')
    expect(await codeOf(shared.run('shared.read', ['boss']))).toBe('HOST_DENIED')
    expect(await codeOf(shared.api.shared.vote('p1-4', 'b'))).toBe('HOST_DENIED')
  })

  it('照這張卡問宿主，參數是驗過整理過的', async () => {
    const host = fakeHost()
    const shared = createCanvasShared({ host, roleId: () => '7', writable: () => true }).forRole('7')
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
    const shared = createCanvasShared({ host, roleId: () => '7', writable: () => false }).forRole('7')
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
    const shared = createCanvasShared({ host, roleId: () => '7', writable: () => true }).forRole('7')
    await expect(shared.run('shared.add', ['boss', 1])).rejects.toMatchObject({ code: 'LIMIT_REACHED', data: { reason: 'goal' } })
    expect(await codeOf(shared.run('shared.vote', ['p1-4', 'b']))).toBe('NETWORK')
    expect(await codeOf(shared.run('shared.read', ['boss']))).toBe('NETWORK')
  })

  it('沒有 roleId（預覽）：HOST_DENIED，不問宿主', async () => {
    const host = fakeHost()
    const shared = createCanvasShared({ host, roleId: () => '', writable: () => true }).forRole('')
    expect(await codeOf(shared.run('shared.read', ['boss']))).toBe('HOST_DENIED')
    expect(host.read).not.toHaveBeenCalled()
  })
})

describe('綁住掛載時的卡', () => {
  it('畫布換了卡，舊卡片的請求（沙箱與一般卡）一律 HOST_DENIED，不會落到新卡', async () => {
    const host = fakeHost()
    let current = '7'
    const shared = createCanvasShared({ host, roleId: () => current, writable: () => true })
    const old = shared.forRole('7')
    expect(await codeOf(old.run('shared.read', ['boss']))).toBe('ok')
    current = '8'
    expect(await codeOf(old.run('shared.vote', ['p1-4', 'b']))).toBe('HOST_DENIED')
    expect(await codeOf(old.api.shared.add('boss', 1))).toBe('HOST_DENIED')
    expect(host.vote).not.toHaveBeenCalled()
    expect(host.add).not.toHaveBeenCalled()
    expect(await codeOf(shared.forRole('8').run('shared.read', ['boss']))).toBe('ok')
    expect(host.read).toHaveBeenLastCalledWith('8', ['boss'])
  })
})

describe('canvas.vue 的接線（QA F1：一般卡的作者宿主用了沒定義的變數，window.stage 整個沒建起來）', () => {
  const source = readFileSync(join(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
  const body = (anchor: string) => {
    const start = source.indexOf(anchor)
    expect(start, anchor).toBeGreaterThan(-1)
    let depth = 0, i = source.indexOf('{', start)
    for (; i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}' && --depth === 0) break }
    return source.slice(start, i + 1)
  }
  it('一般卡的作者宿主在建立當下綁住畫布的卡；呼叫端不必（也不能）自己帶變數', () => {
    expect(body('function buildAuthorAssetHost(')).toContain("canvasShared.forRole(String(unref(roleId) || ''))")
    expect(body('function applyAuthorAsset(')).toContain('hostOutsideAuthorScope(buildAuthorAssetHost(), scope)')
  })
  it('沙箱宿主綁住它掛載的那張卡', () => {
    expect(source).toContain('shared: stageHost.shared ? canvasShared.forRole(targetRoleId) : null')
  })
})

describe('QA F2：卡片 → 殼（或一般卡）→ 畫布入口 → 宿主，整條串起來', () => {
  it('排行榜預設與帶 limit 都送到宿主（沙箱與一般卡）', async () => {
    const { createSharedApi } = await import('@/common/shared-state')
    const { SdkError } = await import('@/sandbox/sdk/errors')
    const host = fakeHost()
    const entry = createCanvasShared({ host, roleId: () => '7', writable: () => true }).forRole('7')
    // 沙箱：殼這一層的 createSharedApi 把整理過的參數送進畫布入口的 run
    const shell = createSharedApi((op, args) => entry.run(op, args), (c, m, d) => new SdkError(c, m, d))
    await shell.shared.leaderboard('boss')
    await shell.shared.leaderboard('boss', { limit: 25 })
    // 一般卡：window.stage.shared 直接是畫布入口的 api
    await entry.api.shared.leaderboard('boss', { limit: 5 })
    expect(host.leaderboard.mock.calls).toEqual([['7', 'boss', 10], ['7', 'boss', 25], ['7', 'boss', 5]])
    await shell.shared.read(['boss'])
    await shell.shared.vote('p1-4', 'a')
    await shell.shared.add('boss', 2)
    await shell.tally.tallyLink('p1-4.b', 'p1-4')
    await shell.tally.respond('a')
    await shell.tally.results()
    expect([host.read, host.vote, host.add, host.tallyLink, host.respond, host.results].map((f) => f.mock.calls.length)).toEqual([1, 1, 1, 1, 1, 1])
  })
})
