// @vitest-environment jsdom
/**
 * 卡片數值在兩種頁面的一致性：同一份歷史，一般頁（canvas.vue 的時間線＋作者執行期）與沙箱卡
 * （宿主橋 → 殼）發出逐字相同的 state:change 序列、相同的現值，面板畫出相同的 HTML。
 *
 * 一般頁這一側用 canvas.vue 實際呼叫的同一組函式（canvas-card-state、common/card-state、author-asset-mount），
 * 沙箱這一側是真的宿主橋接真的殼（postMessage 換成直接呼叫 shell.handle）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createSandboxHost } from '../canvas-sandbox-host'
import type { HudHost, HudHostMessage, HudHostState } from '../canvas-hud-bridge'
import { cardStateRowsOf, cardStateFromServer, sandboxCardStateOf } from '../canvas-card-state'
import { cardStateAt, cardStateMessageId, cardStateUpdate, createCardStateFeed, currentCardState, currentCardStatePayload, initialCardState, type CardStatePayload } from '@/common/card-state'
import { createAuthorAssetRuntime } from '@/utils/author-asset-mount.js'
import { createShell, type Shell } from '@/sandbox/shell'
import type { HostToShell, SandboxHelloConfig } from '@/sandbox/protocol'
import type { StatePanelLabels } from '@/common/panel/state-panel'
import CanvasStatePanel from '../components/canvas-state-panel.vue'

const ORIGIN = 'https://c1.example.test'
const SKIN = '<div class="panel">{{#each 角色}}<div class="row">{{@key}}：{{this.好感度}}{{#if (gt this.好感度 50)}}<b>親密</b>{{else}}<i>普通</i>{{/if}}</div>{{/each}}'
  + '<span data-panel-copy>{{金錢}}</span>{{#each @changes}}<em>{{path}}:{{old}}→{{new}}</em>{{/each}}</div><style>.panel{color:red} b{font-weight:700}</style>'
const LABELS: StatePanelLabels = {
  open: '數值面板', title: '數值面板', close: '關閉', updatedLatest: '最新一輪更新', updatedOneAgo: '上一輪更新', updatedAgo: '{n} 輪前更新',
  updatedOpening: '開場時的數值', showRaw: '查看原始數值', showPanel: '返回面板', rejected: '未採用的變更', unavailable: '面板暫時無法顯示',
  unavailableSub: '數值照常記錄，可以先查看原始數值。', errorAt: '面板皮膚第 {line} 行有錯誤：{message}', errorHelper: '面板皮膚第 {line} 行用了不支援的 helper「{helper}」', copied: '已複製',
}
const INITIAL = { 角色: { 小雪: { 好感度: 40 } }, 金錢: 0 }

// 伺服器的 cardState（歷史列與 operationStatus 帶的形狀）
const server = (seq: number, data: unknown, changes: unknown[] = [], source = 'inline') => ({ data, changes, seq, source })

interface Item { id: number | string; type: 0 | 1; content: string; cardState?: ReturnType<typeof cardStateFromServer>; chatId?: string; finished?: boolean }
const row = (id: number, type: 0 | 1, content: string, cs?: unknown): Item => {
  const item: Item = { id, type, content }
  const parsed = cs === undefined ? undefined : cardStateFromServer(cs)
  if (parsed) item.cardState = parsed
  return item
}

function history(): Item[] {
  return [
    row(10, 0, '開場', server(0, { 角色: { 小雪: { 好感度: 50 } }, 金錢: 100 }, [], 'seed')),
    row(11, 1, '你好'),
    row(12, 0, '回覆一', server(1, { 角色: { 小雪: { 好感度: 55 } }, 金錢: 100 }, [{ op: 'set', path: '角色.小雪.好感度', old: 50, new: 55, reason: '打招呼' }])),
    row(13, 1, '送花'),
    row(14, 0, '回覆二'),
  ]
}

/** canvas.vue 的 buildHudHost().read().messages 對這幾列會給的東西（沙箱卡）。 */
function hudMessages(items: Item[], withView: boolean, cardStateOn = true): HudHostMessage[] {
  return items.map((item, index) => {
    const m: HudHostMessage = {
      id: String(item.id), serverId: cardStateMessageId(item), role: item.type === 1 ? 'user' : 'assistant', text: item.content, html: `<p>${item.content}</p>`,
      opening: index === 0 && item.type === 0, finished: item.finished !== false, canonicalLatestAI: false,
    }
    if (withView) m.view = { role: item.type === 1 ? 'user' : 'ai', html: `<p>${item.content}</p>`, finished: true }
    if (cardStateOn) m.cardState = sandboxCardStateOf(item)
    return m
  })
}

function hudState(messages: HudHostMessage[]): HudHostState {
  return {
    character: { id: '1', name: '露娜', avatar: null }, messages, generation: 'idle', streamingMessageId: null, inputText: '', previewOnly: false,
    editing: { open: false, messageId: null, text: '' }, model: { selectedId: '', groups: [] }, conversations: { currentId: 'c1', rows: [], full: false },
    persona: { mode: 'name_only', modes: [], name: '', genders: [], gender: '', identity: '' }, moreItems: [],
  } as HudHostState
}

const flush = () => new Promise((r) => setTimeout(r, 0))

/** 一般頁：canvas.vue 的 syncCardStateEvents 同一條路。 */
function classicPage(initialData: unknown) {
  const runtime = createAuthorAssetRuntime({ doc: document })
  const feed = createCardStateFeed()
  const events: CardStatePayload[] = []
  runtime.subscribe('state:change', (p: CardStatePayload) => events.push(p))
  let items: Item[] = []
  const initial = initialCardState(initialData)
  return {
    events,
    runtime,
    set(next: Item[]) {
      items = next
      for (const payload of feed.update(cardStateRowsOf(items))) runtime.emit('state:change', payload)
    },
    get: () => currentCardStatePayload(cardStateRowsOf(items), initial),
    of: (id: string) => cardStateAt(cardStateRowsOf(items), id, initial),
    panelProps: () => {
      const rows = cardStateRowsOf(items)
      const cur = currentCardState(rows, initial)
      return { template: SKIN, state: cur ? cur.state : null, update: cardStateUpdate(rows), audience: 'player' as const, labels: LABELS }
    },
  }
}

/** 沙箱卡：真的宿主橋 → 真的殼。 */
function sandboxPage(cardState: SandboxHelloConfig['cardState'] | undefined, withView: boolean, cardStateOn = true) {
  const events: CardStatePayload[] = []
  const posted: Array<Record<string, unknown>> = []
  let shell: Shell | null = null
  document.body.insertAdjacentHTML('beforeend', '<div id="shell-app"></div>')
  const iframe = document.createElement('iframe')
  document.body.appendChild(iframe)
  const target = {
    postMessage: (data: unknown) => {
      const m = structuredClone(data) as Record<string, unknown>
      posted.push(m)
      if (m.type === 'hello') {
        shell = createShell({ doc: document, win: window as Window & typeof globalThis, mount: document.getElementById('shell-app')!, config: (m as { config: SandboxHelloConfig }).config, transport: { send: () => {} } })
        // 作者腳本在 hello 時訂閱（早於歷史）
        shell.sdk.on('state:change', (p) => events.push(p as CardStatePayload))
        return
      }
      shell?.handle(m as unknown as HostToShell)
    },
  }
  Object.defineProperty(iframe, 'contentWindow', { value: target, configurable: true })
  const state = { current: hudState([]) }
  const hud = { labels: {}, read: () => state.current } as unknown as HudHost
  const host = createSandboxHost({
    hud, iframe, win: window, origin: ORIGIN, roleId: '1',
    hello: () => ({
      theme: 'dark', locale: 'zh-Hant', role: { name: '露娜', avatarUrl: '' }, user: { nickname: '小明', avatarUrl: '' },
      card: { rules: [], statusbar: '' }, composer: true, ...(cardState ? { cardState } : {}),
    }),
  })
  host.start()
  return {
    events,
    posted,
    shell: () => shell as Shell | null,
    async boot(items: Item[]) {
      state.current = hudState(hudMessages(items, withView, cardStateOn))
      window.dispatchEvent(new MessageEvent('message', { data: { ms: 1, type: 'ready-shell' }, origin: ORIGIN, source: target as unknown as Window }))
      await flush()
    },
    set(items: Item[]) {
      state.current = hudState(hudMessages(items, withView, cardStateOn))
      host.sync()
    },
    dispose() { host.destroy(); (shell as Shell | null)?.dispose(); iframe.remove(); document.getElementById('shell-app')?.remove() },
  }
}

let cleanup: Array<() => void> = []
afterEach(() => { for (const c of cleanup) c(); cleanup = []; delete (window as unknown as Record<string, unknown>).sdk })

describe.each([true, false])('state:change 兩種頁面同一串（宿主送呈現資料=%s）', (withView) => {
  it('冷啟動、新的一輪、一輪跑完才記下的數值、重新生成、載入更早的歷史、晚訂閱', async () => {
    const classic = classicPage(INITIAL)
    const sandbox = sandboxPage({ initial: INITIAL }, withView)
    cleanup.push(() => sandbox.dispose())

    // 冷啟動：每一份由舊到新
    let items = history()
    classic.set(items)
    await sandbox.boot(items)
    expect(classic.events.map((p) => p.messageId)).toEqual(['10', '12'])
    expect(sandbox.events).toEqual(classic.events)

    // 新的一輪：氣泡先定稿、沒有數值；operationStatus 晚到才掛上
    items = [...items, row(15, 1, '請吃飯'), row(16, 0, '回覆三')]
    classic.set(items); sandbox.set(items)
    expect(sandbox.events).toEqual(classic.events)
    items = items.map((it) => (it.id === 16 ? { ...it, cardState: cardStateFromServer(server(2, { 角色: { 小雪: { 好感度: 70 } }, 金錢: 80 }, [{ op: 'set', path: '金錢', old: 100, new: 80 }])) } : it))
    classic.set(items); sandbox.set(items)
    expect(classic.events.map((p) => p.messageId)).toEqual(['10', '12', '16'])
    expect(sandbox.events).toEqual(classic.events)

    // 重新生成最新一則：那一份不在了，整條重發，最新的在最後
    items = [...items.slice(0, -1), row(17, 0, '回覆三（重寫）', server(2, { 角色: { 小雪: { 好感度: 65 } }, 金錢: 90 }, [{ op: 'set', path: '金錢', old: 100, new: 90 }]))]
    classic.set(items); sandbox.set(items)
    expect(classic.events.map((p) => p.messageId)).toEqual(['10', '12', '16', '10', '12', '17'])
    expect(sandbox.events).toEqual(classic.events)

    // 載入更早的一頁（插在最前面）：現值沒變，不發
    items = [row(8, 0, '更早', server(0, { 金錢: 1 }, [], 'seed')), row(9, 1, '更早的玩家'), ...items]
    classic.set(items); sandbox.set(items)
    expect(classic.events).toHaveLength(6)
    expect(sandbox.events).toEqual(classic.events)

    // 晚訂閱：兩邊都只補現值
    const lateClassic: unknown[] = []
    const lateSandbox: unknown[] = []
    classic.runtime.subscribe('state:change', (p: unknown) => lateClassic.push(p))
    sandbox.shell()!.sdk.on('state:change', (p) => lateSandbox.push(p))
    expect(lateClassic).toEqual([classic.events.at(-1)])
    expect(lateSandbox).toEqual(lateClassic)

    // 現值與 of()：stage.state 與 sdk.state 一樣。殼的 of() 收作者在殼裡拿得到的 id：
    // 宿主 id（數值載荷的 messageId、AI 訊息的 serverId）與殼自己的訊息 id（玩家訊息只有這個）。
    const sdk = sandbox.shell()!.sdk
    expect(sdk.state.get()).toEqual(classic.get())
    for (const id of ['10', '12', '14', '17', 'missing']) expect(sdk.state.of(id)).toEqual(classic.of(id))
    const shellIds = (sandbox.posted.find((p) => p.type === 'messages') as { messages: Array<{ id: string }> }).messages.map((m) => m.id)
    expect(shellIds.slice(0, 5)).toEqual(['greeting', 'h11', 'h12', 'h13', 'h14'])
    expect(sdk.state.of('h11')).toEqual(classic.of('11'))
    expect(sdk.state.of('h13')).toEqual(classic.of('13'))
    expect(sdk.state.of('greeting')).toEqual(classic.of('10'))
  })
})

describe('即時訊息的正式 ID', () => {
  it('串流完成當下的 done 與 mount 可用 serverId 讀數值，重載後相同', async () => {
    const sandbox = sandboxPage({ initial: INITIAL }, true)
    cleanup.push(() => sandbox.dispose())
    await sandbox.boot(history())
    const sdk = sandbox.shell()!.sdk
    const seen: Array<{ event: string; serverId: string | null; state: unknown }> = []
    for (const event of ['message:done', 'message:mount'] as const) {
      sdk.on(event, (p: any) => {
        if (p.id.startsWith('l')) seen.push({ event, serverId: p.serverId, state: sdk.state.of(p.serverId) })
      })
    }
    const live = { ...row(1700000000000, 0, '回覆中'), finished: false }
    sandbox.set([...history(), live])
    seen.length = 0
    const savedId = '00000000-0000-4000-8000-000000000016'
    const saved = { ...live, content: '回覆完成', finished: true, chatId: savedId, cardState: cardStateFromServer(server(2, { 金錢: 80 }, [{ op: 'set', path: '金錢', old: 100, new: 80 }])) }
    sandbox.set([...history(), saved])
    const expected = { messageId: savedId, data: { 金錢: 80 }, changes: [{ op: 'set', path: '金錢', old: 100, new: 80 }] }
    expect(seen).toEqual(['message:done', 'message:mount'].map(event => ({ event, serverId: savedId, state: expected })))
    const reloaded = sandboxPage({ initial: INITIAL }, true)
    sandbox.dispose()
    cleanup.push(() => reloaded.dispose())
    await reloaded.boot([...history(), { ...saved, id: savedId }])
    const late: any[] = []
    reloaded.shell()!.sdk.on('message:done', p => late.push(p))
    expect(late.at(-1).serverId).toBe(savedId)
    expect(reloaded.shell()!.sdk.state.of(savedId)).toEqual(expected)
  })
})

describe('面板 HTML 兩種頁面一樣', () => {
  it('同一份模板＋數值：皮膚 HTML 逐字相同、CSS 收在面板裡、「更新於」一樣', async () => {
    const items = [...history(), row(15, 1, '請吃飯'), row(16, 0, '回覆三', server(2, { 角色: { 小雪: { 好感度: 70 }, 阿光: { 好感度: 30 } }, 金錢: 80 }, [{ op: 'set', path: '金錢', old: 100, new: 80 }]))]
    const classic = classicPage(INITIAL)
    classic.set(items)
    const wrapper = mount(CanvasStatePanel, { props: classic.panelProps(), attachTo: document.body })
    cleanup.push(() => wrapper.unmount())
    await nextTick()
    const classicSkin = wrapper.find('[data-lt="state-panel-skin"]').element.innerHTML

    const sandbox = sandboxPage({ initial: INITIAL, panel: { template: SKIN, audience: 'player', labels: LABELS } }, true)
    cleanup.push(() => sandbox.dispose())
    await sandbox.boot(items)
    await nextTick()
    const shellRoot = document.getElementById('shell-app')!
    const shellSkin = shellRoot.querySelector('[data-lt="state-panel-skin"]')!.innerHTML

    expect(shellSkin).toBe(classicSkin)
    expect(classicSkin).toContain('<div class="row">小雪：70<b>親密</b></div><div class="row">阿光：30<i>普通</i></div>')
    expect(classicSkin).toContain('<span data-panel-copy="">80</span><em>金錢:100→80</em>')
    expect(classicSkin).toContain('<style>.lt-state-skin .panel{color:red} .lt-state-skin b{font-weight:700}</style>')
    expect(shellRoot.querySelector('.lt-state-updated')!.textContent).toBe(wrapper.find('.lt-state-updated').text())
    expect(wrapper.find('.lt-state-updated').text()).toBe('最新一輪更新')
    // 鍵在殼裡插在輸入區前面
    const anchor = shellRoot.querySelector('[data-chat="state-panel"]')!
    expect(anchor.nextElementSibling?.getAttribute('data-chat')).toBe('composer')
    expect(anchor.querySelector('button[data-lt="state-panel-toggle"]')?.getAttribute('aria-label')).toBe('數值面板')
  })
})

describe('沒有數值的卡跟今天一樣', () => {
  it('宿主不送 state、殼不畫鍵、不發事件', async () => {
    const plain = history().map(({ cardState: _drop, ...rest }) => rest as Item)
    const sandbox = sandboxPage(undefined, true, false)
    cleanup.push(() => sandbox.dispose())
    await sandbox.boot(plain)
    sandbox.set([...plain, row(15, 1, '再見')])
    expect(sandbox.posted.some((p) => p.type === 'state')).toBe(false)
    const messages = (sandbox.posted.find((p) => p.type === 'messages') as { messages: Array<{ view?: Record<string, unknown> }> }).messages
    expect(messages.every((m) => !m.view || !('state' in m.view))).toBe(true)
    expect(document.querySelector('[data-lt="state-panel"]')).toBeNull()
    expect(sandbox.events).toEqual([])
    expect(sandbox.shell()!.sdk.state.get()).toBeNull()
    const classic = classicPage(undefined)
    classic.set(plain)
    expect(classic.events).toEqual([])
    expect(classic.get()).toBeNull()
  })
})
