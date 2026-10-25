/**
 * 卡片的共用狀態（原語 3：全服投票、共鬥計數器、排行榜）與分享回流（原語 2：朋友從短碼連結回答、
 * 分享者看結果）。設計見 docs/studio/tasks/2026-10-25-card-share-context/design.md §7（monorepo docs）。
 *
 * 值都在宿主站（Worker 的 /v1/cards/:roleId/state、share-tokens），舞台只轉手：
 *   - 沙箱卡 sdk.shared／sdk.share 經 postMessage 請宿主代辦（殼不知道 roleId、登入 token、短碼）；
 *   - 一般卡 window.stage.shared／stage.share 直接呼叫畫布的轉接（pages/canvas/canvas-shared.ts）。
 * 兩條路共用這一份：參數在送出前驗（沙箱殼驗一次給作者快速的錯誤，宿主那端再驗一次，因為殼裡的
 * 作者腳本能自己 postMessage），宿主給的值整理過才交給卡片。錯誤碼兩種 pageMode 一樣，都是大寫。
 */
import { SHARE_CONTEXT_RE } from './share-context'

/** key 與選項 ID：跟情境碼同一套字元規則（Worker 的 SHARED_KEY_RE）。 */
export const SHARED_KEY_RE = SHARE_CONTEXT_RE
/** 一次最多讀幾個 key（Worker 每次只回前 16 個）。 */
export const SHARED_READ_MAX_KEYS = 16
/** 計數器單次加多少的上限（作者宣告的 maxStep 不會超過它）。 */
export const SHARED_DELTA_MAX = 1000
export const SHARED_LEADERBOARD_MAX = 50
const SHARED_LEADERBOARD_DEFAULT = 10

export const SHARED_ERROR_CODES = [
  'SHARED_DISABLED', 'NOT_DECLARED', 'OPTION_INVALID', 'NOT_ELIGIBLE', 'RATE_LIMITED', 'LIMIT_REACHED',
  'HOST_DENIED', 'UNAUTHORIZED', 'INVALID_ARGS', 'NETWORK', 'SHARE_CONTEXT_INVALID',
] as const
export type SharedErrorCode = (typeof SHARED_ERROR_CODES)[number]

export type SharedOp = 'shared.read' | 'shared.vote' | 'shared.add' | 'shared.leaderboard' | 'share.tally' | 'share.respond' | 'share.results'
export const SHARED_OPS: readonly SharedOp[] = ['shared.read', 'shared.vote', 'shared.add', 'shared.leaderboard', 'share.tally', 'share.respond', 'share.results']
/** 會改數字或產生短碼的操作：看紀錄（唯讀）時不給。 */
export const SHARED_WRITE_OPS: readonly SharedOp[] = ['shared.vote', 'shared.add', 'share.tally', 'share.respond']

export interface SharedPoll { kind: 'poll'; counts: Record<string, number>; total: number; mine?: string | null }
export interface SharedCounter { kind: 'counter'; total: number; mine?: number; goal?: number; reachedAt?: number | null; previous?: number }
export type SharedItem = SharedPoll | SharedCounter
export interface SharedLeaderboard { items: Array<{ rank: number; name: string | null; value: number }>; mine?: { rank: number; value: number } }
export interface ShareResult { context: string; pollKey: string; total: number; counts: Record<string, number> | null; updatedAt: string | null }

export interface SharedApi {
  read(keys: string | string[]): Promise<Record<string, SharedItem>>
  vote(key: string, option: string): Promise<{ mine: string }>
  add(key: string, delta: number): Promise<{ total: number; mine: number; reachedAt: number | null }>
  leaderboard(key: string, options?: { limit?: number }): Promise<SharedLeaderboard>
}
export interface ShareTallyApi {
  tallyLink(context: string, pollKey: string): Promise<string>
  respond(option: string): Promise<{ ok: true }>
  results(): Promise<ShareResult[]>
}

/** 宿主（StageHost.shared）：roleId 由舞台補上；短碼、登入、草稿試玩都是宿主的事。錯誤丟 { code, data? }，碼用上面的名單。 */
export interface SharedHost {
  read(roleId: string, keys: string[]): Promise<unknown>
  vote(roleId: string, key: string, option: string): Promise<unknown>
  add(roleId: string, key: string, delta: number): Promise<unknown>
  leaderboard(roleId: string, key: string, limit: number): Promise<unknown>
  /** 產生這條分享回流連結（帶平台短碼與分享者的推薦碼）。 */
  tallyLink(roleId: string, context: string, pollKey: string): Promise<unknown>
  /** 回答這次開卡帶來的短碼上的投票（宿主記得是哪個短碼）。 */
  respond(roleId: string, option: string): Promise<unknown>
  results(roleId: string): Promise<unknown>
}

export type SharedErrorFactory = (code: SharedErrorCode, message?: string, data?: Record<string, unknown>) => Error
export const sharedError: SharedErrorFactory = (code, message, data) => Object.assign(new Error(message || code), { code }, data ? { data } : {})

const keyOf = (v: unknown, fail: SharedErrorFactory, what = 'key'): string => {
  if (typeof v !== 'string') throw fail('INVALID_ARGS', `${what} must be a string`)
  if (!SHARED_KEY_RE.test(v)) throw fail('NOT_DECLARED', `${what} is not a declared key`)
  return v
}
const optionOf = (v: unknown, fail: SharedErrorFactory): string => {
  if (typeof v !== 'string') throw fail('INVALID_ARGS', 'option must be a string')
  if (!SHARED_KEY_RE.test(v)) throw fail('OPTION_INVALID', 'option is not one of the declared options')
  return v
}

/** 驗並整理參數；不合格就丟錯。回傳的是要交給宿主的參數（roleId 之外）。 */
export function sharedArgs(op: SharedOp, args: unknown[], fail: SharedErrorFactory = sharedError): unknown[] {
  switch (op) {
    case 'shared.read': {
      const raw = Array.isArray(args[0]) ? args[0] : typeof args[0] === 'string' ? [args[0]] : null
      if (!raw || !raw.length) throw fail('INVALID_ARGS', 'keys must be a key or a list of keys')
      const keys = [...new Set(raw.map((k) => { if (typeof k !== 'string' || !SHARED_KEY_RE.test(k)) throw fail('INVALID_ARGS', 'keys must be declared keys'); return k }))]
      if (keys.length > SHARED_READ_MAX_KEYS) throw fail('INVALID_ARGS', `read at most ${SHARED_READ_MAX_KEYS} keys at a time`)
      return [keys]
    }
    case 'shared.vote': return [keyOf(args[0], fail), optionOf(args[1], fail)]
    case 'shared.add': {
      const key = keyOf(args[0], fail)
      const d = args[1]
      if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > SHARED_DELTA_MAX) throw fail('INVALID_ARGS', `delta must be a whole number from 1 to ${SHARED_DELTA_MAX}`)
      return [key, d]
    }
    case 'shared.leaderboard': {
      const key = keyOf(args[0], fail)
      const o = args[1]
      if (o === undefined) return [key, SHARED_LEADERBOARD_DEFAULT]
      // 整理後送出去的是 [key, limit]：殼與畫布入口各驗一次，同一份規則要收得下自己整理過的結果
      if (typeof o !== 'number' && (!o || typeof o !== 'object')) throw fail('INVALID_ARGS', 'options must be an object')
      const limit = typeof o === 'number' ? o : (o as { limit?: unknown }).limit
      if (limit === undefined) return [key, SHARED_LEADERBOARD_DEFAULT]
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > SHARED_LEADERBOARD_MAX) throw fail('INVALID_ARGS', `limit must be a whole number from 1 to ${SHARED_LEADERBOARD_MAX}`)
      return [key, limit]
    }
    case 'share.tally': {
      if (typeof args[0] !== 'string' || !SHARE_CONTEXT_RE.test(args[0])) throw fail('SHARE_CONTEXT_INVALID', 'context must be 1-64 letters, digits, ".", "_" or "-", starting with a letter or digit')
      return [args[0], keyOf(args[1], fail, 'pollKey')]
    }
    case 'share.respond': return [optionOf(args[0], fail)]
    case 'share.results': return []
    default: throw fail('INVALID_ARGS', 'unknown operation')
  }
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0)
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const counts = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const [k, n] of Object.entries(obj(v) ?? {})) if (SHARED_KEY_RE.test(k)) out[k] = count(n)
  return out
}

function itemOf(v: unknown): SharedItem | null {
  const o = obj(v)
  if (o?.kind === 'poll') {
    const item: SharedPoll = { kind: 'poll', counts: counts(o.counts), total: count(o.total) }
    if (typeof o.mine === 'string' || o.mine === null) item.mine = o.mine
    return item
  }
  if (o?.kind === 'counter') {
    const item: SharedCounter = { kind: 'counter', total: count(o.total) }
    if (o.goal !== undefined) item.goal = count(o.goal)
    if (o.reachedAt !== undefined) item.reachedAt = typeof o.reachedAt === 'number' ? o.reachedAt : null
    if (o.previous !== undefined) item.previous = count(o.previous)
    if (o.mine !== undefined) item.mine = count(o.mine)
    return item
  }
  return null
}

/** 宿主給的值只收形狀對的；壞的欄位當沒有。 */
export function sharedResult(op: SharedOp, value: unknown): unknown {
  const o = obj(value)
  switch (op) {
    case 'shared.read': {
      const out: Record<string, SharedItem> = {}
      for (const [k, v] of Object.entries(o ?? {})) { const item = SHARED_KEY_RE.test(k) ? itemOf(v) : null; if (item) out[k] = item }
      return out
    }
    case 'shared.vote': return { mine: typeof o?.mine === 'string' ? o.mine : '' }
    case 'shared.add': return { total: count(o?.total), mine: count(o?.mine), reachedAt: typeof o?.reachedAt === 'number' ? o.reachedAt : null }
    case 'shared.leaderboard': {
      const items = (Array.isArray(o?.items) ? o!.items : []).map((r) => obj(r)).filter((r): r is Record<string, unknown> => !!r)
        .map((r) => ({ rank: count(r.rank), name: typeof r.name === 'string' ? r.name : null, value: count(r.value) }))
      const mine = obj(o?.mine)
      return mine ? { items, mine: { rank: count(mine.rank), value: count(mine.value) } } : { items }
    }
    case 'share.tally': return typeof value === 'string' && /^https?:\/\//.test(value) ? value : null
    case 'share.respond': return { ok: true }
    case 'share.results': {
      const rows = Array.isArray(o?.items) ? o!.items : Array.isArray(value) ? value : []
      return rows.map((r) => obj(r)).filter((r): r is Record<string, unknown> => !!r && typeof r.context === 'string' && typeof r.pollKey === 'string')
        .map((r) => ({ context: r.context as string, pollKey: r.pollKey as string, total: count(r.total), counts: obj(r.counts) ? counts(r.counts) : null, updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null }))
    }
  }
}

/**
 * 卡片看到的 shared 與 share 的回流方法。send 是傳輸（沙箱：請宿主代辦；一般卡：畫布轉接），
 * 它自己決定宿主沒接時丟什麼；這裡只管參數與回傳的形狀。
 */
export function createSharedApi(send: (op: SharedOp, args: unknown[]) => Promise<unknown>, fail: SharedErrorFactory): { shared: SharedApi; tally: ShareTallyApi } {
  const run = async (op: SharedOp, args: unknown[]) => sharedResult(op, await send(op, sharedArgs(op, args, fail)))
  return {
    shared: {
      read: (keys) => run('shared.read', [keys]) as Promise<Record<string, SharedItem>>,
      vote: (key, option) => run('shared.vote', [key, option]) as Promise<{ mine: string }>,
      add: (key, delta) => run('shared.add', [key, delta]) as Promise<{ total: number; mine: number; reachedAt: number | null }>,
      leaderboard: (key, options) => run('shared.leaderboard', options === undefined ? [key] : [key, options]) as Promise<SharedLeaderboard>,
    },
    tally: {
      async tallyLink(context, pollKey) {
        const url = await run('share.tally', [context, pollKey])
        if (typeof url !== 'string') throw fail('HOST_DENIED', 'share links are not available here')
        return url
      },
      respond: (option) => run('share.respond', [option]) as Promise<{ ok: true }>,
      results: () => run('share.results', []) as Promise<ShareResult[]>,
    },
  }
}
