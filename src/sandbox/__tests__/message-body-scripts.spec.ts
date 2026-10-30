// @vitest-environment jsdom
/**
 * 宿主送來的正文 html 帶著 <script>：腳本照樣跑一次，但 <script> 元素不留在氣泡裡。
 *
 * 2026-10-31 作者回報（Fate 卡）：開場白在 MMD 正常，我們這裡整段開場不見，只剩一張「可选 4」選項卡、
 * 四格只有引號。開場白是一串規則名，規則把它換成上百段 <script>；宿主的渲染管線把這些 <script>
 * 原樣留在 html 裡，殼掛上之後它們就成了氣泡裡的文字節點。作者的選項解析走整個氣泡的文字，
 * 讀到「幫助」腳本原始碼裡的 [选项] 範例，當成選項畫出來，再把那段連同開場正文一起刪掉。
 * 殼自己渲染時規則裡的 <script> 在裝卡時就抽走了，正文本來就沒有；宿主那條路要一樣。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createShell, type Shell } from '../shell'
import type { SandboxHelloConfig, ShellToHost } from '../protocol'

function config(): SandboxHelloConfig {
  return {
    theme: 'dark',
    locale: 'zh-Hans',
    role: { name: '示範角色', avatarUrl: '' },
    user: { nickname: '小明', avatarUrl: '' },
    card: { rules: [], statusbar: '' },
    capabilities: { saves: false, edit: false, send: true },
    composer: true,
  }
}

let shell: Shell | null = null
const sent: ShellToHost[] = []
const boot = () => {
  document.body.innerHTML = '<div id="app"></div>'
  shell = createShell({ doc: document, win: window as Window & typeof globalThis, mount: document.getElementById('app')!, config: config(), transport: { send: (m) => sent.push(m) } })
  return shell
}
const w = window as unknown as { __ran?: number }
afterEach(() => { shell?.dispose(); shell = null; delete w.__ran; delete (window as unknown as Record<string, unknown>).sdk })

const HELP = "<script>window.__ran = (window.__ran || 0) + 1; var demo = ['[选项]', '追问|act=ask', '[/选项]'];</script>"
const html = `<p>宣告——</p>${HELP}<p>天秤的守护者啊——！</p>`

const bodyOf = (s: Shell) => s.refs.list.querySelector('[data-chat="message-body"]') as HTMLElement

describe('宿主正文裡的 <script>', () => {
  it('開場白：腳本跑一次，氣泡裡沒有 <script>、也讀不到腳本原文', () => {
    const s = boot()
    s.handle({ type: 'messages', messages: [{ id: 'greeting', role: 'ai', content: 'fh-top-js', serverId: null, state: 'done', view: { html, finished: true } }] })
    const body = bodyOf(s)
    expect(body.querySelectorAll('script').length).toBe(0)
    expect(body.textContent).not.toContain('[选项]')
    expect(body.textContent).toContain('宣告——')
    expect(body.textContent).toContain('天秤的守护者啊——！')
    expect(w.__ran).toBe(1)
  })

  it('串流到定稿：定稿的 html 帶腳本，掛上後一樣沒有 <script>，腳本只跑一次', () => {
    const s = boot()
    s.handle({ type: 'messages', messages: [] })
    s.handle({ type: 'message.new', message: { id: 'a1', role: 'ai', content: '', serverId: null, state: 'streaming', view: { html: '', loading: true } } })
    s.handle({ type: 'message.stream', id: 'a1', content: 'fh', view: { html: '<p>宣告——</p>' } })
    s.handle({ type: 'message.done', id: 'a1', content: 'fh-top-js', serverId: '9', view: { html, finished: true } })
    s.handle({ type: 'message.view', id: 'a1', view: { html, finished: true, name: '示範角色' } })
    const body = bodyOf(s)
    expect(body.querySelectorAll('script').length).toBe(0)
    expect(body.textContent).not.toContain('[选项]')
    expect(body.textContent).toContain('天秤的守护者啊——！')
    expect(w.__ran).toBe(1)
  })
})
