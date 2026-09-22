/**
 * 殼的進入點：postMessage 握手 → createShell。
 *
 * 安全邊界：
 *   - 殼先對 parent 喊 `ready-shell`（沒有敏感內容，targetOrigin '*'）。
 *   - 第一則 `hello` 必須來自 `window.parent`；它的 origin 從此釘死，之後的訊息 origin 不符
 *     一律丟掉，殼送出去的訊息也只送給這個 origin。
 *   - 這裡不 import 任何宿主模組（請求層、oauth、store…）；build 後由 check-sandbox-boundary 掃。
 */
import { envelope, isSandboxEnvelope, targetOriginFor, type HostToShell, type ShellToHost } from './protocol'
import { createShell, type Shell } from './shell'
import './shell.css'

export function bootSandbox(win: Window & typeof globalThis = window) {
  const doc = win.document
  const mount = doc.getElementById('app') || doc.body
  let hostOrigin: string | null = null
  let shell: Shell | null = null

  const post = (message: ShellToHost) => {
    if (win.parent === win) return
    win.parent.postMessage(envelope(message), targetOriginFor(hostOrigin || ''))
  }

  win.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== win.parent) return
    if (!isSandboxEnvelope(event.data)) return
    const message = event.data as unknown as HostToShell
    if (!shell) {
      if (message.type !== 'hello') return
      hostOrigin = event.origin
      shell = createShell({
        doc,
        win,
        mount,
        config: message.config,
        transport: { send: post },
        debugFromUrl: /[?&]sdkDebug=1\b/.test(win.location.search),
      })
      mount.setAttribute('data-sandbox', 'ready')
      return
    }
    if (event.origin !== hostOrigin) return
    shell.handle(message)
  })

  win.addEventListener('unhandledrejection', (event) => {
    post({ type: 'debug', level: 'error', args: ['unhandled rejection', String((event as PromiseRejectionEvent).reason)] })
  })

  // 視窗高度只聽宿主的 viewport 訊息，殼不再自己量 iframe 的 visualViewport：
  // iOS Safari 鍵盤一彈，iframe 裡的 visualViewport 也跟著縮，殼把根縮短之後，Safari 又把視覺視窗
  // 往上平移去露出輸入框，玩家看到的是根以下整片空白（owner 2026-09-22 iOS 截圖）。
  // 一般模式宿主送的是 iframe 的整高（根 = 100%），全螢幕才送鍵盤上方的高度。

  // 握手：殼喊 ready-shell，宿主回 hello。殼可能比宿主的 load 監聽先跑完（快取命中時常見），
  // 一喊就沒了會白白等到宿主逾時，所以每 500ms 重喊一次直到 hello 到，最多 10 秒。
  post({ type: 'ready-shell' })
  mount.setAttribute('data-sandbox', 'waiting-for-host')
  const startedAt = Date.now()
  const retry = win.setInterval(() => {
    if (shell || Date.now() - startedAt > 10_000) { win.clearInterval(retry); return }
    post({ type: 'ready-shell' })
  }, 500)
}

if (typeof window !== 'undefined' && !(window as unknown as { __MS_SANDBOX_TEST__?: boolean }).__MS_SANDBOX_TEST__) {
  bootSandbox(window)
}
