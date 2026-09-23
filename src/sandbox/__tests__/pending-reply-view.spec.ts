// @vitest-environment jsdom
/**
 * 沙箱卡同樣要看得到「回覆還沒來」：宿主把整理劇情中／正在回覆的標籤與等候提示放在 view 裡，
 * 殼用同一個訊息元件畫；階段換了（整理完 → 正在回覆）宿主送 message.view，殼就地換上。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { createShell, type Shell } from '../shell'
import type { SandboxHelloConfig } from '../protocol'

const config = (): SandboxHelloConfig => ({
  theme: 'dark',
  locale: 'zh-Hant',
  role: { name: '露娜', avatarUrl: '' },
  user: { nickname: '小明', avatarUrl: '' },
  card: { rules: [], statusbar: '' },
  capabilities: { saves: false, edit: false, send: true },
  composer: true,
})

let shell: Shell | null = null
afterEach(() => { shell?.dispose(); shell = null; delete (window as unknown as Record<string, unknown>).sdk })

describe('沙箱殼：等回覆的那一列', () => {
  it('整理劇情中的標籤照宿主的 view 畫；換成正在回覆後出現延遲浮現的提示', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    shell = createShell({ doc: document, win: window as Window & typeof globalThis, mount: document.getElementById('app')!, config: config(), transport: { send: () => {} } })
    const s = shell
    s.handle({ type: 'messages', messages: [] })
    s.handle({ type: 'message.new', message: { id: 'l1', role: 'user', content: '1', serverId: null } })
    s.handle({ type: 'message.new', message: { id: 'l2', role: 'ai', content: '', serverId: null, view: { role: 'ai', html: '', loading: true, loadingLabel: '整理劇情中…', waitingHint: '', slowHint: '' } } })
    const body = () => s.refs.list.querySelectorAll('[data-chat="message-body"]')[1] as HTMLElement
    expect(body().querySelector('.chat-typing-indicator')?.textContent).toContain('整理劇情中…')
    expect(body().querySelector('.lt-waiting-hint')).toBeNull()

    s.handle({ type: 'message.view', id: 'l2', view: { role: 'ai', html: '', loading: true, loadingLabel: '正在回覆', waitingHint: '', slowHint: '模型回應較慢，請耐心等待...' } })
    await nextTick()
    expect(body().querySelector('.chat-typing-indicator')?.textContent).toContain('正在回覆')
    expect(body().querySelector('.lt-waiting-hint.is-delayed')?.textContent).toContain('模型回應較慢')
  })
})
