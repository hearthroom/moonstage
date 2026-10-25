/**
 * 畫布的分享情境：沙箱卡（sdk.share，經沙箱宿主橋）與一般卡（window.stage.share）讀的是同一份值。
 * 值全由宿主給（StageHost.share）：舞台不讀網址列，也不知道這張卡在宿主站上的網址與玩家的推薦碼。
 * 看自己的紀錄時不帶朋友的情境碼與回流的投票——那不是從分享連結開的一局；連結照給。
 */
import type { StageHost } from '@/host/stage-host'
import { shareLinkOf, shareStateOf, type ShareQr, type ShareState } from '@/common/share-context'
import type { SandboxShareHost } from './canvas-sandbox-host'

export interface CanvasShareDeps {
  host: StageHost['share']
  roleId(): string
  historyMode(): boolean
}

export interface CanvasShare {
  state(): ShareState | null
  /** 給沙箱宿主橋；宿主沒接是 null（殼回 HOST_DENIED）。 */
  sandbox(): SandboxShareHost | null
  /** 給意圖 API（window.stage）的宿主轉接。 */
  intentHost(): { shareState(): ShareState | Record<string, never>; shareLink(context?: unknown): string | null; shareQr?: (text: string) => Promise<ShareQr> }
  /** 宿主的值變了（推薦碼晚到）。回傳取消訂閱。 */
  onChange(fn: () => void): () => void
}

export function createCanvasShare(deps: CanvasShareDeps): CanvasShare {
  const state = (): ShareState | null => {
    const target = deps.roleId()
    if (!target || !deps.host) return null
    const s = shareStateOf(deps.host.read(target))
    if (!s || !deps.historyMode()) return s
    const { poll: _poll, ...rest } = s
    return { ...rest, context: null }
  }
  const qr = deps.host?.qr ? (text: string) => deps.host!.qr!(text) : undefined
  return {
    state,
    sandbox: () => (deps.host ? { read: state, ...(qr ? { qr } : {}) } : null),
    intentHost: () => ({
      shareState: () => state() ?? {},
      shareLink: (context) => { const r = shareLinkOf(state(), context); return r.ok ? r.url : null },
      ...(qr ? { shareQr: qr } : {}),
    }),
    onChange: (fn) => (deps.host?.onChange ? deps.host.onChange(fn) : () => {}),
  }
}
