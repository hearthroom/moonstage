/**
 * 內容限制卡上這一端接上的三顆鍵，在 canvas.vue 裡真的那幾支函式上量（canvas.vue 的 setup 無法直接 mount，
 * 照 canvas-sandbox-system-notice.spec 的做法把函式切出來、去掉型別，在給定的環境裡跑）。
 *
 *   - 關閉流式輸出並重試：存的是「玩家原本的偏好＋流式關」，其他偏好一個都不能掉；版本衝突重讀一次；
 *     存失敗不重試；按下時就做不了，連偏好都不改。
 *   - 修改訊息：打開被擋那一則的編輯（訊息選單既有的編輯並重送）。
 *   - 切換線路：打開模型選單，停在目前這顆模型的線路。
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { readResponseSettings, responseBase, responsePatch } from '../canvas-response-settings'
import { cardRetryTarget } from '../canvas-filter-card'

const CANVAS = fs.readFileSync(path.join(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')

function canvasFunctions(names: string[], env: Record<string, unknown>): Record<string, (...args: any[]) => any> {
  const code = names.map((name) => {
    const start = CANVAS.search(new RegExp(`\\n(async )?function ${name}\\(`))
    expect(start, `canvas.vue 裡找不到 function ${name}(`).toBeGreaterThan(-1)
    const end = CANVAS.slice(start + 1).search(/\n(async )?function |\n\/\/ |\nconst |\nwatch\(/)
    return CANVAS.slice(start, start + 1 + end)
  }).join('\n')
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  const keys = Object.keys(env)
  return new Function(...keys, `${js}\nreturn { ${names.join(', ')} };`)(...keys.map((k) => env[k]))
}

const settings = (revision: number, overrides: Record<string, string>) => ({
  conversationId: 'c1', scope: 'conversation', schemaVersion: 1, revision, overrides,
  effective: { agency: 'protect', style: 'custom', perspective: 'second_user', length: 'target', lengthTarget: 1500, pace: 'natural', streaming: 'on' },
})
const playerPrefs = { agency: 'protect', style: 'custom', customStyle: '短句、多對白', perspective: 'second_user', length: 'target', lengthTarget: '1500', paceNote: '慢慢來' }

function harness(over: { load?: any[]; save?: Array<'ok' | number | Record<string, number>>; blocked?: boolean; allowed?: boolean; afterSave?: () => void } = {}) {
  const loads = [...(over.load || [settings(4, playerPrefs)])]
  const saves: Array<'ok' | number | Record<string, number>> = [...(over.save || ['ok'])]
  const saved: Array<{ revision: number; patch: Record<string, string | null> }> = []
  const card = { id: 'card-1', allowedActions: ['retry_rewrite', 'switch_model'] }
  const env = {
    filterCardBusy: { value: '' },
    conversationId: { value: 'c1' },
    talkList: { value: [{ id: 'u1', type: 1 }, card] },
    unref: (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v),
    t: (k: string) => k,
    uni: { showToast: vi.fn() },
    console: { warn: vi.fn() },
    readResponseSettings, responseBase, responsePatch, cardRetryTarget,
    filterCardBase: () => [{ action: 'retry_rewrite', label: '直接重試' }, { action: 'switch_model', label: '切換模型' }],
    isTimelineMutationBlocked: () => over.blocked === true,
    isTerminalActionAllowed: vi.fn(() => over.allowed !== false),
    notifyTimelineMutationBlocked: vi.fn(),
    onSystemMsgCta: vi.fn(),
    loadResponseSettings: vi.fn(async () => loads.shift() ?? settings(9, playerPrefs)),
    saveResponseSettings: vi.fn(async (_id: string, revision: number, patch: Record<string, string | null>) => {
      saved.push({ revision, patch })
      const next = saves.shift() ?? 'ok'
      // 真的請求層把 4xx 原樣 reject（statusCode，沒有 status）；saveResponseSettings 自己丟的是 { status }。
      if (typeof next === 'object') throw next
      if (next !== 'ok') throw { status: next }
      over.afterSave?.()
      return settings(revision + 1, { ...playerPrefs, streaming: 'off' })
    }),
  }
  const fns = canvasFunctions(['saveStreamingOff', 'turnOffStreamingAndRetry'], env)
  return { env, fns, saved, card, run: () => fns.turnOffStreamingAndRetry(card, 1) }
}

describe('關閉流式輸出並重試', () => {
  it('存「原本的偏好＋流式關」，其他偏好一個都不掉；存成功才照卡上那顆重試走', async () => {
    const h = harness()
    await h.run()
    expect(h.saved).toHaveLength(1)
    expect(h.saved[0].revision).toBe(4)
    expect(h.saved[0].patch).toMatchObject({
      streaming: 'off', agency: 'protect', style: 'custom', customStyle: '短句、多對白', perspective: 'second_user',
      length: 'target', lengthTarget: '1500', paceNote: '慢慢來',
    })
    expect(h.env.uni.showToast).toHaveBeenCalledWith({ title: 'chat.streamingTurnedOff', icon: 'none', duration: 5000 })
    expect(h.env.onSystemMsgCta).toHaveBeenCalledWith('retry_rewrite', h.card, 1)
    expect(h.env.filterCardBusy.value).toBe('')
  })

  it('存檔期間整張卡是忙碌的，重複按不會存第二次', async () => {
    const h = harness()
    const first = h.run()
    expect(h.env.filterCardBusy.value).toBe('card-1')
    await h.run()
    await first
    expect(h.saved).toHaveLength(1)
    expect(h.env.onSystemMsgCta).toHaveBeenCalledOnce()
  })

  it('版本衝突：重讀最新的再存一次，用的是新的版本與新的偏好', async () => {
    const h = harness({ load: [settings(4, playerPrefs), settings(5, { ...playerPrefs, pace: 'linger' })], save: [409, 'ok'] })
    await h.run()
    expect(h.saved.map((s) => s.revision)).toEqual([4, 5])
    expect(h.saved[1].patch).toMatchObject({ streaming: 'off', pace: 'linger', customStyle: '短句、多對白' })
    expect(h.env.onSystemMsgCta).toHaveBeenCalledOnce()
  })

  it('請求層原樣回的 409（statusCode）一樣算版本衝突，重讀再存', async () => {
    const h = harness({ load: [settings(4, playerPrefs), settings(5, playerPrefs)], save: [{ statusCode: 409 }, 'ok'] })
    await h.run()
    expect(h.saved.map((s) => s.revision)).toEqual([4, 5])
    expect(h.env.onSystemMsgCta).toHaveBeenCalledOnce()
  })

  it('存失敗（衝突兩次、或被拒）：不重試，提示沒關成功，卡恢復可按', async () => {
    for (const save of [[409, 409], [500]] as Array<Array<'ok' | number>>) {
      const h = harness({ load: [settings(4, playerPrefs), settings(5, playerPrefs)], save })
      await h.run()
      expect(h.env.onSystemMsgCta).not.toHaveBeenCalled()
      expect(h.env.uni.showToast).toHaveBeenCalledWith({ title: 'chat.streamingTurnOffFailed', icon: 'none', duration: 3000 })
      expect(h.env.filterCardBusy.value).toBe('')
    }
  })

  it('按下時就做不了（時間軸忙、卡已不是最新）：什麼都不改，顯示被擋的提示', async () => {
    for (const over of [{ blocked: true }, { allowed: false }]) {
      const h = harness(over)
      await h.run()
      expect(h.env.loadResponseSettings).not.toHaveBeenCalled()
      expect(h.saved).toHaveLength(0)
      expect(h.env.notifyTimelineMutationBlocked).toHaveBeenCalledOnce()
    }
  })

  it('存完之後時間軸變了：偏好已改、提示已出，不重試也不再跳被擋的提示蓋掉它', async () => {
    let blocked = false
    const h = harness({ afterSave: () => { blocked = true } })
    h.env.isTimelineMutationBlocked = () => blocked
    const fns = canvasFunctions(['saveStreamingOff', 'turnOffStreamingAndRetry'], h.env)
    await fns.turnOffStreamingAndRetry(h.card, 1)
    expect(h.env.uni.showToast).toHaveBeenCalledWith({ title: 'chat.streamingTurnedOff', icon: 'none', duration: 5000 })
    expect(h.env.onSystemMsgCta).not.toHaveBeenCalled()
    expect(h.env.notifyTimelineMutationBlocked).not.toHaveBeenCalled()
  })
})

describe('修改訊息、切換線路', () => {
  function cta(over: { canEdit?: boolean; retryAllowed?: boolean } = {}) {
    const env = {
      talkList: { value: [{ id: 'u1', type: 1, content: '原本那句' }, { id: 'card-1', type: 0 }] },
      menuDraft: { value: '' },
      menuEditing: { value: false },
      openMessageMenu: vi.fn(),
      openModelSelect: vi.fn(),
      notifyTimelineMutationBlocked: vi.fn(),
      filterCardPlayerIndex: () => 0,
      canEditFilteredMessage: () => over.canEdit !== false,
      turnOffStreamingAndRetry: vi.fn(),
      isTerminalActionAllowed: vi.fn(() => over.retryAllowed === true),
      rememberFilterCardSwitch: vi.fn(),
      cardRetryTarget,
      filterCardBase: () => [{ action: 'retry_rewrite', label: '重試' }, { action: 'switch_model', label: '切換模型' }],
      filterCardSwitch: { value: { itemId: 'card-1', from: 'm-a' } as any },
    }
    // onSystemMsgCta 會遞迴呼叫自己走那顆重試：外面包一層記下來，不真的往下走。
    const calls: any[] = []
    const fns = canvasFunctions(['onSystemMsgCta'], env)
    const onSystemMsgCta = (action: string, item: any, index: number) => { calls.push(action); return fns.onSystemMsgCta(action, item, index) }
    return { env, onSystemMsgCta, calls }
  }

  it('修改訊息：打開那一則的編輯，草稿是原本的字', () => {
    const { env, onSystemMsgCta } = cta()
    onSystemMsgCta('edit_message', env.talkList.value[1], 1)
    expect(env.openMessageMenu).toHaveBeenCalledWith(0)
    expect(env.menuDraft.value).toBe('原本那句')
    expect(env.menuEditing.value).toBe(true)
    expect(env.isTerminalActionAllowed).not.toHaveBeenCalled()
  })

  it('修改訊息：卡已經不能改（時間軸鎖住、不是最新）就不開，說被擋', () => {
    const { env, onSystemMsgCta } = cta({ canEdit: false })
    onSystemMsgCta('edit_message', env.talkList.value[1], 1)
    expect(env.openMessageMenu).not.toHaveBeenCalled()
    expect(env.notifyTimelineMutationBlocked).toHaveBeenCalledOnce()
  })

  it('從卡上按切換線路／切換模型：先記住是哪張卡、當時哪條線路', () => {
    const { env, onSystemMsgCta } = cta({ retryAllowed: true })
    onSystemMsgCta('switch_lane', env.talkList.value[1], 1)
    onSystemMsgCta('switch_model', env.talkList.value[1], 1)
    expect(env.rememberFilterCardSwitch).toHaveBeenCalledTimes(2)
    expect(env.openModelSelect).toHaveBeenNthCalledWith(1, 'lanes')
    expect(env.openModelSelect).toHaveBeenNthCalledWith(2)
  })

  it('用新線路／模型重送：走卡上原本那顆重試，清掉記住的切換', () => {
    const { env, onSystemMsgCta, calls } = cta({ retryAllowed: true })
    try { onSystemMsgCta('resend_filtered', env.talkList.value[1], 1) } catch { /* 重試的路徑在這個環境裡沒有接上 */ }
    expect(env.isTerminalActionAllowed).toHaveBeenCalledWith(env.talkList.value, 1, 'retry_rewrite')
    expect(env.filterCardSwitch.value).toBeNull()
    expect(calls).toEqual(['resend_filtered'])
  })

  it('重送時卡已經不能重試：不送，說被擋', () => {
    const { env, onSystemMsgCta } = cta({ retryAllowed: false })
    onSystemMsgCta('resend_filtered', env.talkList.value[1], 1)
    expect(env.notifyTimelineMutationBlocked).toHaveBeenCalledOnce()
    expect(env.filterCardSwitch.value).not.toBeNull()
  })

  it('記住切換只對前置被擋卡：其他卡按切換模型不記', () => {
    const env = { filterCardSwitch: { value: null as any }, selectedVariantValue: { value: 'm-a' }, isInputPolicyFilter: (i: any) => i.filterReason === 'input_policy',
      unref: (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v) }
    const { rememberFilterCardSwitch } = canvasFunctions(['rememberFilterCardSwitch'], env)
    rememberFilterCardSwitch({ id: 'c', filterReason: 'input_policy' })
    expect(env.filterCardSwitch.value).toEqual({ itemId: 'c', from: 'm-a' })
    rememberFilterCardSwitch({ id: 'd', finishReason: 'server_error' })
    expect(env.filterCardSwitch.value).toBeNull()
  })

  it('切換線路：打開模型選單並停在線路；關閉流式輸出並重試交給它自己的流程', () => {
    const { env, onSystemMsgCta } = cta()
    onSystemMsgCta('switch_lane', env.talkList.value[1], 1)
    expect(env.openModelSelect).toHaveBeenCalledWith('lanes')
    onSystemMsgCta('retry_stream_off', env.talkList.value[1], 1)
    expect(env.turnOffStreamingAndRetry).toHaveBeenCalledWith(env.talkList.value[1], 1)
  })
})

describe('流式值的快取跟著對話與模型', () => {
  it('進對話時的背景讀取不跳網路錯誤提示（玩家沒做任何事）', async () => {
    const loadResponseSettings = vi.fn(async () => settings(1, {}))
    const env = { readResponseSettings, cardStreaming: { value: null as any }, conversationId: { value: 'c1' },
      cardStreamingKey: { value: 'c1|m' }, responseSettingsSupported: { value: true }, loadResponseSettings,
      unref: (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v) }
    const { refreshCardStreaming } = canvasFunctions(['rememberCardStreaming', 'refreshCardStreaming'], env)
    await refreshCardStreaming()
    expect(loadResponseSettings).toHaveBeenCalledWith('c1', true)
    expect(env.cardStreaming.value).toEqual({ key: 'c1|m', value: 'on' })
  })

  it('回覆偏好存檔後用回傳的值更新；讀不到合法的值就不動', () => {
    const env = { readResponseSettings, cardStreaming: { value: null as any } }
    const { rememberCardStreaming } = canvasFunctions(['rememberCardStreaming'], env)
    rememberCardStreaming(settings(2, {}), 'c1', 'c1|m')
    expect(env.cardStreaming.value).toEqual({ key: 'c1|m', value: 'on' })
    rememberCardStreaming({ ...settings(3, { streaming: 'off' }), effective: { ...settings(3, {}).effective, streaming: 'off' } }, 'c1', 'c1|m')
    expect(env.cardStreaming.value).toEqual({ key: 'c1|m', value: 'off' })
    rememberCardStreaming({ broken: true }, 'c1', 'c1|m')
    rememberCardStreaming(settings(4, {}), 'other-conversation', 'c1|m')
    expect(env.cardStreaming.value).toEqual({ key: 'c1|m', value: 'off' })
  })
})
