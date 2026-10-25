/**
 * 分享情境：卡片腳本產生一條帶「情境碼」的分享連結，朋友從那條連結開卡時腳本讀得到同一個碼
 * （「你朋友選了 X，換你」）。平台只把碼原樣送到，碼代表什麼由卡片自己解讀。
 * 設計見 docs/studio/tasks/2026-10-25-card-share-context/design.md（monorepo docs）。
 *
 * 為什麼只收這幾個字：碼是陌生人能手打進網址的輸入，不是 AI 輸出。不收空白、<>、&、引號、%，
 * 卡片把它當文字放進畫面永遠不會變成標籤，也不必網址編碼。開頭的 ~ 留給平台將來的短碼
 * （回流統計要先有連結身分），卡片自己的碼不能用。
 *
 * 沙箱殼與一般卡（window.stage）共用這一份：兩邊的語意要一樣，差別只在錯誤怎麼表達。
 */

export const SHARE_CONTEXT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
/** 網址上帶情境碼的參數名。 */
export const SHARE_PARAM = 'share'
/** sdk.share.qr 收的字數上限：QR 太長就密到掃不出來，分享連結遠短於此。 */
export const SHARE_QR_MAX_CHARS = 1024

export type ShareAudience = 'author' | 'link' | 'public'

export interface ShareState {
  /** 平台的總開關與這個宿主都允許。關著時 context 恆為 null，link() 回不帶情境的一般連結。 */
  enabled: boolean
  /** 這次開卡帶進來的情境碼（已驗格式）；沒有就 null。 */
  context: string | null
  /** 這張卡的一般分享連結（含分享者的推薦碼）；宿主給不出來是空字串。 */
  url: string
  /** 現在誰打得開這張卡：只有作者／有連結的人／所有人。宿主不知道是 null。 */
  audience: ShareAudience | null
  /**
   * 從平台短碼的分享回流連結開卡時，朋友可以回答的那一題（sdk.share.respond）；不是就沒有這個欄位。
   * 短碼本身留在宿主，卡片看不到，也就看不到分享者是誰。
   */
  poll?: SharePoll
}

export interface SharePoll { key: string; options: string[] }
/** 每個投票最多幾個選項（跟作者宣告的上限一樣）。 */
export const SHARE_POLL_MAX_OPTIONS = 12

export interface ShareQr {
  /** 每邊幾格。 */
  size: number
  /** 黑格的 SVG path（viewBox 0 0 size size），跟站上分享面板的 QR 同一套畫法。 */
  path: string
}

export function shareContextOf(raw: unknown): string | null {
  return typeof raw === 'string' && SHARE_CONTEXT_RE.test(raw) ? raw : null
}

const AUDIENCES: readonly ShareAudience[] = ['author', 'link', 'public']

function sharePollOf(raw: unknown): SharePoll | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as { key?: unknown; options?: unknown }
  const key = shareContextOf(p.key)
  const options = Array.isArray(p.options) ? p.options.filter((o): o is string => shareContextOf(o) !== null).slice(0, SHARE_POLL_MAX_OPTIONS) : []
  return key && options.length ? { key, options } : null
}

/** 宿主給的狀態只收形狀對的；壞的欄位當沒有。關著時情境碼一律拿掉。 */
export function shareStateOf(raw: unknown): ShareState | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<Record<keyof ShareState, unknown>>
  const enabled = s.enabled === true
  const poll = enabled ? sharePollOf(s.poll) : null
  return {
    enabled,
    context: enabled ? shareContextOf(s.context) : null,
    url: typeof s.url === 'string' && /^https?:\/\//.test(s.url) ? s.url : '',
    audience: AUDIENCES.includes(s.audience as ShareAudience) ? (s.audience as ShareAudience) : null,
    ...(poll ? { poll } : {}),
  }
}

export type ShareLinkResult = { ok: true; url: string } | { ok: false; code: 'invalid' | 'unavailable' }

/**
 * 組分享連結：在一般連結上加（或換掉）share 參數，其他參數（推薦碼）原樣留著。
 * 沒給情境就是一般連結；開關關著時情境不帶，但連結照給——卡片的分享鈕照常能用。
 */
export function shareLinkOf(state: ShareState | null, context?: unknown): ShareLinkResult {
  if (context != null && shareContextOf(context) === null) return { ok: false, code: 'invalid' }
  if (!state || !state.url) return { ok: false, code: 'unavailable' }
  const url = new URL(state.url)
  url.searchParams.delete(SHARE_PARAM)
  if (context != null && state.enabled) url.searchParams.set(SHARE_PARAM, String(context))
  return { ok: true, url: url.href }
}
