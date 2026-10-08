/**
 * 作者看到的 `sdk`：15 個鍵、42 個能力（後來加了 text、model、archive、generation），全部從第一版就存在——作者腳本在頂層探測它們，
 * 少一個就是「按鈕全不響應」而沒有任何報錯。每個能力有實作狀態：實作／宿主沒接（HOST_DENIED）。
 *
 * 錯誤慣例（作者的程式碼依賴）：
 *   - 同步能力直接 throw SdkError；非同步能力回 rejected Promise。作者對 save.get/keys 用 try，
 *     對 message.send/save.set 用 .catch。
 *   - `save.get`／`save.keys` 在存檔預載完成前同步丟 HOST_DENIED（「存檔未預載」）。
 *   - key 只許 `[A-Za-z0-9_-]{1,64}`；含冒號等其他字元 → INVALID_ARGS。
 *   - 限頻：save.set 20／分、message.send 手勢 3／分、自動 3／分、message.edit 10／分 → RATE_LIMITED。
 *   - 生成中再 message.send → BUSY（不排隊、不占限頻）。
 *   - 非手勢的 message.send → 殼內問使用者；拒絕 → UNAUTHORIZED。
 *   - generation.act（上一輪沒正常結束時，按那張卡上的鍵）：只在玩家手勢裡、不問（沒有自動重試這回事）；
 *     只認結局裡有的動作；3／分；生成中 → BUSY。
 *   - archive.*（平台的對話存檔）：會改變存檔的操作在手勢裡直接做（卡片用自己的確認畫面），不在手勢裡殼內先問；
 *     10／分；生成中 → BUSY；存檔滿了 → LIMIT_REACHED（err.data = { count, limit }）。
 */
import { SdkError } from './errors'
import type { EventBus } from './events'
import type { GenerationOutcome } from '../protocol'

export const SAVE_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/
export const SAVE_MAX_KEYS = 10
export const SAVE_MAX_VALUE_BYTES = 64 * 1024
export const CACHE_QUOTA_BYTES = 1024 * 1024

export const RATE_LIMITS = {
  'save.set': { count: 20, windowMs: 60_000 },
  'message.send.gesture': { count: 3, windowMs: 60_000 },
  'message.send.auto': { count: 3, windowMs: 60_000 },
  'message.edit': { count: 10, windowMs: 60_000 },
  'archive.write': { count: 10, windowMs: 60_000 },
  'generation.act': { count: 3, windowMs: 60_000 },
} as const

export type RateLimitKey = keyof typeof RATE_LIMITS

export interface SdkInputHost {
  get(): string
  set(text: string): void
  focus(): void
  blur(): void
  getCursor(): number
  setCursor(n: number): void
  /** 使用者正在用輸入法組字：這時改草稿會撞掉未上屏的字。 */
  composing(): boolean
}

export interface SdkComposerHost {
  show(): void
  hide(): void
  visible(): boolean
}

export interface SdkStageHost {
  open(mode: 'content' | 'full'): void
  close(): void
  el(): HTMLElement | null
  visible(): boolean
}

export interface SdkHost {
  input: SdkInputHost
  composer: SdkComposerHost
  stage: SdkStageHost
  role(): { name: string; avatarUrl: string }
  user(): { nickname: string; avatarUrl: string; locale?: string }
  /** 顯示字形轉換（簡↔繁），方向由玩家介面語言決定；字典還沒載好或不需要轉時原樣回。 */
  text?: { convert(text: string): string; ready(): Promise<void> }
  /** 玩家目前選的模型：友善名與下一輪的點數（已格式化；動態計價是區間）。宿主還沒給時是空字串。 */
  model?: () => { name: string; cost: string }
  /** 這一輪在等什麼與從何時開始（殼收到宿主的 generation 訊息時記下），以及上一輪沒正常結束時的結局。 */
  generation?: () => { phase: string; since: number; outcome?: GenerationOutcome | null }
  capabilities: { saves: boolean; edit: boolean; send: boolean; archive?: boolean }
  /** 宿主代辦：送出、改寫、存檔寫入。 */
  request(op: 'message.send' | 'message.edit' | 'save.set' | 'save.remove' | 'archive.list' | 'archive.save' | 'archive.fork' | 'archive.open' | 'archive.new' | 'archive.rename' | 'archive.remove' | 'generation.act', args: unknown[]): Promise<unknown>
  /** 現在是不是在使用者手勢裡（點擊當下）。 */
  inGesture(): boolean
  /** 非手勢送出前問使用者；回 true 表示允許。 */
  askSendPermission(text: string): Promise<boolean>
  /** 非手勢變更存檔（archive.save/fork/open/start/rename/remove）前問使用者；沒給就當不允許。 */
  askArchivePermission?(): Promise<boolean>
  /** 宿主正在生成回覆。 */
  busy(): boolean
  debug(...args: unknown[]): void
  now?: () => number
}

export interface Sdk {
  input: {
    get(): string; set(t: string): void; add(t: string): void; insert(t: string): void; clear(): void
    focus(): void; blur(): void; getCursor(): number; setCursor(n: number): void
  }
  composer: { show(): void; hide(): void; visible(): boolean }
  message: { send(text?: string): Promise<void>; edit(id: string, text: string): Promise<void> }
  cache: { get(key: string): unknown; set(key: string, value: unknown): void; remove(key: string): void }
  save: { get(key: string): unknown; set(key: string, value: unknown): Promise<void>; remove(key: string): Promise<void>; keys(): string[] }
  stage: { open(mode?: 'content' | 'full'): void; close(): void; el(): HTMLElement | null; visible(): boolean }
  role: { get(): { name: string; avatarUrl: string } }
  user: { get(): { nickname: string; avatarUrl: string; locale: string } }
  /** 卡片自己畫的字也跟著玩家的簡繁：convert 同步轉一段純文字；ready 在字典載好（或確定不需要）時完成。 */
  text: { convert(text: string): string; ready(): Promise<void> }
  /**
   * 平台的對話存檔（每張卡最多 limit 段，含目前這段；伺服器記的，跨裝置）。每段就是一段對話：讀檔＝切過去，
   * 原本的進度原樣留著；存檔＝把目前進度留一份（從最新一則分叉、留下的那份取名）；分叉＝從某一則另開一段。
   * 切換之後殼清空訊息、重載那一段，並發 conversation:switch（{ conversationId }）。
   */
  archive: {
    list(): Promise<{ items: ArchiveItem[]; count: number; limit: number }>
    save(title?: string): Promise<{ id: string; current: string }>
    fork(messageId: string): Promise<{ id: string }>
    open(id: string): Promise<void>
    start(opening?: number): Promise<{ id: string }>
    rename(id: string, title: string): Promise<void>
    remove(id: string): Promise<void>
  }
  /** 玩家目前的模型與下一輪的點數；換模型或點數變了發 model:change（載荷同 get()）。 */
  model: { get(): { name: string; cost: string } }
  /**
   * 這一輪在等什麼：idle｜preparing（剛送出）｜summarizing（平台在整理劇情，可能幾十秒）｜thinking（模型在思考，
   * 正文還沒來）｜writing（正文串流中）。since 是進入這個階段的時間（毫秒）。變了發 generation:phase（載荷是 phase、since）。
   * outcome：上一輪沒正常結束時，那一列底下那張卡的樣式、字與鍵；正常結束或生成中是 null。變了發 generation:outcome。
   * act(action)：按那張卡上的一顆鍵（outcome.actions 裡的動作名）。
   */
  generation: {
    get(): { phase: 'idle' | 'preparing' | 'summarizing' | 'thinking' | 'writing'; since: number; outcome: GenerationOutcome | null }
    act(action: string): Promise<void>
  }
  on(event: string, cb: (payload?: unknown) => void): void
  debug: { log(...args: unknown[]): void }
  version: string
}

/** 存檔清單的一列。lastMessage 是最後一則的前 80 字；時間是 RFC 3339。 */
export interface ArchiveItem {
  id: string
  title: string
  isCurrent: boolean
  messageCount: number
  lastMessage: string
  createTime: string
  lastUpdateTime: string
}

export interface SdkController {
  sdk: Sdk
  /** 宿主把預載存檔餵進來；之後 save.get/keys 才可用。 */
  loadSaves(data: Record<string, unknown> | null | undefined): void
  savesLoaded(): boolean
}

/** 宿主給的結局只收形狀對的；壞的當沒有。 */
function outcomeOf(value: unknown): GenerationOutcome | null {
  const o = value as GenerationOutcome | null | undefined
  if (!o || typeof o !== 'object' || typeof o.kind !== 'string' || !o.kind) return null
  const actions = Array.isArray(o.actions) ? o.actions.filter((a) => a && typeof a.action === 'string' && a.action) : []
  return { kind: o.kind, label: String(o.label || ''), sub: String(o.sub || ''), actions: actions.map((a) => ({ action: a.action, label: String(a.label || '') })) }
}

function bytesOf(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value) ?? '').length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function createSdk(host: SdkHost, bus: EventBus): SdkController {
  const now = host.now || (() => Date.now())
  const stamps = new Map<RateLimitKey, number[]>()
  const takeSlot = (key: RateLimitKey) => {
    const limit = RATE_LIMITS[key]
    const t = now()
    const list = (stamps.get(key) || []).filter((s) => t - s < limit.windowMs)
    if (list.length >= limit.count) { stamps.set(key, list); throw new SdkError('RATE_LIMITED') }
    list.push(t)
    stamps.set(key, list)
  }

  // archive.*：宿主沒接就 HOST_DENIED；改變存檔的操作照 message.send 的規矩（手勢裡直接做，不在手勢裡先問）。
  const archiveReady = () => { if (!host.capabilities.archive) throw new SdkError('HOST_DENIED', 'saves are not available here') }
  const archiveTitle = (title: unknown) => {
    const t = requireString(title, 'title').trim()
    if ([...t].length > 100) throw new SdkError('INVALID_ARGS', 'title is longer than 100 characters')
    return t
  }
  const archiveWrite = async (op: 'archive.save' | 'archive.fork' | 'archive.open' | 'archive.new' | 'archive.rename' | 'archive.remove', args: unknown[]) => {
    archiveReady()
    if (host.busy()) throw new SdkError('BUSY', 'a reply is still being generated')
    if (!host.inGesture()) {
      const ok = host.askArchivePermission ? await host.askArchivePermission() : false
      if (!ok) throw new SdkError('UNAUTHORIZED', 'the user did not allow this change to their saves')
      if (host.busy()) throw new SdkError('BUSY', 'a reply is still being generated')
    }
    takeSlot('archive.write')
    return host.request(op, args)
  }

  const cache = new Map<string, unknown>()
  let cacheBytes = 0
  const saves = new Map<string, unknown>()
  let savesLoaded = false

  const requireString = (v: unknown, what: string): string => {
    if (typeof v !== 'string') throw new SdkError('INVALID_ARGS', `${what} must be a string`)
    return v
  }
  const requireSaveKey = (key: unknown): string => {
    const k = requireString(key, 'key')
    if (!SAVE_KEY_RE.test(k)) throw new SdkError('INVALID_ARGS', 'save key is not valid')
    return k
  }
  const requireSaves = () => {
    if (!host.capabilities.saves) throw new SdkError('HOST_DENIED', 'saves are not available')
    if (!savesLoaded) throw new SdkError('HOST_DENIED', 'saves are not loaded yet')
  }
  const editDraft = (fn: (draft: string, cursor: number) => string) => {
    if (host.input.composing()) throw new SdkError('INVALID_ARGS', 'input is composing')
    const draft = host.input.get()
    host.input.set(fn(draft, host.input.getCursor()))
  }

  const sdk: Sdk = {
    input: {
      get: () => host.input.get(),
      set: (t) => { requireString(t, 'text'); editDraft(() => t) },
      add: (t) => { requireString(t, 'text'); editDraft((draft) => draft + t) },
      insert: (t) => { requireString(t, 'text'); editDraft((draft, cursor) => draft.slice(0, cursor) + t + draft.slice(cursor)) },
      clear: () => editDraft(() => ''),
      focus: () => host.input.focus(),
      blur: () => host.input.blur(),
      getCursor: () => host.input.getCursor(),
      setCursor: (n) => { if (typeof n !== 'number' || !Number.isFinite(n)) throw new SdkError('INVALID_ARGS'); host.input.setCursor(Math.max(0, Math.floor(n))) },
    },
    composer: {
      show: () => host.composer.show(),
      hide: () => host.composer.hide(),
      visible: () => host.composer.visible(),
    },
    message: {
      async send(text) {
        if (!host.capabilities.send) throw new SdkError('NOT_SUPPORTED', 'send is not available here')
        const body = text == null ? host.input.get() : requireString(text, 'text')
        if (!body.trim()) throw new SdkError('INVALID_ARGS', 'message is empty')
        if (host.busy()) throw new SdkError('BUSY', 'a reply is still being generated')
        if (host.inGesture()) {
          takeSlot('message.send.gesture')
        } else {
          const ok = await host.askSendPermission(body)
          if (!ok) throw new SdkError('UNAUTHORIZED', 'the user did not allow this send')
          if (host.busy()) throw new SdkError('BUSY', 'a reply is still being generated')
          takeSlot('message.send.auto')
        }
        await host.request('message.send', [body])
      },
      async edit(id, text) {
        if (!host.capabilities.edit) throw new SdkError('HOST_DENIED', 'edit is not available')
        const target = requireString(id, 'id')
        const body = requireString(text, 'text')
        if (!target || !body.trim()) throw new SdkError('INVALID_ARGS')
        // 改寫會重送、會花點數：跟送出一樣，不在手勢裡就先問玩家。
        if (!host.inGesture()) {
          const ok = await host.askSendPermission(body)
          if (!ok) throw new SdkError('UNAUTHORIZED')
        }
        takeSlot('message.edit')
        await host.request('message.edit', [target, body])
      },
    },
    cache: {
      get: (key) => cache.get(requireString(key, 'key')),
      set: (key, value) => {
        const k = requireString(key, 'key')
        const size = bytesOf(value)
        const previous = cache.has(k) ? bytesOf(cache.get(k)) : 0
        if (cacheBytes - previous + size > CACHE_QUOTA_BYTES) throw new SdkError('INVALID_ARGS', 'cache quota exceeded')
        cacheBytes += size - previous
        cache.set(k, value)
      },
      remove: (key) => {
        const k = requireString(key, 'key')
        if (cache.has(k)) { cacheBytes -= bytesOf(cache.get(k)); cache.delete(k) }
      },
    },
    save: {
      get: (key) => { requireSaves(); return saves.get(requireSaveKey(key)) },
      keys: () => { requireSaves(); return Array.from(saves.keys()) },
      async set(key, value) {
        requireSaves()
        const k = requireSaveKey(key)
        if (bytesOf(value) > SAVE_MAX_VALUE_BYTES) throw new SdkError('INVALID_ARGS', 'save value is too large')
        // 上限要算上還在路上的寫入：十一個 set 同時發出時，等宿主回來再登記會全部放行（探針卡 2026-10-06 抓到）。
        // 先佔位，宿主拒絕了再放掉；佔位期間 get 讀到的是新值（跟寫成功後一樣）。
        const isNew = !saves.has(k)
        if (isNew && saves.size >= SAVE_MAX_KEYS) throw new SdkError('INVALID_ARGS', 'too many save keys')
        takeSlot('save.set')
        const previous = saves.get(k)
        saves.set(k, value)
        try {
          await host.request('save.set', [k, value])
        } catch (e) {
          if (isNew) saves.delete(k); else saves.set(k, previous)
          throw e
        }
      },
      async remove(key) {
        requireSaves()
        const k = requireSaveKey(key)
        await host.request('save.remove', [k])
        saves.delete(k)
      },
    },
    stage: {
      open: (mode) => host.stage.open(mode === 'full' ? 'full' : 'content'),
      close: () => host.stage.close(),
      el: () => host.stage.el(),
      visible: () => host.stage.visible(),
    },
    role: { get: () => ({ ...host.role() }) },
    user: { get: () => { const u = host.user(); return { nickname: u.nickname, avatarUrl: u.avatarUrl, locale: u.locale || '' } } },
    text: {
      convert: (text) => {
        const s = typeof text === 'string' ? text : String(text ?? '')
        return host.text ? host.text.convert(s) : s
      },
      ready: () => (host.text ? host.text.ready() : Promise.resolve()),
    },
    archive: {
      async list() {
        archiveReady()
        return (await host.request('archive.list', [])) as { items: ArchiveItem[]; count: number; limit: number }
      },
      async save(title) {
        const t = title == null ? '' : archiveTitle(title)
        return (await archiveWrite('archive.save', [t])) as { id: string; current: string }
      },
      async fork(messageId) {
        const id = requireString(messageId, 'messageId')
        if (!id) throw new SdkError('INVALID_ARGS', 'messageId is empty')
        return (await archiveWrite('archive.fork', [id])) as { id: string }
      },
      async open(id) {
        const target = requireString(id, 'id')
        if (!target) throw new SdkError('INVALID_ARGS', 'id is empty')
        await archiveWrite('archive.open', [target])
      },
      async start(opening) {
        const n = opening == null ? 0 : opening
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) throw new SdkError('INVALID_ARGS', 'opening must be 0 (the main opening) or an alternate index')
        return (await archiveWrite('archive.new', [n])) as { id: string }
      },
      async rename(id, title) {
        const target = requireString(id, 'id')
        if (!target) throw new SdkError('INVALID_ARGS', 'id is empty')
        await archiveWrite('archive.rename', [target, archiveTitle(title)])
      },
      async remove(id) {
        const target = requireString(id, 'id')
        if (!target) throw new SdkError('INVALID_ARGS', 'id is empty')
        await archiveWrite('archive.remove', [target])
      },
    },
    model: { get: () => { const m = host.model ? host.model() : null; return { name: String(m?.name || ''), cost: String(m?.cost || '') } } },
    generation: {
      get: () => {
        const g = host.generation ? host.generation() : null
        const phase = (['idle', 'preparing', 'summarizing', 'thinking', 'writing'].includes(String(g?.phase)) ? g!.phase : 'idle') as 'idle' | 'preparing' | 'summarizing' | 'thinking' | 'writing'
        return { phase, since: Number(g?.since) || 0, outcome: outcomeOf(g?.outcome) }
      },
      async act(action) {
        if (!host.capabilities.send) throw new SdkError('NOT_SUPPORTED', 'send is not available here')
        const name = requireString(action, 'action')
        if (host.busy()) throw new SdkError('BUSY', 'a reply is still being generated')
        const outcome = outcomeOf(host.generation ? host.generation().outcome : null)
        if (!outcome || !outcome.actions.some((a) => a.action === name)) throw new SdkError('INVALID_ARGS', 'that action is not offered for the last turn')
        // 重試、繼續都會花點數：只有玩家真的按了才做，不另外問——作者沒有理由在玩家沒按的時候重試。
        if (!host.inGesture()) throw new SdkError('UNAUTHORIZED', 'act only inside a user gesture')
        takeSlot('generation.act')
        await host.request('generation.act', [name])
      },
    },
    on: (event, cb) => bus.on(event, cb),
    debug: { log: (...args) => host.debug(...args) },
    version: '1',
  }

  return {
    sdk,
    loadSaves(data) {
      saves.clear()
      if (data && typeof data === 'object') for (const [k, v] of Object.entries(data)) saves.set(k, v)
      savesLoaded = true
    },
    savesLoaded: () => savesLoaded,
  }
}
