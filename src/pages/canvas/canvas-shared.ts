/**
 * 畫布的共用狀態與分享回流（common/shared-state.ts）：沙箱宿主橋與一般卡的 window.stage 都從這裡進宿主。
 * 這裡是信任邊界——沙箱殼裡的作者腳本能自己 postMessage，所以參數在這裡再驗一次，roleId 由畫布補上。
 * 看自己的紀錄時能讀數字、看排行與結果，但不能投票、加數、產生或回答分享連結：那不是一局正在玩的對話。
 */
import type { StageHost } from '@/host/stage-host'
import { createSharedApi, sharedArgs, sharedError, sharedResult, SHARED_ERROR_CODES, SHARED_OPS, SHARED_WRITE_OPS, type SharedErrorCode, type SharedOp } from '@/common/shared-state'

export interface CanvasSharedDeps {
  host: StageHost['shared']
  roleId(): string
  /** 這一局能不能寫（看紀錄、不能生成時 false）。 */
  writable(): boolean
}

export interface CanvasShared {
  /** 沙箱橋用：op 與殼送來的原始參數；回整理過的值，或丟 { code, data? }。 */
  run(op: SharedOp, args: unknown[]): Promise<unknown>
  /** 一般卡用：跟 sdk.shared／sdk.share 同一組方法。 */
  api: ReturnType<typeof createSharedApi>
}

const known = (code: unknown): code is SharedErrorCode => (SHARED_ERROR_CODES as readonly string[]).includes(String(code))

export function createCanvasShared(deps: CanvasSharedDeps): CanvasShared {
  const call = async (op: SharedOp, args: unknown[]): Promise<unknown> => {
    if (!SHARED_OPS.includes(op)) throw sharedError('INVALID_ARGS', 'unknown operation')
    const clean = sharedArgs(op, args)
    const host = deps.host
    const roleId = deps.roleId()
    if (!host || !roleId) throw sharedError('HOST_DENIED', 'shared state is not available here')
    if (SHARED_WRITE_OPS.includes(op) && !deps.writable()) throw sharedError('HOST_DENIED', 'this conversation is read-only')
    try {
      switch (op) {
        case 'shared.read': return await host.read(roleId, clean[0] as string[])
        case 'shared.vote': return await host.vote(roleId, clean[0] as string, clean[1] as string)
        case 'shared.add': return await host.add(roleId, clean[0] as string, clean[1] as number)
        case 'shared.leaderboard': return await host.leaderboard(roleId, clean[0] as string, clean[1] as number)
        case 'share.tally': return await host.tallyLink(roleId, clean[0] as string, clean[1] as string)
        case 'share.respond': return await host.respond(roleId, clean[0] as string)
        case 'share.results': return await host.results(roleId)
      }
    } catch (e) {
      const err = e as { code?: unknown; message?: unknown; data?: unknown }
      const data = err?.data && typeof err.data === 'object' ? (err.data as Record<string, unknown>) : undefined
      throw known(err?.code) ? sharedError(err.code, typeof err.message === 'string' ? err.message : undefined, data) : sharedError('NETWORK')
    }
  }
  return {
    run: async (op, args) => sharedResult(op, await call(op, args)),
    // call 已經驗過參數；createSharedApi 再驗一次是同一份規則，沒有副作用
    api: createSharedApi(call, sharedError),
  }
}
