// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { createShell, type Shell } from '../shell'
import type { SandboxHelloConfig, ShellToHost } from '../protocol'

function config(over: Partial<SandboxHelloConfig> = {}): SandboxHelloConfig {
  return {
    theme: 'dark',
    locale: 'zh-Hant',
    role: { name: '露娜', avatarUrl: '' },
    user: { nickname: '小明', avatarUrl: '' },
    card: { rules: [], statusbar: '' },
    capabilities: { saves: false, edit: false, send: true },
    composer: true,
    ...over,
  }
}

let shell: Shell | null = null
let sent: ShellToHost[] = []
const boot = (cfg: SandboxHelloConfig) => {
  shell?.dispose()
  sent = []
  document.body.innerHTML = '<div id="app"></div>'
  shell = createShell({ doc: document, win: window as Window & typeof globalThis, mount: document.getElementById('app')!, config: cfg, transport: { send: (m) => sent.push(m) } })
  return shell
}
afterEach(() => { shell?.dispose(); shell = null; delete (window as unknown as Record<string, unknown>).sdk })

const SCRIPT_RULE = (code: string) => ({ id: 1, name: 'kit', find: '{{eg-kit}}', replace: `<script>${code}</script>` })

describe('殼：冷啟動與事件順序', () => {
  it.each([true, false])('功能欄掛載與更新清除最外層殘字、保留作者元素（宿主 HTML=%s）', (hostHtml) => {
    const html = '<div><button>BGM</button><span>{{user}}《控2》</span></div>《播2》《播3》《控2》'
    const s = boot(config({ card: { rules: [], statusbar: html, ...(hostHtml ? { statusbarHtml: html.replace('{{user}}', '小明') } : {}) } }))
    expect(s.refs.statusbar!.textContent).toBe('BGM小明《控2》')
    const button = s.refs.statusbar!.querySelector('button')
    s.handle({ type: 'user', nickname: '新稱呼', ...(hostHtml ? { statusbarHtml: html.replace('{{user}}', '新稱呼') } : {}) })
    expect(s.refs.statusbar!.textContent).toBe('BGM新稱呼《控2》')
    expect(s.refs.statusbar!.querySelector('button')).toBe(button)
  })

  it('玩家名更新 SDK、狀態欄與既有／後續訊息巨集；重複訊息不重掛狀態欄', async () => {
    const s = boot(config({ card: { rules: [], statusbar: '<b>{{user}}</b>', statusbarHtml: '<b>小明</b>' } }))
    s.handle({ type: 'messages', messages: [{ id: 'g', role: 'ai', content: '你好，{{user}}', serverId: null }] })
    s.handle({ type: 'user', nickname: '全局稱呼', statusbarHtml: '<b>全局稱呼</b>' })
    await nextTick()
    expect(s.sdk.user.get()).toEqual({ nickname: '全局稱呼', avatarUrl: '', locale: 'zh-Hant' })
    expect(s.refs.statusbar!.textContent).toBe('全局稱呼')
    expect(s.refs.list.textContent).toContain('你好，全局稱呼')
    const status = s.refs.statusbar!.firstChild
    s.handle({ type: 'user', nickname: '全局稱呼', statusbarHtml: '<b>全局稱呼</b>' })
    expect(s.refs.statusbar!.firstChild).toBe(status)
    s.handle({ type: 'user', nickname: '新稱呼', statusbarHtml: '<b>新稱呼</b>' })
    s.handle({ type: 'message.new', message: { id: 'next', role: 'user', content: '我是{{user}}', serverId: null, state: 'done' } })
    await nextTick()
    expect(s.sdk.user.get().nickname).toBe('新稱呼')
    expect(s.refs.statusbar!.textContent!.trim()).toBe('新稱呼')
    expect(s.refs.list.textContent).toContain('你好，新稱呼')
    expect(s.refs.list.textContent).toContain('我是新稱呼')
  })

  it('改名保留作者直接綁定的狀態欄節點、輸入與腳本建立的狀態', () => {
    const html = '<button id="author-action">小明</button><input id="author-input" value="initial"><span id="counter">0</span>'
    const s = boot(config({ card: { rules: [SCRIPT_RULE(`
      window.__nameClicks = 0;
      document.getElementById('author-action').addEventListener('click', function () { window.__nameClicks++; });
      document.getElementById('counter').textContent = '7';
      var extra = document.createElement('em'); extra.textContent = 'script state'; document.querySelector('[data-slot="statusbar"]').prepend(extra);
    `)], statusbar: 'mount', statusbarHtml: html } }))
    const button = document.getElementById('author-action')!
    const input = document.getElementById('author-input') as HTMLInputElement
    input.value = 'player draft'
    button.click()
    s.handle({ type: 'user', nickname: '新稱呼', statusbarHtml: html.replace('小明', '新稱呼') })
    expect(document.getElementById('author-action')).toBe(button)
    expect(button.textContent).toBe('新稱呼')
    button.click()
    expect((window as any).__nameClicks).toBe(2)
    expect(document.getElementById('author-input')).toBe(input)
    expect(input.value).toBe('player draft')
    expect(document.getElementById('counter')!.textContent).toBe('7')
    expect(s.refs.statusbar!.textContent).toContain('script state')
  })

  it('全局改名更新作者以同值 textContent 重建的可見巨集，不丟直接 handler', () => {
    const html = '<button id="name-action">GlobalOld</button><input id="name-draft" value="initial"><span id="name-count">0</span>'
    const s = boot(config({ user: { nickname: 'GlobalOld', avatarUrl: '' }, card: { rules: [SCRIPT_RULE(`
      var name = document.getElementById('name-action');
      name.textContent = name.textContent;
      window.__globalNameClicks = 0;
      name.addEventListener('click', function () { window.__globalNameClicks++; });
      document.getElementById('name-count').textContent = '7';
    `)], statusbar: 'mount', statusbarHtml: html } }))
    const button = document.getElementById('name-action')!
    const input = document.getElementById('name-draft') as HTMLInputElement
    input.value = 'draft'
    for (const nickname of ['GlobalNew', 'GlobalThird', 'GlobalFourth']) {
      s.handle({ type: 'user', nickname, statusbarHtml: html.replace('GlobalOld', nickname) })
      expect(s.sdk.user.get().nickname).toBe(nickname)
      expect(button.textContent).toBe(nickname)
      // 作者再次刷新同值，不應使下一次改名失去文字 reference。
      button.textContent = button.textContent
    }
    expect(document.getElementById('name-action')).toBe(button)
    button.click()
    expect((window as any).__globalNameClicks).toBe(1)
    expect(document.getElementById('name-draft')).toBe(input)
    expect(input.value).toBe('draft')
    expect(document.getElementById('name-count')!.textContent).toBe('7')
  })

  it('宿主有提供 view 時，改名不重掛舊 view；由新的 message.view 更新正文', async () => {
    const s = boot(config())
    s.handle({ type: 'messages', messages: [{ id: 'g', role: 'ai', content: '你好，{{user}}', serverId: null, state: 'done', view: { name: '露娜', html: '<p>你好，小明</p>', finished: true } }] })
    const body = s.refs.list.querySelector('[data-chat="message-body"]')
    s.handle({ type: 'user', nickname: '新稱呼' })
    expect(s.refs.list.querySelector('[data-chat="message-body"]')).toBe(body)
    s.handle({ type: 'message.view', id: 'g', view: { name: '露娜', html: '<p>你好，新稱呼</p>', finished: true } })
    await nextTick()
    expect(s.refs.list.textContent).toContain('你好，新稱呼')
  })

  it('改名同步狀態欄 frontend 文件，只重新載入來源真的變更的 frame', () => {
    const html = '<pre class="lt-frontend"><code>&lt;html&gt;&lt;body&gt;你好，小明&lt;/body&gt;&lt;/html&gt;</code></pre><pre class="lt-frontend"><code>&lt;html&gt;&lt;body&gt;static&lt;/body&gt;&lt;/html&gt;</code></pre>'
    const s = boot(config({ card: { rules: [], statusbar: 'mount', statusbarHtml: html } }))
    const [frame, stable] = Array.from(s.refs.statusbar!.querySelectorAll('iframe'))
    expect(frame.srcdoc).toContain('你好，小明')
    const stableDocument = stable.srcdoc
    // 作者能搬動 frame，來源→frame 對應不能依賴更新時的鄰居位置。
    s.refs.root.append(frame)
    s.handle({ type: 'user', nickname: '新稱呼', statusbarHtml: html.replace('小明', '新稱呼') })
    expect(frame.srcdoc).toContain('你好，新稱呼')
    expect(frame.parentNode).toBe(s.refs.root)
    expect(s.refs.statusbar!.querySelector('iframe')).toBe(stable)
    expect(stable.srcdoc).toBe(stableDocument)
  })

  it('未提供宿主狀態欄 HTML 時，用新玩家名重算殼的狀態欄巨集', () => {
    const s = boot(config({ card: { rules: [], statusbar: '<b>{{user}}</b>' } }))
    s.handle({ type: 'user', nickname: '新稱呼' })
    expect(s.refs.statusbar!.textContent!.trim()).toBe('新稱呼')
  })

  it('腳本在 DOM 之前跑、sdk 掛在 window；冷啟動 new→mount→done，ready 最後；載荷恰好四鍵', () => {
    const s = boot(config({
      card: { rules: [SCRIPT_RULE(`
        window.__log = [];
        window.__top = { sdk: typeof sdk, bubbles: document.querySelectorAll('[data-chat="message"]').length, cs: document.currentScript, self: this === window };
        ['message:new','message:mount','message:done','ready'].forEach(function (ev) {
          sdk.on(ev, function (p) { window.__log.push(ev + ':' + (p ? p.id : 'undefined') + ':' + (p ? Object.keys(p).sort().join(',') : '')); });
        });
      `)], statusbar: '' },
    }))
    const w = window as unknown as { __log: string[]; __top: { sdk: string; bubbles: number; cs: unknown; self: boolean } }
    expect(w.__top).toEqual({ sdk: 'object', bubbles: 0, cs: null, self: true })
    s.handle({ type: 'messages', messages: [{ id: 'greeting', role: 'ai', content: '你好，{{user}}', serverId: null }] })
    expect(w.__log).toEqual([
      'message:new:greeting:content,id,role,serverId',
      'message:mount:greeting:content,id,role,serverId',
      'message:done:greeting:content,id,role,serverId',
      'ready:undefined:',
    ])
    expect(sent.some((m) => m.type === 'ready')).toBe(true)
    expect(s.refs.list.querySelector('[data-chat="message-body"]')!.innerHTML).toContain('你好，小明')
    expect(s.refs.list.querySelector('[data-chat="message"]')!.getAttribute('data-state')).toBe('done')
    expect(s.refs.list.querySelector('[data-chat="message"]')!.hasAttribute('data-msg-id')).toBe(false)
  })

  it('送出後：user new/mount、ai new/mount(pending 占位)、stream、done 一次且帶 serverId，再 mount', async () => {
    const s = boot(config({ card: { rules: [SCRIPT_RULE(`window.__ev = []; ['message:new','message:mount','message:stream','message:done'].forEach(function (ev) { sdk.on(ev, function (p) { window.__ev.push([ev, p.id, p.content, 'serverId' in p ? p.serverId : 'absent']); }); });`)], statusbar: '' } }))
    s.handle({ type: 'messages', messages: [] })
    const ev = (window as unknown as { __ev: unknown[] }).__ev
    ev.length = 0
    s.handle({ type: 'message.new', message: { id: 'l1', role: 'user', content: '嗨', serverId: null } })
    s.handle({ type: 'message.new', message: { id: 'l2', role: 'ai', content: '', serverId: null } })
    const body = s.refs.list.querySelectorAll('[data-chat="message-body"]')[1] as HTMLElement
    expect(body.getAttribute('data-generating')).toBe('1')
    expect(body.textContent).toContain('正在回覆')
    s.handle({ type: 'message.stream', id: 'l2', content: '<content>你' })
    s.handle({ type: 'message.stream', id: 'l2', content: '<content>你好</content>' })
    // 串流中的重繪走響應式（下一個 tick 才落到 DOM），氣泡節點不換
    await nextTick()
    expect(body.getAttribute('data-generating')).toBeNull()
    expect(body.innerHTML).not.toContain('<content>')
    s.handle({ type: 'message.done', id: 'l2', content: '<content>你好</content>', serverId: '9527' })
    expect(ev).toEqual([
      ['message:new', 'l1', '嗨', null],
      ['message:mount', 'l1', '嗨', null],
      ['message:new', 'l2', '', null],
      ['message:mount', 'l2', '', null],
      ['message:stream', 'l2', '<content>你', 'absent'],
      ['message:stream', 'l2', '<content>你好</content>', 'absent'],
      ['message:done', 'l2', '<content>你好</content>', '9527'],
      ['message:mount', 'l2', '<content>你好</content>', '9527'],
    ])
    expect(s.refs.list.querySelectorAll('[data-chat="message"]')[1].getAttribute('data-msg-id')).toBe('9527')
  })

  it('一到就是定稿的訊息（宿主先 new 再 done、內容相同）：new → mount → done，不重畫也不再 mount', () => {
    const s = boot(config({ card: { rules: [SCRIPT_RULE(`window.__ev = []; ['message:new','message:mount','message:done'].forEach(function (ev) { sdk.on(ev, function (p) { window.__ev.push([ev, p.id, p.serverId]); }); });`)], statusbar: '' } }))
    s.handle({ type: 'messages', messages: [] })
    const ev = (window as unknown as { __ev: unknown[] }).__ev
    ev.length = 0
    s.handle({ type: 'message.new', message: { id: 'l1', role: 'ai', content: '哈囉', serverId: '77', state: 'done' } })
    const bodyBefore = s.refs.list.querySelector('[data-chat="message-body"]')
    s.handle({ type: 'message.done', id: 'l1', content: '哈囉', serverId: '77' })
    expect(ev).toEqual([
      ['message:new', 'l1', '77'],
      ['message:mount', 'l1', '77'],
      ['message:done', 'l1', '77'],
    ])
    expect(s.refs.list.querySelector('[data-chat="message-body"]')).toBe(bodyBefore)
    // 內容真的變了才重畫、再 mount
    s.handle({ type: 'message.done', id: 'l1', content: '哈囉！', serverId: '77' })
    expect(ev.slice(3)).toEqual([['message:done', 'l1', '77'], ['message:mount', 'l1', '77']])
  })

  it('宿主接管頁首與輸入區（chrome: host）：root 標 data-chrome=host；composer.hide／stage.open 仍通知宿主', () => {
    const s = boot(config({ chrome: 'host', card: { rules: [SCRIPT_RULE(`sdk.composer.hide(); sdk.stage.open('full');`)], statusbar: '' } }))
    s.handle({ type: 'messages', messages: [] })
    expect(s.refs.root.getAttribute('data-chrome')).toBe('host')
    expect(sent.filter((m) => m.type === 'composer')).toEqual([{ type: 'composer', visible: false }])
    expect(sent.filter((m) => m.type === 'stage')).toEqual([{ type: 'stage', state: 'full' }])
    // 沒說就是殼自己畫
    const t = boot(config())
    expect(t.refs.root.getAttribute('data-chrome')).toBe('shell')
  })

  it('header favorite needs a real gesture; comments goes straight to the host', async () => {
    const header = { roleName: 'Example', avatar: '', badge: '', backLabel: 'Back', favoriteSupported: true, favoriteActive: false, favoriteLabel: 'Favorite', commentsSupported: true, commentsLabel: 'Comments' }
    const composer = { placeholder: '', sendState: 'send', generating: false, enterSends: true, shortcuts: [], moreOpen: false, moreItems: [], modelScore: '', assistBusy: false, assistCost: '', labels: { stop: 'Stop', more: 'More', send: 'Send', paste: 'Paste', clear: 'Clear', model: 'Model', assist: 'Assist', perTurn: 'Per turn' } }
    const s = boot(config({ chromeState: { header, composer }, card: { rules: [], statusbar: '' } }))
    // 腳本合成的 click（isTrusted=false）不算玩家按的：收藏不轉給宿主。
    s.refs.root.querySelector<HTMLElement>('.header-meun[data-lt="favorite"]')!.click()
    expect(sent).not.toContainEqual({ type: 'ui', event: 'favorite' })
    s.refs.root.querySelector<HTMLElement>('.header-meun[data-lt="comments"]')!.click()
    expect(sent).toContainEqual({ type: 'ui', event: 'comments' })
    s.dispose()
  })

  it('standard chrome keeps the author header slot connected across header updates', async () => {
    const header = { roleName: 'Example', avatar: '', badge: '', backLabel: 'Back' }
    const s = boot(config({ chromeState: { header }, card: { rules: [SCRIPT_RULE(`
      sdk.on('ready', function () {
        var slot = document.querySelector('[data-slot="header-extra"]');
        if (slot) { var button = document.createElement('button'); button.id = 'author-pages'; button.textContent = 'Pages'; slot.appendChild(button); }
      });
    `)], statusbar: '' } }))
    s.handle({ type: 'messages', messages: [] })
    expect(s.refs.headerExtra.isConnected).toBe(true)
    const button = s.refs.root.querySelector('#author-pages')
    expect(button).not.toBeNull()
    s.handle({ type: 'chrome', state: { header: { ...header, roleName: 'Updated' } } })
    await nextTick()
    expect(s.refs.headerExtra.isConnected).toBe(true)
    expect(s.refs.root.querySelector('#author-pages')).toBe(button)
    expect(s.refs.header.textContent).toContain('Updated')
  })

  it('standard chrome composer carries the MMD sandbox node names, so a card can swap the assist button the way it does on MMD', async () => {
    const header = { roleName: 'Example', avatar: '', badge: '', backLabel: 'Back' }
    const composer = { placeholder: '', sendState: 'send', generating: false, enterSends: true, shortcuts: [{ key: 'persona', label: 'Persona' }], moreOpen: false, moreItems: [], modelScore: '6', assistBusy: false, assistCost: 10, labels: { stop: 'Stop', more: 'More', send: 'Send', paste: 'Paste', clear: 'Clear', model: 'Model', assist: 'Assist', perTurn: 'Per turn' } }
    // 照 MMD 沙盒寫的卡（卡 100616 的做法）：找到 [data-chat=assistant] 才動手——替父節點加 class、
    // 在它前面插自己的按鈕、把平台的燈泡藏起來；找不到就整段不做。
    const s = boot(config({ chromeState: { header, composer }, card: { rules: [SCRIPT_RULE(`
      sdk.on('ready', function () {
        var c = document.body.querySelector('[data-chat="composer"]');
        var e = c && c.querySelector('[data-chat="assistant"]');
        if (!e) return;
        e.parentNode.classList.add('author-anchor');
        var b = document.createElement('button'); b.className = 'author-assist'; b.textContent = 'Helper';
        e.parentNode.insertBefore(b, e);
        e.style.setProperty('display', 'none', 'important');
      });
    `)], statusbar: '' } }))
    s.handle({ type: 'messages', messages: [] })
    const root = s.refs.composer
    const assist = root.querySelector<HTMLElement>('[data-chat="assistant"][data-action="assistant"]')
    expect(assist).not.toBeNull()
    expect(assist!.parentElement!.matches('.composer-row > .assistant-anchor.author-anchor')).toBe(true)
    expect(assist!.style.getPropertyValue('display')).toBe('none')
    expect(root.querySelector('.assistant-anchor > .author-assist')).not.toBeNull()
    for (const sel of ['.composer-shortcut-wrap > [data-chat="shortcut"]', '.composer-row .composer-field [data-chat="input"]', '.composer-field [data-chat="model-chip"]', '.composer-field [data-chat="send"]', '.composer-row [data-action="more"]']) {
      expect(root.querySelector(sel), sel).not.toBeNull()
    }
    // 宿主更新輸入區（點數、生成中…）後，作者插進去的按鈕還在
    s.handle({ type: 'chrome', state: { header, composer: { ...composer, generating: true, modelScore: '8' } } })
    await nextTick()
    expect(root.querySelector('.assistant-anchor > .author-assist')).not.toBeNull()
    s.dispose()
  })

  it('sdk.model.get() reports the current model and next-turn cost; model:change fires when either changes', async () => {
    const header = { roleName: 'Example', avatar: '', badge: '', backLabel: 'Back' }
    const composer = { placeholder: '', sendState: 'send', generating: false, enterSends: true, shortcuts: [], moreOpen: false, moreItems: [], modelScore: '127–251', modelName: 'Claude Sonnet 4.5 · Ripple', assistBusy: false, assistCost: '', labels: { stop: 'Stop', more: 'More', send: 'Send', paste: 'Paste', clear: 'Clear', model: 'Model', assist: 'Assist', perTurn: 'Per turn' } }
    const s = boot(config({ chromeState: { header, composer }, card: { rules: [SCRIPT_RULE(`window.__model = []; sdk.on('model:change', function (m) { window.__model.push(m.name + '|' + m.cost); });`)], statusbar: '' } }))
    const w = window as unknown as { __model: string[] }
    expect(s.sdk.model.get()).toEqual({ name: 'Claude Sonnet 4.5 · Ripple', cost: '127–251' })
    // a chrome update that leaves the model alone does not fire
    s.handle({ type: 'chrome', state: { header, composer: { ...composer, generating: true } } })
    expect(w.__model).toEqual([])
    s.handle({ type: 'chrome', state: { header, composer: { ...composer, modelName: 'DeepSeek V4 Flash', modelScore: '6' } } })
    expect(s.sdk.model.get()).toEqual({ name: 'DeepSeek V4 Flash', cost: '6' })
    expect(w.__model).toEqual(['DeepSeek V4 Flash|6'])
    s.dispose()
  })

  it('sdk.generation.get() follows the host\'s phase; generation:phase fires once per change with the time it began', () => {
    const s = boot(config({ card: { rules: [SCRIPT_RULE(`window.__ph = []; sdk.on('generation:phase', function (g) { window.__ph.push(g.phase + ':' + (g.since > 0)); });`)], statusbar: '' } }))
    const w = window as unknown as { __ph: string[] }
    expect(s.sdk.generation.get().phase).toBe('idle')
    s.handle({ type: 'generation', busy: true })
    s.handle({ type: 'generation', busy: true, phase: 'summarizing' })
    s.handle({ type: 'generation', busy: true, phase: 'summarizing' })
    s.handle({ type: 'generation', busy: true, phase: 'thinking' })
    s.handle({ type: 'generation', busy: true, phase: 'writing' })
    expect(s.sdk.generation.get().phase).toBe('writing')
    s.handle({ type: 'generation', busy: false, phase: 'idle' })
    expect(w.__ph).toEqual(['preparing:true', 'summarizing:true', 'thinking:true', 'writing:true', 'idle:true'])
    s.dispose()
  })

  it('generation:outcome fires when the turn\'s outcome changes (and back to null); get() carries it', () => {
    const s = boot(config({ card: { rules: [SCRIPT_RULE(`window.__oc = []; sdk.on('generation:outcome', function (o) { window.__oc.push(o ? o.kind + ':' + o.actions.map(function (a) { return a.action }).join('+') : 'null'); });`)], statusbar: '' } }))
    const w = window as unknown as { __oc: string[] }
    const outcome = { kind: 'server-error', label: '伺服器暫時不穩定', sub: '', actions: [{ action: 'retry', label: '重試' }] }
    expect(s.sdk.generation.get().outcome).toBeNull()
    s.handle({ type: 'generation', busy: false, phase: 'idle', outcome })
    s.handle({ type: 'generation', busy: false, phase: 'idle', outcome })
    expect(s.sdk.generation.get().outcome).toEqual(outcome)
    s.handle({ type: 'generation', busy: true, phase: 'preparing', outcome: null })
    expect(w.__oc).toEqual(['server-error:retry', 'null'])
    s.dispose()
  })

  it('conversation:switch carries the conversationId the host sends, and sdk.archive follows the archive capability', () => {
    const s = boot(config({ capabilities: { saves: false, edit: true, send: true, archive: true }, card: { rules: [SCRIPT_RULE(`window.__sw = []; sdk.on('conversation:switch', function (p) { window.__sw.push(p ? p.conversationId : 'none'); });`)], statusbar: '' } }))
    s.handle({ type: 'conversation.switch', conversationId: 'c-9' })
    s.handle({ type: 'conversation.switch' })
    expect((window as unknown as { __sw: string[] }).__sw).toEqual(['c-9', 'none'])
    expect(typeof s.sdk.archive.list).toBe('function')
    s.dispose()
  })

  it('sdk.model.get() is empty strings when the host sends no model', () => {
    const s = boot(config({ card: { rules: [], statusbar: '' } }))
    expect(s.sdk.model.get()).toEqual({ name: '', cost: '' })
    s.dispose()
  })

  it('the themed fullscreen header action goes to the host and reflects host exit state', async () => {
    const header = { roleName: 'Example', avatar: '', badge: '', backLabel: 'Back', fullscreenSupported: true, fullscreenActive: false, fullscreenLabel: 'Enter fullscreen' }
    const composer = { placeholder: '', sendState: 'send', generating: false, enterSends: true, shortcuts: [], moreOpen: false, moreItems: [], modelScore: '', assistBusy: false, assistCost: '', labels: { stop: 'Stop', more: 'More', send: 'Send', paste: 'Paste', clear: 'Clear', model: 'Model', assist: 'Assist', perTurn: 'Per turn' } }
    const s = boot(config({ chromeState: { header, composer }, card: { rules: [], statusbar: '' } }))
    const button = s.refs.root.querySelector<HTMLElement>('.header-meun[data-lt="fullscreen"]')!
    expect(button.getAttribute('aria-label')).toBe('Enter fullscreen')
    button.click()
    expect(sent).toContainEqual({ type: 'ui', event: 'fullscreen' })
    s.handle({ type: 'chrome', state: { header: { ...header, fullscreenActive: true, fullscreenLabel: 'Exit fullscreen' }, composer } })
    await nextTick()
    expect(button.getAttribute('aria-label')).toBe('Exit fullscreen')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    s.dispose()
  })

  it.each([
    ['failed', undefined],
    ['empty', { readText: async () => '' }],
  ])('標準輸入區貼上 %s 回宿主顯示既有 toast', async (reason, clipboard) => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
    try {
      const header = { roleName: 'Example', avatar: '', badge: '', backLabel: 'Back' }
      const composer = { placeholder: '', sendState: 'send', generating: false, enterSends: true, shortcuts: [], moreOpen: false, moreItems: [], modelScore: '', assistBusy: false, assistCost: '', labels: { stop: 'Stop', more: 'More', send: 'Send', paste: 'Paste', clear: 'Clear', model: 'Model', assist: 'Assist', perTurn: 'Per turn' } }
      const s = boot(config({ chromeState: { header, composer }, card: { rules: [], statusbar: '' } }))
      ;(s.refs.root.querySelector('.chat-input-tool-btn') as HTMLElement).click()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(sent).toContainEqual({ type: 'ui', event: 'paste-feedback', key: reason })
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original)
      else delete (navigator as any).clipboard
    }
  })

  it('殼一掛好就回報頁首底色；作者換了 html 的 class 之後再量一次', async () => {
    const header = { roleName: '露娜', avatar: '', badge: '', backLabel: '返回' }
    const composer = { placeholder: '', sendState: 'send', generating: false, enterSends: true, shortcuts: [], moreOpen: false, moreItems: [], modelScore: '', assistBusy: false, assistCost: '', labels: { stop: '停止', more: '更多', send: '送出', paste: '貼上', clear: '清除', model: '模型', assist: '幫答', perTurn: '每輪' } }
    const s = boot(config({ chromeState: { header, composer }, card: { rules: [], statusbar: '' } }))
    const first = sent.filter((m) => m.type === 'chrome-color')
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ type: 'chrome-color', color: expect.stringMatching(/^rgb\(\d+, \d+, \d+\)$/) })
    const style = document.createElement('style')
    style.textContent = 'html.ba-day .topTabbar { background: rgb(200, 220, 240) !important }'
    document.head.appendChild(style)
    document.documentElement.classList.add('ba-day')
    await new Promise((r) => setTimeout(r, 80))
    const after = sent.filter((m) => m.type === 'chrome-color')
    expect(after[after.length - 1]).toEqual({ type: 'chrome-color', color: 'rgb(200, 220, 240)' })
    s.dispose()
    document.documentElement.classList.remove('ba-day')
    style.remove()
  })

  it('宿主說沒有上一頁（獨立的卡片 App）：標準頁首不畫返回鍵；陽春頁首的返回鍵也藏起來', () => {
    const header = { roleName: '露娜', avatar: '', badge: '', backLabel: '返回' }
    const composer = { placeholder: '', sendState: 'send', generating: false, enterSends: true, shortcuts: [], moreOpen: false, moreItems: [], modelScore: '', assistBusy: false, assistCost: '', labels: { stop: '停止', more: '更多', send: '送出', paste: '貼上', clear: '清除', model: '模型', assist: '幫答', perTurn: '每輪' } }
    const withBack = boot(config({ chromeState: { header, composer }, card: { rules: [], statusbar: '' } }))
    expect(withBack.refs.root.querySelector('.icon-back[data-lt="back"]')).not.toBeNull()
    const noBack = boot(config({ chromeState: { header: { ...header, showBack: false }, composer }, card: { rules: [], statusbar: '' } }))
    expect(noBack.refs.root.querySelector('.icon-back[data-lt="back"]')).toBeNull()
    const plain = boot(config({ chromeState: { header: { ...header, showBack: false }, composer }, chrome: 'host', card: { rules: [], statusbar: '' } }))
    expect((plain.refs.headerBack as HTMLElement).hidden).toBe(true)
  })

  it('標準輸入區：作者腳本合成的 click 按不動送出鍵（不是真的手勢）；確認框的「允許」也只認真的點擊', async () => {
    const chromeState = {
      header: { roleName: '露娜', avatar: '', badge: '', backLabel: '返回' },
      composer: { placeholder: '說點什麼', sendState: 'send', generating: false, enterSends: true, shortcuts: [], moreOpen: false, moreItems: [], modelScore: '', assistBusy: false, assistCost: '', labels: { stop: '停止', more: '更多', send: '送出', paste: '貼上', clear: '清除', model: '模型', assist: '幫答', perTurn: '每輪' } },
    }
    const s = boot(config({ chromeState, card: { rules: [SCRIPT_RULE(`sdk.input.set('嗨'); document.querySelector('.lt-send').click();`)], statusbar: '' } }))
    s.handle({ type: 'messages', messages: [] })
    expect(s.refs.root.getAttribute('data-chrome')).toBe('standard')
    expect(sent.filter((m) => m.type === 'ui')).toEqual([])
    // 真的手勢（isTrusted 在 jsdom 裡合成不了，直接量 gesture 的判式：非 trusted 的 click 不放行）
    const p = s.sdk.message.send('自動送')
    await Promise.resolve()
    const ok = s.refs.root.querySelector('[data-chat="alert-ok"]') as HTMLElement
    ok.click()
    await Promise.resolve()
    expect(s.refs.root.querySelector('[data-chat="alert"]')).not.toBeNull()
    ;(s.refs.root.querySelector('[data-chat="alert-cancel"]') as HTMLElement).click()
    await expect(p).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('作者腳本改 html／body 的 class 或 data-*，殼把文件狀態送給宿主（docstate）', async () => {
    const s = boot(config({ card: { rules: [SCRIPT_RULE(`document.documentElement.setAttribute('data-ba-beauty','day'); document.body.classList.add('ba-enabled');`)], statusbar: '' } }))
    s.handle({ type: 'messages', messages: [] })
    await new Promise((r) => setTimeout(r, 120))
    const last = sent.filter((m) => m.type === 'docstate').pop() as { html: { data: Record<string, string> }; body: { className: string } } | undefined
    expect(last).toBeTruthy()
    expect(last!.html.data['data-ba-beauty']).toBe('day')
    expect(last!.body.className).toContain('ba-enabled')
  })

  it('晚訂閱：mount/done 補發所有已掛氣泡；ready 不補發；回呼內 querySelector 只看當前氣泡', () => {
    const s = boot(config({ card: { rules: [{ id: 2, find: '/按鈕/', replace: '<button class="hello-btn">hi</button>' }], statusbar: '' } }))
    s.handle({ type: 'messages', messages: [
      { id: 'h1', role: 'ai', content: '按鈕', serverId: '1' },
      { id: 'h2', role: 'ai', content: '按鈕', serverId: '2' },
    ] })
    const sdk = (window as unknown as { sdk: { on(e: string, cb: (p?: unknown) => void): void } }).sdk
    const mounted: string[] = []
    const done: string[] = []
    let ready = 0
    sdk.on('message:mount', (p) => {
      const btn = document.querySelector('.hello-btn') as HTMLElement | null
      const owner = btn ? btn.closest('[data-chat="message"]')!.getAttribute('data-msg-id') : 'none'
      mounted.push(`${(p as { id: string }).id}@${owner}`)
    })
    sdk.on('message:done', (p) => done.push((p as { id: string }).id))
    sdk.on('ready', () => { ready++ })
    expect(mounted).toEqual(['h1@1', 'h2@2'])
    expect(done).toEqual(['h1', 'h2'])
    expect(ready).toBe(0)
    // 回呼外就是一般的文件：氣泡內容查得到（舊頁寫法的點火器靠這個）
    expect(document.querySelector('.hello-btn')).not.toBeNull()
  })
})

describe('殼：功能欄、樣式、主題、輸入區、舞台與返回', () => {
  it('statusbar 非空才有節點且過規則；style 合成 author-css；主題切換發 theme:change', () => {
    const s = boot(config({ theme: 'light', card: { rules: [{ id: 1, find: '{{hud}}', replace: '<style>.hud{color:red}</style><div class="hud">HUD</div>' }], statusbar: '{{hud}}' } }))
    expect(s.refs.statusbar!.innerHTML).toContain('<div class="hud">HUD</div>')
    expect(s.refs.authorCss.textContent).toBe('.hud{color:red}')
    expect(s.refs.root.getAttribute('data-theme')).toBe('light')
    let changed = 0
    s.sdk.on('theme:change', () => { changed++ })
    s.handle({ type: 'theme', theme: 'dark' })
    expect(s.refs.root.getAttribute('data-theme')).toBe('dark')
    expect(changed).toBe(1)
    const none = boot(config())
    expect(none.refs.statusbar).toBeNull()
  })

  it('輸入區：打字發 input:change（字串）並鏡射給宿主；送出走 request 並在宿主回覆後清空', async () => {
    const s = boot(config())
    s.handle({ type: 'messages', messages: [] })
    const seen: unknown[] = []
    s.sdk.on('input:change', (p) => seen.push(p))
    s.refs.input.value = '你好'
    s.refs.input.dispatchEvent(new Event('input'))
    expect(seen).toEqual(['你好'])
    expect(sent.at(-1)).toEqual({ type: 'input', value: '你好' })
    s.refs.send.click()
    const req = sent.find((m) => m.type === 'request') as { reqId: number; op: string; args: unknown[] }
    expect(req.op).toBe('message.send')
    expect(req.args).toEqual(['你好'])
    s.handle({ type: 'reply', reqId: req.reqId, ok: true })
    await Promise.resolve()
    await Promise.resolve()
    expect(s.refs.input.value).toBe('')
  })

  it('read-only generation revokes SDK send while preserving the typed input and history', async () => {
    const s = boot(config())
    s.refs.input.value = 'Keep my draft'
    s.refs.input.dispatchEvent(new Event('input'))
    s.handle({ type:'generation',busy:false,readOnly:true } as any)
    expect(s.refs.input.readOnly).toBe(true)
    expect(s.refs.send.disabled).toBe(true)
    await expect(s.sdk.message.send('new turn')).rejects.toMatchObject({code:'NOT_SUPPORTED'})
    expect(s.refs.input.value).toBe('Keep my draft')
  })

  it('generation busy 時送出鈕停用；composer.hide 同步 data-composer', () => {
    const s = boot(config())
    s.handle({ type: 'generation', busy: true })
    expect(s.refs.send.disabled).toBe(true)
    expect(s.refs.root.getAttribute('data-busy')).toBe('1')
    s.sdk.composer.hide()
    expect(s.refs.root.getAttribute('data-composer')).toBe('hidden')
    expect(s.refs.composer.hidden).toBe(true)
    expect(sent.at(-1)).toEqual({ type: 'composer', visible: false })
  })

  it('舞台：open 設 data-stage 並通知宿主；宿主的 back 先關舞台（發 stage:close）、再一次才交回宿主', () => {
    const s = boot(config())
    const closed: number[] = []
    let back = 0
    s.sdk.on('stage:close', () => closed.push(1))
    s.sdk.on('back', () => { back++ })
    s.sdk.stage.open('full')
    expect(s.refs.stage.getAttribute('data-stage')).toBe('full')
    expect(sent.at(-1)).toEqual({ type: 'stage', state: 'full' })
    s.handle({ type: 'back' })
    expect(closed).toEqual([1])
    expect(s.refs.stage.getAttribute('data-stage')).toBe('closed')
    expect(sent.at(-1)).toEqual({ type: 'back-handled', handled: true })
    s.handle({ type: 'back' })
    expect(back).toBe(1)
    expect(sent.at(-1)).toEqual({ type: 'back-handled', handled: false })
    // 作者自己 close 不發 stage:close
    s.sdk.stage.open('content')
    s.sdk.stage.close()
    expect(closed).toEqual([1])
  })

  it('舞台 content 只蓋訊息區：下緣讓出輸入區；輸入區藏起來就貼底', () => {
    const s = boot(config())
    const rect = (top: number, bottom: number) => ({ top, bottom, height: bottom - top, left: 0, right: 0, width: 0, x: 0, y: top, toJSON() {} }) as DOMRect
    s.refs.root.getBoundingClientRect = () => rect(0, 800)
    s.refs.composer.getBoundingClientRect = () => rect(720, 800)
    s.sdk.stage.open('content')
    expect(s.refs.root.style.getPropertyValue('--shell-composer-h')).toBe('80px')
    s.sdk.stage.close()
    s.refs.composer.hidden = true
    s.sdk.stage.open('content')
    expect(s.refs.root.style.getPropertyValue('--shell-composer-h')).toBe('0px')
  })

  it('content stage tracks the flow statusbar height when the HUD expands', () => {
    const observers: Array<{ targets: Element[]; callback: () => void }> = []
    vi.stubGlobal('ResizeObserver', class {
      targets: Element[] = []
      constructor(readonly callback: () => void) { observers.push(this) }
      observe(target: Element) { this.targets.push(target) }
      unobserve() {}
      disconnect() {}
    })
    try {
      const s = boot(config({ card: { rules: [], statusbar: 'HUD' } }))
      let barHeight = 44
      Object.defineProperty(s.refs.statusbar!, 'offsetHeight', { get: () => barHeight })
      s.sdk.stage.open('content')
      expect(s.refs.root.style.getPropertyValue('--shell-statusbar-h')).toBe('44px')
      const observer = observers.find(o => o.targets.includes(s.refs.statusbar!))
      expect(observer).toBeDefined()
      barHeight = 88
      observer!.callback()
      expect(s.refs.root.style.getPropertyValue('--shell-statusbar-h')).toBe('88px')
    } finally { vi.unstubAllGlobals() }
  })

  it('切會話：清氣泡（unmount）、關舞台、清補發記錄、發 conversation:switch；訂閱不清', () => {
    const s = boot(config())
    s.handle({ type: 'messages', messages: [{ id: 'h1', role: 'ai', content: 'a', serverId: '1' }] })
    const log: string[] = []
    s.sdk.on('message:unmount', (p) => log.push(`un:${(p as { id: string }).id}`))
    s.sdk.on('conversation:switch', () => log.push('switch'))
    s.sdk.stage.open('content')
    s.handle({ type: 'conversation.switch' })
    expect(log).toEqual(['un:h1', 'switch'])
    expect(s.refs.list.childElementCount).toBe(0)
    expect(s.refs.stage.getAttribute('data-stage')).toBe('closed')
    const late: string[] = []
    s.sdk.on('message:mount', (p) => late.push((p as { id: string }).id))
    expect(late).toEqual([])
    s.handle({ type: 'messages', messages: [{ id: 'h9', role: 'ai', content: 'b', serverId: '9' }] })
    expect(late).toEqual(['h9'])
  })

  it('存檔：宿主宣告 saves 並預載 → save.get 立即可用；set 走 request，宿主拒絕時 reject 對應碼', async () => {
    const s = boot(config({ capabilities: { saves: true, edit: false, send: true }, saves: { hp: 5 } }))
    expect(s.sdk.save.get('hp')).toBe(5)
    const p = s.sdk.save.set('hp', 6)
    const req = sent.find((m) => m.type === 'request' && (m as { op: string }).op === 'save.set') as { reqId: number }
    s.handle({ type: 'reply', reqId: req.reqId, ok: false, error: { code: 'NETWORK' } })
    await expect(p).rejects.toMatchObject({ code: 'NETWORK' })
    expect(s.sdk.save.get('hp')).toBe(5)
  })
})

// ── 作者 HTML 裡的連結：殼沒有 allow-popups，點了會把 iframe 自己導走；攔下交給宿主開 ──
describe('作者連結交給宿主開', () => {
  it('http／https 連結：擋下導頁、送 open-url；#錨點與 javascript: 不動；作者自己 preventDefault 了就尊重', () => {
    const s = boot(config())
    const mount = document.getElementById('app')!
    mount.insertAdjacentHTML('beforeend', '<a id="ext" href="https://example.com/x">外</a><a id="hash" href="#top">錨</a><a id="js" href="javascript:void(0)">js</a><a id="own" href="https://example.com/own">自己處理</a>')
    const click = (id: string) => { const e = new MouseEvent('click', { bubbles: true, cancelable: true }); document.getElementById(id)!.dispatchEvent(e); return e.defaultPrevented }
    expect(click('ext')).toBe(true)
    expect(sent.filter((m) => m.type === 'open-url')).toEqual([{ type: 'open-url', url: 'https://example.com/x' }])
    expect(click('hash')).toBe(false)
    expect(click('js')).toBe(false)
    document.getElementById('own')!.addEventListener('click', (e) => e.preventDefault())
    click('own')
    expect(sent.filter((m) => m.type === 'open-url')).toHaveLength(1)
    s.dispose()
  })
})

describe('殼：載入更早的歷史', () => {
  it('宿主說還有更早的歷史、殼停在頂端 → 送 history more；800ms 內不重送；宿主用 message.new + before 插進來（不捲到底、放在指定那則之前）', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-16T00:00:00Z'))
      const s = boot(config({ card: { rules: [SCRIPT_RULE(`window.__ev = []; ['message:new','message:mount','message:done'].forEach(function (ev) { sdk.on(ev, function (p) { window.__ev.push(ev + ':' + p.id); }); });`)], statusbar: '' } }))
      s.handle({ type: 'messages', messages: [{ id: 'h5', role: 'ai', content: '五', serverId: '5' }, { id: 'h6', role: 'user', content: '六', serverId: null }] })
      sent = []
      // jsdom 的 scrollTop 恆為 0 ＝停在頂端：一收到「還有」就要
      s.handle({ type: 'history', more: true, loading: false })
      expect(sent).toEqual([{ type: 'history', op: 'more' }])
      // 宿主還在載：再捲也不重送
      s.refs.messages.querySelector('#scrollview')!.dispatchEvent(new Event('scroll'))
      expect(sent).toHaveLength(1)
      const ev = (window as unknown as { __ev: string[] }).__ev
      ev.length = 0
      s.handle({ type: 'message.new', message: { id: 'l1', role: 'ai', content: '三', serverId: '3', state: 'done' }, before: 'h5' })
      // 宿主對定稿的 AI 歷史接著補一次 done（跟即時訊息同一條路）：整段下來 l1 只能有一個 message:done
      s.handle({ type: 'message.done', id: 'l1', content: '三', serverId: '3' })
      s.handle({ type: 'message.new', message: { id: 'l2', role: 'user', content: '四', serverId: null, state: 'done' }, before: 'h5' })
      const ids = Array.from(s.refs.list.querySelectorAll('[data-chat="message"]')).map((el) => el.closest('[data-chat="message-frame"]'))
      expect(ids.length).toBeGreaterThan(0)
      const frames = Array.from(s.refs.list.querySelectorAll('[data-chat="message-frame"]'))
      expect(frames).toHaveLength(4)
      // 沒有 IntersectionObserver（jsdom）＝不視窗化：插進來的也直接掛好
      expect(ev).toEqual(['message:new:l1', 'message:mount:l1', 'message:done:l1', 'message:new:l2', 'message:mount:l2'])
      expect(frames[0].querySelector('[data-chat="message-body"]')!.textContent).toContain('三')
      expect(frames[2].querySelector('[data-chat="message-body"]')!.textContent).toContain('五')
      // 宿主說載完了、還有更多：過了節流窗才會再要
      s.handle({ type: 'history', more: true, loading: false })
      expect(sent).toHaveLength(1)
      vi.setSystemTime(new Date('2026-09-16T00:00:01Z'))
      s.handle({ type: 'history', more: true, loading: false })
      expect(sent).toHaveLength(2)
      // 沒有更多：不再要
      vi.setSystemTime(new Date('2026-09-16T00:00:03Z'))
      s.handle({ type: 'history', more: false, loading: false })
      s.refs.messages.querySelector('#scrollview')!.dispatchEvent(new Event('scroll'))
      expect(sent).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('切會話後歷史狀態歸零：沒收到新的 history 之前捲到頂不會要', () => {
    const s = boot(config())
    s.handle({ type: 'messages', messages: [] })
    s.handle({ type: 'history', more: true, loading: true })
    s.handle({ type: 'conversation.switch' })
    sent = []
    s.refs.messages.querySelector('#scrollview')!.dispatchEvent(new Event('scroll'))
    expect(sent.filter((m) => m.type === 'history')).toEqual([])
  })
})


describe('assist paid confirmation in sandbox', () => {
  it('does not allow a scripted click to approve spending', async () => {
    const chromeState = {
      header: { roleName: '露娜', avatar: '', badge: '', backLabel: '返回' },
      composer: { placeholder: '說點什麼', sendState: 'send', generating: false, enterSends: true, shortcuts: [], moreOpen: false, moreItems: [], modelScore: '', assistBusy: false, assistCost: '', labels: { stop: '停止', more: '更多', send: '送出', paste: '貼上', clear: '清除', model: '模型', assist: '幫答', perTurn: '每輪' } },
    }
    const s=boot(config({chrome:'shell',chromeState}))
    s.handle({type:'panels',state:{sheet:'assist',title:'Assist',closeLabel:'Close',props:{choices:[],busy:false,confirming:true,error:'',labels:{confirm:'Costs 10',generate:'Generate',cancel:'Cancel'}},menu:{open:false,editing:false,draft:'',message:null,actions:[],labels:{cancel:'Cancel',confirm:'OK'},anchor:null}}} as any)
    await nextTick()
    const button=document.querySelector('.assist-actions button') as HTMLButtonElement
    expect(button).toBeTruthy(); button.click(); await nextTick()
    expect(sent.filter((m:any)=>m.type==='panel.ui' && m.panel==='assist' && m.event==='confirm')).toEqual([])
  })
})

describe('殼的根不准被內部捲動（iOS 鍵盤露出輸入框時會捲 overflow:hidden 的祖先且不捲回）', () => {
  it('根被捲動時立刻歸零；CSS 用 overflow: clip 讓它根本不可捲', async () => {
    const s = boot(config())
    const root = s.refs.root
    let top = 0
    Object.defineProperty(root, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v } })
    root.scrollTop = 55
    root.dispatchEvent(new Event('scroll'))
    expect(root.scrollTop).toBe(0)
    const css = (await import('node:fs')).readFileSync((await import('node:path')).resolve(process.cwd(), 'src/sandbox/shell.css'), 'utf8')
    const block = css.match(/\[data-chat="root"\] \{[^}]*\}/)?.[0] || ''
    expect(block).toMatch(/overflow: clip;/)
  })
})

// 2026-09-23 作者回報：沙箱卡看不到「选择开场」。普通頁與沙箱頁都要有，點一條交給宿主填輸入框、不送出。
describe('殼：開場選項（MMD prologue）', () => {
  it('宿主給了選項就畫在訊息列之後；點一條回報第幾條給宿主；清空就拿掉', () => {
    const s = boot(config())
    s.handle({ type: 'messages', messages: [{ id: 'greeting', role: 'ai', content: '開場白', serverId: null }] })
    s.handle({ type: 'prologue', title: '选择开场', items: ['我想搭船。', '<b>不是標籤</b>'] })
    const scope = s.refs.messages.querySelector('[data-lt="prologue"]') as HTMLElement
    expect(scope).not.toBeNull()
    expect(scope.classList.contains('prologue-scope')).toBe(true)
    expect(scope.previousElementSibling).toBe(s.refs.list)
    expect(scope.querySelector('.prologue-title')!.textContent).toBe('选择开场')
    const items = [...scope.querySelectorAll('.prologue-content')] as HTMLElement[]
    expect(items.map((n) => n.textContent)).toEqual(['我想搭船。', '<b>不是標籤</b>'])
    expect(scope.querySelector('b')).toBeNull()
    sent = []
    items[1].click()
    expect(sent).toContainEqual({ type: 'ui', event: 'prologue', key: '1' })
    expect(sent.some((m) => m.type === 'request')).toBe(false)
    s.handle({ type: 'prologue', title: '选择开场', items: [] })
    expect(s.refs.messages.querySelector('[data-lt="prologue"]')).toBeNull()
  })

  // owner 2026-11-11：有開場網頁的卡，選項在網頁與輸入區之間佔一大塊、露出背景；改成快捷列最左邊一顆鍵，點開出浮層。
  it('有開場網頁的卡：選項收在快捷列最左邊一顆鍵，不畫在訊息列後面；點開浮層、點一條一樣回報第幾條並收起；清空就拿掉', async () => {
    const header = { roleName: 'Example', avatar: '', badge: '', backLabel: 'Back' }
    const composer = { placeholder: '', sendState: 'send', generating: false, enterSends: true, shortcuts: [{ key: 'persona', label: 'Persona' }], moreOpen: false, moreItems: [], modelScore: '', assistBusy: false, assistCost: '', labels: { stop: 'Stop', more: 'More', send: 'Send', paste: 'Paste', clear: 'Clear', model: 'Model', assist: 'Assist', perTurn: 'Per turn' } }
    const s = boot(config({ chromeState: { header, composer }, card: { rules: [], statusbar: '', format: 'fengyue', openingPage: '<p>首屏</p>' } }))
    s.handle({ type: 'prologue', title: '選擇開場', items: ['我想搭船。', '我留下來。'] })
    await nextTick()
    expect(s.refs.messages.querySelector('[data-lt="prologue"]')).toBeNull()
    // 不另佔一排：鍵是快捷列的第一顆，作者給快捷鍵的樣式照樣套得到
    const toggle = s.refs.composer.querySelector('[data-lt="prologue"]') as HTMLElement
    expect(toggle).not.toBeNull()
    expect(toggle.parentElement?.getAttribute('data-chat')).toBe('shortcut')
    expect(toggle.parentElement?.firstElementChild).toBe(toggle)
    expect(toggle.classList.contains('shortcut-btn')).toBe(true)
    expect(toggle.textContent!.trim()).toBe('選擇開場')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    // 浮層在快捷列外面（快捷列會橫捲裁切），收起時藏著
    const list = s.refs.composer.querySelector('.prologue-scope--dock') as HTMLElement
    expect(toggle.closest('.shortcut-bar-wrapper')!.contains(list)).toBe(false)
    expect(list.style.display).toBe('none')
    toggle.click()
    await nextTick()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(list.style.display).toBe('')
    const items = [...list.querySelectorAll('.prologue-content')] as HTMLElement[]
    expect(items.map((n) => n.textContent)).toEqual(['我想搭船。', '我留下來。'])
    sent = []
    items[1].click()
    await nextTick()
    expect(sent).toContainEqual({ type: 'ui', event: 'prologue', key: '1' })
    expect(list.style.display).toBe('none')
    s.handle({ type: 'prologue', title: '選擇開場', items: [] })
    await nextTick()
    expect(s.refs.composer.querySelector('[data-lt="prologue"]')).toBeNull()
    s.dispose()
  })
})

// 沙箱卡看不到宿主的系統訊息卡：第一輪容量不夠時的選擇要走面板，殼用同一個元件畫。
describe('殼：容量不夠時的選擇', () => {
  const capacityPanels = (props: Record<string, unknown>) => ({
    type: 'panels', state: { sheet: 'capacity', title: '這張卡需要更多容量', closeLabel: '取消', heading: true, props,
      menu: { open: false, editing: false, draft: '', message: null, actions: [], labels: { cancel: 'Cancel', confirm: 'OK' }, anchor: null } },
  })
  const chromeState = {
    header: { roleName: '露娜', avatar: '', badge: '', backLabel: '返回' },
    composer: { placeholder: '說點什麼', sendState: 'send', generating: false, enterSends: true, shortcuts: [], moreOpen: false, moreItems: [], modelScore: '', assistBusy: false, assistCost: '', labels: { stop: '停止', more: '更多', send: '送出', paste: '貼上', clear: '清除', model: '模型', assist: '幫答', perTurn: '每輪' } },
  }
  const props = { content: '說明', cancelText: '取消', saving: false, error: '', options: [
    { key: 'raise', label: '調到 128K', desc: '保留完整設定' },
    { key: 'trim', label: '用目前容量玩', desc: '只帶最重要的設定' },
  ] }

  it('宿主開了容量選擇就畫出兩個選項；取消交回宿主', async () => {
    const s = boot(config({ chrome: 'shell', chromeState }))
    s.handle(capacityPanels(props) as any)
    await nextTick()
    const rows = [...document.querySelectorAll('.capacity-scope .capacity-option')] as HTMLElement[]
    expect(rows.map((r) => r.querySelector('.capacity-option-label')!.textContent)).toEqual(['調到 128K', '用目前容量玩'])
    ;(document.querySelector('.capacity-cancel') as HTMLElement).click()
    await nextTick()
    expect(sent).toContainEqual({ type: 'panel.ui', panel: 'capacity', event: 'cancel', args: [] })
  })

  it('作者腳本合成的點擊不能替玩家選（調高容量會多花點數）', async () => {
    const s = boot(config({ chrome: 'shell', chromeState }))
    s.handle(capacityPanels(props) as any)
    await nextTick()
    ;(document.querySelector('.capacity-option') as HTMLElement).click()
    await nextTick()
    expect(sent.filter((m: any) => m.type === 'panel.ui' && m.panel === 'capacity' && m.event === 'pick')).toEqual([])
  })
})

describe('殼：舞台背景', () => {
  it('直、橫兩張都交給舞台的兩個變數', () => {
    boot(config({ backgroundUrl: 'https://cdn/p.jpg', backgroundLandscapeUrl: 'https://cdn/l.jpg' }))
    const stage = document.querySelector('.chat-scope-box') as HTMLElement
    expect(stage.style.getPropertyValue('--lt-bg-portrait')).toBe('url("https://cdn/p.jpg")')
    expect(stage.style.getPropertyValue('--lt-bg-landscape')).toBe('url("https://cdn/l.jpg")')
  })

  it('沒有橫圖：不寫橫圖變數，橫屏退回直圖', () => {
    boot(config({ backgroundUrl: 'https://cdn/p.jpg' }))
    const stage = document.querySelector('.chat-scope-box') as HTMLElement
    expect(stage.style.getPropertyValue('--lt-bg-landscape')).toBe('')
  })

  it('玩家換成純色：立刻生效，根與舞台都不再畫原圖，不必重開', async () => {
    const s = boot(config({ backgroundUrl: 'https://cdn/p.jpg', background: { mode: 'card', portrait: 'https://cdn/p.jpg', landscape: '', color: '' } }))
    expect(s.refs.root.style.backgroundImage).toContain('https://cdn/p.jpg')
    s.handle({ type: 'background', background: { mode: 'color', portrait: '', landscape: '', color: '#18202E' } } as any)
    await nextTick()
    expect(s.refs.root.style.backgroundImage).toBe('')
    expect(s.refs.root.getAttribute('data-lt-player-bg')).toBe('color')
    const stage = document.querySelector('.chat-scope-box') as HTMLElement
    expect(stage.getAttribute('data-lt-player-bg')).toBe('color')
    expect(stage.style.getPropertyValue('--lt-bg-portrait')).toBe('')
    expect((document.querySelector('.lt-stage-bg') as HTMLElement).style.getPropertyValue('--lt-player-bg-color')).toBe('#18202E')
  })

  it('玩家換成淺色純色：根與舞台都標成淺色調，深底規則不會從根命中（QA 2026-11-06：淺灰時動作列成了深底淺字）', async () => {
    const s = boot(config({ background: { mode: 'card', portrait: 'https://cdn/p.jpg', landscape: '', color: '' } }))
    s.handle({ type: 'background', background: { mode: 'color', portrait: '', landscape: '', color: '#F2F3F5' } } as any)
    await nextTick()
    const stage = document.querySelector('.chat-scope-box') as HTMLElement
    expect(stage.getAttribute('data-lt-player-tone')).toBe('light')
    expect(s.refs.root.getAttribute('data-lt-player-tone')).toBe('light')
    expect(s.refs.root.matches('[data-lt-player-bg=color]:not([data-lt-player-tone=light])')).toBe(false)
    s.handle({ type: 'background', background: { mode: 'color', portrait: '', landscape: '', color: '#18202E' } } as any)
    await nextTick()
    expect(s.refs.root.hasAttribute('data-lt-player-tone')).toBe(false)
  })

  it('開機就帶模糊：第一幀就是糊的那一層', () => {
    boot(config({ backgroundUrl: 'https://cdn/p.jpg', background: { mode: 'blur', portrait: 'https://cdn/p.jpg', landscape: '', color: '#16191E' } }))
    expect(document.querySelector('.lt-stage-bg.is-blur')).not.toBeNull()
    expect((document.querySelector('[data-chat=root]') as HTMLElement).style.backgroundImage).toBe('')
  })

  it('偏好還沒回來：根標成 pending、不畫圖；回來是原圖就拿掉標記', async () => {
    const s = boot(config({ background: { mode: 'card', pending: true, portrait: '', landscape: '', color: '' } }))
    expect(s.refs.root.getAttribute('data-lt-player-bg')).toBe('pending')
    expect(s.refs.root.style.backgroundImage).toBe('')
    s.handle({ type: 'background', background: { mode: 'card', portrait: 'https://cdn/p.jpg', landscape: '', color: '' } } as any)
    await nextTick()
    expect(s.refs.root.hasAttribute('data-lt-player-bg')).toBe(false)
    expect(s.refs.root.style.backgroundImage).toContain('https://cdn/p.jpg')
  })

  it('換回卡片原圖：標記拿掉，原圖回來', async () => {
    const s = boot(config({ background: { mode: 'color', portrait: '', landscape: '', color: '#16191E' } }))
    s.handle({ type: 'background', background: { mode: 'card', portrait: 'https://cdn/p.jpg', landscape: '', color: '' } } as any)
    await nextTick()
    expect(s.refs.root.hasAttribute('data-lt-player-bg')).toBe(false)
    expect(document.querySelector('.lt-stage-bg')).toBeNull()
  })
})

describe('原生區塊：沒有規則的卡也有面板與選項', () => {
  it.each(['「等一下，先問：真的嗎？！」', '「待って、確認します：合計１００％です。」？！'])('選項顯示、填入及送出皆保留全形字：%s', async (text) => {
    const s = boot(config())
    s.handle({ type: 'messages', messages: [{ id: 'greeting', role: 'ai', content: `[choices]\n- ${text}\n[/choices]`, serverId: null }] })
    await nextTick()
    const button = s.refs.list.querySelector('.lt-choice') as HTMLButtonElement
    expect(button.textContent).toBe(text)
    button.click()
    expect(s.sdk.input.get()).toBe(text)
    expect(sent.some(m => m.type === 'request')).toBe(false)
    s.refs.send.click()
    expect(sent.find(m => m.type === 'request')).toMatchObject({ op: 'message.send', args: [text] })
  })

  it('開場白裡的 [status] 與 [choices] 畫成 .lt-status／.lt-choices；點選項填進輸入框不送出；玩家訊息不畫', async () => {
    const s = boot(config({ card: { rules: [], statusbar: '' } }))
    s.handle({ type: 'messages', messages: [
      { id: 'greeting', role: 'ai', content: 'Hi.\n[status]\nhp: 72/100\nmood: wary\n[/status]\n[choices]\n- Ask about the keeper\n- Say nothing\n[/choices]', serverId: null },
      { id: 'l1', role: 'user', content: '[status]\nhp: 999\n[/status]', serverId: null },
    ] })
    await nextTick()
    const bodies = s.refs.list.querySelectorAll('[data-chat="message-body"]')
    expect(bodies[0].querySelector('.lt-status')).not.toBeNull()
    expect(bodies[0].innerHTML).toContain('width:72.0%')
    const btn = bodies[0].querySelector('.lt-choice') as HTMLButtonElement
    expect(btn.textContent).toBe('Ask about the keeper')
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(s.sdk.input.get()).toBe('Ask about the keeper')
    expect(sent.some((m) => m.type === 'request')).toBe(false)
    expect(bodies[1].querySelector('.lt-status')).toBeNull()
    expect(bodies[1].textContent).toContain('[status]')
  })
})

describe('功能欄掛載檔案的格式字元', () => {
  it('不讓頂層 BOM 或空白排出空行；保留元素內空格與字元', () => {
    const s=boot(config({card:{rules:[],statusbar:'mount',statusbarHtml:'\n\ufeff<div class="rail" style="position:fixed">Rail</div><span>A B</span> <span>B\ufeffC</span>'}}))
    const slot=s.refs.statusbar!
    const stray=Array.from(slot.childNodes).filter(n=>n.nodeType===3&&n.textContent?.includes('\ufeff')&&!n.textContent.trim())
    expect(stray).toHaveLength(0)
    expect(slot.querySelector('.rail')).not.toBeNull()
    expect(slot.querySelectorAll('span')[0].textContent).toBe('A B')
    expect(slot.querySelectorAll('span')[1].textContent).toBe('B\ufeffC')
    expect(Array.from(slot.childNodes).some(n=>n.nodeType===3)).toBe(false)
  })
})

describe('殼：分享情境', () => {
  const share = { enabled: true, context: 'p1-4.b', url: 'https://sukisuki.ai/cards/1', audience: 'link' as const }

  it('腳本頂層就讀得到 hello 帶的情境碼；share 訊息換掉現值並發 share:change', () => {
    const s = boot(config({
      capabilities: { saves: false, edit: false, send: true, share: true },
      share,
      card: { rules: [SCRIPT_RULE(`window.__top = { context: sdk.share.context, link: sdk.share.link('p1-1.c') };`)], statusbar: '' },
    }))
    expect((window as unknown as { __top: unknown }).__top).toEqual({ context: 'p1-4.b', link: 'https://sukisuki.ai/cards/1?share=p1-1.c' })
    let changed = 0
    s.sdk.on('share:change', () => { changed++ })
    s.handle({ type: 'share', share: { ...share, url: 'https://sukisuki.ai/cards/1?ref=ABCD' } })
    expect(changed).toBe(1)
    expect(s.sdk.share.link('p1-1.c')).toBe('https://sukisuki.ai/cards/1?ref=ABCD&share=p1-1.c')
    expect(s.sdk.share.context).toBe('p1-4.b')
  })

  it('舊宿主（沒給 share）：context 是 null，link 丟 HOST_DENIED', () => {
    const s = boot(config())
    expect(s.sdk.share.context).toBeNull()
    expect(s.sdk.share.enabled).toBe(false)
    expect(() => s.sdk.share.link('a')).toThrow(expect.objectContaining({ code: 'HOST_DENIED' }))
  })
})

describe('殼：訊息規則腳本與功能欄／SDK 去重（卡 100737／100743）', () => {
  it.each([true, false])('卡 100737 同構：訊息規則的建角表單 script 等氣泡掛上才跑一次，分頁、輸入預覽與 execCommand 複製均有效（宿主 view=%s）', async (useHostView) => {
    delete (window as unknown as Record<string, unknown>).__formRuns
    const copied: string[] = []
    const origExecCommand = document.execCommand
    document.execCommand = ((cmd: string) => { copied.push(cmd); return true }) as typeof document.execCommand
    try {
      const formHtml = `
        <head><style>.form-wrap{color:#e9eefc}</style></head>
        <div class="form-wrap">
          <div role="tablist">
            <button type="button" class="tab is-active" id="tab-1" data-tab="panel-1" value="panel-1">基本</button>
            <button type="button" class="tab" id="tab-2" data-tab="panel-2" value="panel-2">外貌</button>
          </div>
          <div class="panel" id="panel-1"><input id="f-name" type="text" /></div>
          <div class="panel" id="panel-2" hidden><select id="f-hair"><option value="黑">黑</option><option value="銀">銀</option></select></div>
          <pre id="preview"></pre>
          <button type="button" id="btn-copy">一键复制</button>
        </div>
        <script>(function(){
          window.__formRuns = (window.__formRuns || 0) + 1;
          var tabs = Array.from(document.querySelectorAll('.tab'));
          var panels = Array.from(document.querySelectorAll('.panel'));
          tabs.forEach(function(t){
            t.addEventListener('click', function(){
              var id = t.getAttribute('data-tab') || t.getAttribute('value');
              tabs.forEach(function(b){ b.classList.toggle('is-active', b === t); });
              panels.forEach(function(p){ if (p.id === id) p.removeAttribute('hidden'); else p.setAttribute('hidden', ''); });
            });
          });
          var fName = document.getElementById('f-name');
          var fHair = document.getElementById('f-hair');
          var preview = document.getElementById('preview');
          function build(){
            preview.textContent = '【姓名】' + (fName.value.trim() || '（未填）') + '\\n【发色】' + fHair.value;
          }
          [fName, fHair].forEach(function(el){
            el.addEventListener('input', build);
            el.addEventListener('change', build);
          });
          var btnCopy = document.getElementById('btn-copy');
          btnCopy.addEventListener('click', function(){
            document.execCommand('copy');
            btnCopy.textContent = '已复制 ✓';
          });
          build();
        })();</script>
      `
      const s = boot(config({
        card: {
          rules: [{ id: 1, name: '开场白', find: '开场白', replace: formHtml, enabled: true }],
          statusbar: '',
        },
      }))
      // hello 階段（訊息尚未送達）不提早跑訊息規則腳本，不產生空 DOM 拋錯
      expect((window as unknown as { __formRuns?: number }).__formRuns).toBeUndefined()
      expect(document.querySelector('[data-chat="sdk-debug"]')).toBeNull()

      s.handle({
        type: 'messages',
        messages: [{
          id: 'g1',
          role: 'ai',
          content: '开场白',
          serverId: '1',
          state: 'done',
          ...(useHostView ? { view: { name: '露娜', html: formHtml, finished: true } } : {}),
        }],
      })
      await nextTick()

      expect((window as unknown as { __formRuns?: number }).__formRuns).toBe(1)
      expect(document.querySelector('[data-chat="sdk-debug"]')).toBeNull()
      expect(document.getElementById('preview')!.textContent).toBe('【姓名】（未填）\n【发色】黑')

      // 分頁點擊切換
      ;(document.getElementById('tab-2') as HTMLElement).click()
      expect(document.getElementById('tab-2')!.classList.contains('is-active')).toBe(true)
      expect(document.getElementById('panel-2')!.hasAttribute('hidden')).toBe(false)
      expect(document.getElementById('panel-1')!.hasAttribute('hidden')).toBe(true)

      // 表單輸入與下拉更新預覽
      const fName = document.getElementById('f-name') as HTMLInputElement
      fName.value = '測試主角'
      fName.dispatchEvent(new Event('input', { bubbles: true }))
      expect(document.getElementById('preview')!.textContent).toBe('【姓名】測試主角\n【发色】黑')

      // 複製按鈕點擊只觸發一次 execCommand('copy')
      ;(document.getElementById('btn-copy') as HTMLElement).click()
      expect(copied).toEqual(['copy'])
      expect(document.getElementById('btn-copy')!.textContent).toBe('已复制 ✓')

      // 後續新訊息帶相同腳本不再重複執行，事件不重複綁定
      s.handle({
        type: 'message.new',
        message: {
          id: 'g2',
          role: 'ai',
          content: '开场白',
          serverId: '2',
          state: 'done',
          ...(useHostView ? { view: { name: '露娜', html: formHtml, finished: true } } : {}),
        },
      })
      await nextTick()
      expect((window as unknown as { __formRuns?: number }).__formRuns).toBe(1)
      ;(document.getElementById('btn-copy') as HTMLElement).click()
      expect(copied).toEqual(['copy', 'copy'])
    } finally {
      document.execCommand = origExecCommand
    }
  })

  it.each([true, false])('卡 100743 同構：功能欄（statusbar）命中的規則腳本在 hello 執行一次，與開場白重複的大型流內表單不可見，保留緊湊頂部狀態列（卡 100377）（宿主 view=%s）', async (useHostView) => {
    delete (window as unknown as Record<string, unknown>).__hudRuns
    delete (window as unknown as Record<string, unknown>).__hudClicks
    const sidebarHtml = `<div class="hunter-sidebar" style="position:fixed;left:0;top:50%"><button type="button" id="hud-toggle">面板</button></div><script>(function(){
      window.__hudRuns = (window.__hudRuns || 0) + 1;
      window.__hudClicks = window.__hudClicks || 0;
      var btn = document.getElementById('hud-toggle');
      if (btn) btn.addEventListener('click', function(){ window.__hudClicks++; });
    })();</script>`
    const formHtml = `<div class="hunter-creation-ui" style="position:relative"><h2>獵人檔案</h2><input id="h-name" value="小傑"><select id="h-type"><option>強化系</option></select><button type="button">隨機</button><button type="button">確認</button></div>`
    const residueHtml = `<div class="hxh-box"><span class="hxh-lbl">([\\s\\S]+?)</span><div class="hxh-bubble">([\\s\\S]*?)</div></div>`
    const compactHudHtml = `<div class="top-hud" style="height:44px">HP 100 / MP 50</div>`
    const s = boot(config({
      card: {
        rules: [
          { id: 1, name: '侧边栏', find: '《侧边栏》', replace: sidebarHtml, enabled: true },
          { id: 2, name: '建角面板', find: '《建角面板》', replace: formHtml, enabled: true },
          { id: 3, name: '范例残字', find: '《范例残字》', replace: residueHtml, enabled: true },
          { id: 4, name: '紧凑状态列', find: '《紧凑状态列》', replace: compactHudHtml, enabled: true },
        ],
        statusbar: '《侧边栏》《建角面板》《范例残字》《紧凑状态列》',
        ...(useHostView ? { statusbarHtml: sidebarHtml + formHtml + residueHtml + compactHudHtml } : {}),
      },
    }))
    // hello 階段功能欄已掛載，腳本跑成功 1 次
    expect((window as unknown as { __hudRuns?: number }).__hudRuns).toBe(1)

    // 開場白訊息同樣含《建角面板》（如卡 100743），氣泡掛載後同一段 script 不重跑
    s.handle({
      type: 'messages',
      messages: [{
        id: 'g1',
        role: 'ai',
        content: '《侧边栏》《建角面板》',
        serverId: '1',
        state: 'done',
        ...(useHostView ? { view: { name: '露娜', html: sidebarHtml + formHtml, finished: true } } : {}),
      }],
    })
    await nextTick()
    expect((window as unknown as { __hudRuns?: number }).__hudRuns).toBe(1)
    ;(document.getElementById('hud-toggle') as HTMLElement).click()
    expect((window as unknown as { __hudClicks?: number }).__hudClicks).toBe(1)

    // 功能欄內與開場白重複的大型流內表單（.hunter-creation-ui）及正則殘字（.hxh-box）不可見
    const sbForm = s.refs.statusbar!.querySelector('.hunter-creation-ui') as HTMLElement
    const sbResidue = s.refs.statusbar!.querySelector('.hxh-box') as HTMLElement
    const sbSidebar = s.refs.statusbar!.querySelector('.hunter-sidebar') as HTMLElement
    const sbCompactHud = s.refs.statusbar!.querySelector('.top-hud') as HTMLElement
    const msgForm = s.refs.list.querySelector('.hunter-creation-ui') as HTMLElement
    expect(sbForm.hidden).toBe(true)
    expect(window.getComputedStyle(sbForm).display).toBe('none')
    expect(sbResidue.hidden).toBe(true)
    expect(window.getComputedStyle(sbResidue).display).toBe('none')
    // 功能欄內的 fixed 側欄與卡 100377 型緊湊頂部狀態列保留可見，開場白訊息內的表單也正常可見
    expect(sbSidebar.hidden).toBe(false)
    expect(window.getComputedStyle(sbSidebar).display).not.toBe('none')
    expect(sbCompactHud.hidden).toBe(false)
    expect(window.getComputedStyle(sbCompactHud).display).not.toBe('none')
    expect(msgForm.hidden).toBe(false)
    expect(window.getComputedStyle(msgForm).display).not.toBe('none')
  })

  it.each([true, false])('sdk.on(messages) 卡：含 sdk 訂閱的規則腳本在 hello 跑一次，氣泡掛載後不重跑、不重複綁事件（宿主 view=%s）', async (useHostView) => {
    delete (window as unknown as Record<string, unknown>).__sdkScriptRuns
    delete (window as unknown as Record<string, unknown>).__sdkDoneEvents
    const sdkRuleHtml = `<div class="sdk-card">狀態</div><script>
      window.__sdkScriptRuns = (window.__sdkScriptRuns || 0) + 1;
      window.__sdkDoneEvents = window.__sdkDoneEvents || [];
      sdk.on('message:done', function(p){ window.__sdkDoneEvents.push(p.id); });
    </script>`
    const s = boot(config({
      card: {
        rules: [{ id: 1, name: 'sdk-rule', find: '开场白', replace: sdkRuleHtml, enabled: true }],
        statusbar: '',
      },
    }))
    expect((window as unknown as { __sdkScriptRuns?: number }).__sdkScriptRuns).toBe(1)

    s.handle({
      type: 'messages',
      messages: [{
        id: 'm1',
        role: 'ai',
        content: '开场白',
        serverId: '1',
        state: 'done',
        ...(useHostView ? { view: { name: '露娜', html: sdkRuleHtml, finished: true } } : {}),
      }],
    })
    await nextTick()
    expect((window as unknown as { __sdkScriptRuns?: number }).__sdkScriptRuns).toBe(1)
    expect((window as unknown as { __sdkDoneEvents?: string[] }).__sdkDoneEvents).toEqual(['m1'])

    s.handle({
      type: 'message.new',
      message: {
        id: 'm2',
        role: 'ai',
        content: '开场白',
        serverId: '2',
        state: 'done',
        ...(useHostView ? { view: { name: '露娜', html: sdkRuleHtml, finished: true } } : {}),
      },
    })
    s.handle({
      type: 'message.done',
      id: 'm2',
      content: '开场白',
      serverId: '2',
      ...(useHostView ? { view: { name: '露娜', html: sdkRuleHtml, finished: true } } : {}),
    })
    await nextTick()
    expect((window as unknown as { __sdkScriptRuns?: number }).__sdkScriptRuns).toBe(1)
    expect((window as unknown as { __sdkDoneEvents?: string[] }).__sdkDoneEvents).toEqual(['m1', 'm2'])
  })

  it.each([true, false])('卡 100737 自然掛載：sandbox-zh.js 非同步載完觸發 rerenderAll 後，表單預覽與 Tab 切換仍有效（宿主 view=%s）', async (useHostView) => {
    const formHtml = `
      <head><style>.form-wrap{color:#e9eefc}</style></head>
      <div class="form-wrap">
        <div role="tablist">
          <button type="button" class="tab is-active" id="tab-1" data-tab="panel-1" value="panel-1">基本</button>
          <button type="button" class="tab" id="tab-2" data-tab="panel-2" value="panel-2">外貌</button>
        </div>
        <div class="panel" id="panel-1"><input id="f-name" type="text" /><input id="f-age" type="number" value="22" /></div>
        <div class="panel" id="panel-2" hidden><select id="f-hair"><option value="黑">黑</option><option value="銀">銀</option></select></div>
        <pre id="preview"></pre>
        <button type="button" id="btn-copy">一键复制</button>
      </div>
      <script>(function(){
        var tabs = Array.from(document.querySelectorAll('.tab'));
        var panels = Array.from(document.querySelectorAll('.panel'));
        tabs.forEach(function(t){
          t.addEventListener('click', function(){
            var id = t.getAttribute('data-tab') || t.getAttribute('value');
            tabs.forEach(function(b){ b.classList.toggle('is-active', b === t); });
            panels.forEach(function(p){ if (p.id === id) p.removeAttribute('hidden'); else p.setAttribute('hidden', ''); });
          });
        });
        var fName = document.getElementById('f-name');
        var fAge = document.getElementById('f-age');
        var preview = document.getElementById('preview');
        function build(){
          preview.textContent = (fName.value.trim() ? '【姓名】' + fName.value.trim() + '\\n' : '') + '【年龄】' + fAge.value;
        }
        [fName, fAge].forEach(function(el){
          el.addEventListener('input', build);
          el.addEventListener('change', build);
        });
        build();
      })();</script>
    `
    let resolveDisplayScript!: (fn: ((t: string) => string) | null) => void
    const displayScriptPromise = new Promise<((t: string) => string) | null>((r) => { resolveDisplayScript = r })
    document.body.innerHTML = '<div id="app"></div>'
    shell?.dispose()
    sent = []
    shell = createShell({
      doc: document,
      win: window as Window & typeof globalThis,
      mount: document.getElementById('app')!,
      config: config({
        locale: 'zh-Hant',
        cardLanguage: '',
        card: {
          rules: [{ id: '100737-rule', name: '开场白', find: '开场白', replace: formHtml, enabled: true }],
          statusbar: '',
        },
      }),
      transport: { send: (m) => sent.push(m) },
      displayScript: () => displayScriptPromise,
    })

    // 1. messages 先到（模擬 /play/497372 冷啟動）
    shell.handle({
      type: 'messages',
      messages: [{
        id: 'greeting',
        role: 'ai',
        content: '开场白',
        serverId: null,
        state: 'done',
        ...(useHostView ? { view: { name: '露娜', html: formHtml, finished: true } } : {}),
      }],
    })
    await nextTick()

    // 2. 4ms 後 sandbox-zh.js 載入完成，觸發 displayScript 回呼與 rerenderAll
    resolveDisplayScript((t) => t)
    await displayScriptPromise
    await nextTick()

    const preview = shell.refs.list.querySelector('#preview') as HTMLElement
    expect(preview).not.toBeNull()
    expect(preview.textContent!.length).toBeGreaterThan(0)
    expect(preview.textContent).toContain('【年龄】22')

    const tab2 = shell.refs.list.querySelector('#tab-2') as HTMLButtonElement
    tab2.click()
    expect(tab2.classList.contains('is-active')).toBe(true)

    const tab1 = shell.refs.list.querySelector('#tab-1') as HTMLButtonElement
    tab1.click()
    const fName = shell.refs.list.querySelector('#f-name') as HTMLInputElement
    fName.value = 'QA自然輸入'
    fName.dispatchEvent(new Event('input', { bubbles: true }))
    expect(preview.textContent).toContain('【姓名】QA自然輸入')
  })
})

// AI 風月卡的首屏網頁：訊息列最上方的作者網頁，在自己的無同源 iframe 裡；填入與送出交給宿主決定。
describe('殼：首屏網頁', () => {
  it.each(['fengyue', 'native'])('展開 %s 開場巨集，晚到的人設稱呼更新，原始資產不變', (format) => {
    const html = '<p>{{ USER }} / {{char}}</p>'
    const cfg = config({ card: { rules: [], statusbar: '', format, openingPage: html } })
    const s = boot(cfg)
    const frame = s.refs.messages.querySelector('[data-slot="opening"] iframe') as HTMLIFrameElement
    expect(frame.srcdoc).toContain('"user":"小明","char":"露娜"')
    const before = frame.srcdoc
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    s.handle({ type: 'user', nickname: '人設暱稱' })
    expect(post).toHaveBeenCalledWith({ type: 'hearthroom:opening-macros', macros: { user: '人設暱稱', char: '露娜' } }, '*')
    expect(frame.srcdoc).toBe(before)
    expect(cfg.card.openingPage).toBe(html)
  })

  it('有首屏網頁就畫在訊息列之前，頁面送來的填入／送出原樣轉給宿主', () => {
    const s = boot(config({ card: { rules: [], statusbar: '', format: 'fengyue', openingPage: '<p>TEST-INTRO</p>' } }))
    const slot = s.refs.messages.querySelector('[data-slot="opening"]') as HTMLElement
    expect(slot).not.toBeNull()
    expect(slot.nextElementSibling).toBe(s.refs.list)
    const frame = slot.querySelector('iframe') as HTMLIFrameElement
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(frame.srcdoc).toContain('<p>TEST-INTRO</p>')
    sent = []
    const post = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data, source: frame.contentWindow as Window }))
    post({ type: 'hearthroom:opening', kind: 'fill', text: '身分：旅人' })
    expect(sent).toContainEqual({ type: 'ui', event: 'opening-fill', key: '身分：旅人' })
  })

  it('沒有首屏網頁就不畫', () => {
    const s = boot(config())
    expect(s.refs.messages.querySelector('[data-slot="opening"]')).toBeNull()
  })

  it('玩家還沒送出第一句時展開；送出第一句後收起，開新對話再展開', () => {
    const s = boot(config({ card: { rules: [], statusbar: '', format: 'fengyue', openingPage: '<p>TEST-INTRO</p>' } }))
    const slot = s.refs.messages.querySelector('[data-slot="opening"]') as HTMLElement
    expect(slot.hidden).toBe(false)

    s.handle({ type: 'messages', messages: [{ id: 'g0', role: 'ai', content: '開場', serverId: 's0', state: 'done' }] })
    expect(slot.hidden).toBe(false)

    s.handle({ type: 'message.new', message: { id: 'u1', role: 'user', content: '第一句', serverId: 's1', state: 'done' } })
    expect(slot.hidden).toBe(true)

    s.handle({ type: 'message.remove', id: 'u1' })
    expect(slot.hidden).toBe(false)

    s.handle({ type: 'messages', messages: [{ id: 'u2', role: 'user', content: '已送過的歷史', serverId: 's2', state: 'done' }] })
    expect(slot.hidden).toBe(true)

    s.handle({ type: 'conversation.switch', conversationId: 'c-new' })
    expect(slot.hidden).toBe(false)
  })
})

describe('殼：MMD／酒館找輸入框與直接設 .value 相容性', () => {
  it('standard chrome 下常見選擇器都找得到同一顆 textarea，且直接設 ta.value（不 dispatch input）也會同步 sdk.input 與宿主', async () => {
    const header = { roleName: 'Example', avatar: '', badge: '', backLabel: 'Back' }
    const composer = { placeholder: '說點什麼', sendState: 'send', generating: false, enterSends: true, shortcuts: [], moreOpen: false, moreItems: [], modelScore: '', assistBusy: false, assistCost: '', labels: { stop: 'Stop', more: 'More', send: 'Send', paste: 'Paste', clear: 'Clear', model: 'Model', assist: 'Assist', perTurn: 'Per turn' } }
    const s = boot(config({ chromeState: { header, composer }, card: { rules: [], statusbar: '' } }))
    await nextTick()
    const selectors = [
      '#send_textarea',
      'textarea.uni-textarea-textarea',
      '.chatMsgTextarea textarea',
      '.chat-input-scope textarea',
      '.composer textarea',
      '.chat-input textarea',
      '[data-chat="composer"] textarea',
      '[data-chat="input"]',
      '#moonstage-input textarea.uni-textarea-textarea',
    ]
    const ta = s.refs.composer.querySelector('#send_textarea') as HTMLTextAreaElement
    expect(ta).toBeTruthy()
    for (const sel of selectors) {
      expect(s.refs.root.querySelector(sel), `${sel} 應命中輸入框`).toBe(ta)
    }
    sent = []
    ta.value = 'Synthetic opening'
    await nextTick()
    expect(s.sdk.input.get()).toBe('Synthetic opening')
    expect(sent.filter((m) => m.type === 'input')).toEqual([{ type: 'input', value: 'Synthetic opening' }])

    // 同一同步 tick 內設 ta.value 又呼叫 sdk.input.clear()，DOM 與 sdk.input 都立即歸零，再設同字串不會被攔
    ta.value = 'Same draft'
    s.sdk.input.clear()
    expect(ta.value).toBe('')
    expect(s.sdk.input.get()).toBe('')
    ta.value = 'Same draft'
    expect(s.sdk.input.get()).toBe('Same draft')
  })

  it('shell 陽春 chrome 下 #send_textarea／.uni-textarea-textarea／#send_but 也對齊，且直接設 .value 會同步 sdk.input 與宿主', () => {
    const s = boot(config())
    expect(s.refs.root.querySelector('#send_textarea')).toBe(s.refs.input)
    expect(s.refs.root.querySelector('textarea.uni-textarea-textarea')).toBe(s.refs.input)
    expect(s.refs.root.querySelector('#send_but')).toBe(s.refs.send)
    sent = []
    s.refs.input.value = '直接寫進陽春殼'
    expect(s.sdk.input.get()).toBe('直接寫進陽春殼')
    expect(sent.filter((m) => m.type === 'input')).toEqual([{ type: 'input', value: '直接寫進陽春殼' }])
  })
})

// MMD 的正文盒模型還原只給 MMD 卡（同一般頁）；深淺標記 data-lt-theme 兩頁共用（風月寫法的 .dark 對到這裡）。
describe('殼：格式標記與深淺標記', () => {
  it('只有 MMD 卡的根掛 lt-format-mmd', () => {
    expect(boot(config({ card: { rules: [], statusbar: '', format: 'mmd' } })).refs.root.classList.contains('lt-format-mmd')).toBe(true)
    expect(boot(config({ card: { rules: [], statusbar: '', format: 'fengyue' } })).refs.root.classList.contains('lt-format-mmd')).toBe(false)
    expect(boot(config({ card: { rules: [], statusbar: '', format: 'tavern' } })).refs.root.classList.contains('lt-format-mmd')).toBe(false)
  })

  it('data-lt-theme 跟著宿主切深淺', () => {
    const s = boot(config({ card: { rules: [], statusbar: '', format: 'fengyue' } }))
    const before = s.refs.root.getAttribute('data-lt-theme')
    expect(before).toBe(s.refs.root.getAttribute('data-theme'))
    s.handle({ type: 'theme', theme: before === 'dark' ? 'light' : 'dark', vars: {} } as any)
    expect(s.refs.root.getAttribute('data-lt-theme')).toBe(before === 'dark' ? 'light' : 'dark')
  })

  it('風月寫法的規則：樣式轉到我們的節點並包進自己的層', () => {
    const s = boot(config({ card: { rules: [{ id: 'fy', name: 'fy', find: '/([\\s\\S])$/', replace: '$1<style>#ai-chat-input{background:#fff}</style>', enabled: true, cssDialect: 'fengyue' }], statusbar: '', format: 'mmd' } }))
    const css = s.refs.authorCss.textContent || ''
    expect(css).toContain('@layer lt-author-fengyue')
    expect(css).toContain(':where(.composer-field):not(#lt-fy)')
    expect(css).not.toContain('#ai-chat-input')
  })
})
