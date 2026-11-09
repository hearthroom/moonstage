/**
 * 首屏網頁：開新對話時顯示在畫布最上方的作者網頁（AI 風月的「詳細介紹」）。
 *
 * 只給看的人看，不送模型——資料放在作者資產（openingPage），伺服器組提示詞與整理記憶都不讀它。
 *
 * 怎麼放：無同源的 srcdoc iframe，跟風月一樣（sandbox 只給 allow-scripts allow-forms allow-pointer-lock）。
 * 不直接塞進畫布或沙箱殼：這些頁面是寫給獨立文件的，`body{}`、`*{}` 重設與 `html{height:100%}`
 * 放進來會改掉整頁的樣式。底色固定是淺色紙：風月的聊天頁是淺色，作者照淺底配色，跟著我們的深色走字會看不見。
 *
 * 頁面能做的事只有三件，都經 postMessage 告訴外層：
 *   - 回報自己的高度（外層據此撐開 iframe，頁面不出捲軸）
 *   - `hearthroom.fill(text)`：把一句話填進玩家的輸入框
 *   - `hearthroom.send(text)`：把一句話當玩家的第一句送出（外層只在玩家剛點過時照做，否則改成填入）
 * 風月的開局生成器是「拼好文字、複製到剪貼簿、讓玩家貼上」：頁面寫進剪貼簿的那段字也一併填進輸入框，
 * 玩家不必再貼一次。
 */

export const OPENING_MESSAGE_TYPE = 'hearthroom:opening'
/** 一次填入／送出的字數上限，避免頁面把整份文件塞進輸入框。 */
export const OPENING_TEXT_MAX = 8000
const HEIGHT_MAX = 20000

export type OpeningMessage =
  | { kind: 'height'; height: number }
  | { kind: 'fill'; text: string }
  | { kind: 'send'; text: string }

export const OPENING_SANDBOX = 'allow-scripts allow-forms allow-pointer-lock'
export const OPENING_ALLOW = 'clipboard-write; autoplay'

// 頁面裡跑的那段小腳本。放在作者內容之前：作者腳本一開始就叫得到 hearthroom.*，
// 而剪貼簿的攔截要在作者拿到 navigator.clipboard 之前裝好。
export const OPENING_BOOTSTRAP = `(function(){
var T=${JSON.stringify(OPENING_MESSAGE_TYPE)},M=${OPENING_TEXT_MAX};
function post(m){m.type=T;try{parent.postMessage(m,'*')}catch(e){}}
function clip(t){t=t==null?'':String(t);return t.trim()?t.slice(0,M):''}
var api={fill:function(t){t=clip(t);if(t)post({kind:'fill',text:t})},send:function(t){t=clip(t);if(t)post({kind:'send',text:t})}};
try{Object.defineProperty(window,'hearthroom',{value:Object.freeze(api)})}catch(e){window.hearthroom=api}
try{var c=navigator.clipboard;if(c&&c.writeText){var w=c.writeText.bind(c);c.writeText=function(t){api.fill(t);return w(t).catch(function(){})}}}catch(e){}
document.addEventListener('copy',function(){try{var a=document.activeElement,s='';
if(a&&typeof a.value==='string'&&a.selectionStart!=null)s=a.value.slice(a.selectionStart,a.selectionEnd);
if(!s)s=String(document.getSelection()||'');api.fill(s)}catch(e){}},true);
var last=-1;function size(){var b=document.body;var h=Math.ceil(b?b.scrollHeight:document.documentElement.scrollHeight);if(h!==last){last=h;post({kind:'height',height:h})}}
if(window.ResizeObserver){new ResizeObserver(size).observe(document.documentElement)}
window.addEventListener('load',size);setTimeout(size,0);
})();`

/** 作者的 HTML 包成 iframe 的 srcdoc：淺色紙、不留外距，再接上面那段腳本。作者自己的樣式寫在後面，照樣蓋得過預設。 */
export function openingSrcdoc(html: string): string {
  const base = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>html{background:#fff;color:#1f1f1f;color-scheme:light}body{margin:0;padding:12px;overflow-wrap:anywhere}</style>'
  return `<!doctype html>${base}<script>${OPENING_BOOTSTRAP}</script>${String(html ?? '')}`
}

/** 認外層收到的訊息；不是首屏網頁送的、或形狀不對都回 null。 */
export function parseOpeningMessage(data: unknown): OpeningMessage | null {
  if (!data || typeof data !== 'object') return null
  const m = data as Record<string, unknown>
  if (m.type !== OPENING_MESSAGE_TYPE) return null
  if (m.kind === 'height') {
    const h = Number(m.height)
    return Number.isFinite(h) && h >= 0 ? { kind: 'height', height: Math.min(Math.ceil(h), HEIGHT_MAX) } : null
  }
  if ((m.kind === 'fill' || m.kind === 'send') && typeof m.text === 'string') {
    const text = m.text.slice(0, OPENING_TEXT_MAX)
    return text.trim() ? { kind: m.kind, text } : null
  }
  return null
}

export interface OpeningHandlers {
  fill(text: string): void
  /** 玩家剛點過頁面時才會叫到；沒點過的 send 改走 fill。 */
  send(text: string): void
}

export interface OpeningPageMount {
  frame: HTMLIFrameElement
  destroy(): void
}

/**
 * 這一層剛有使用者操作：iframe 裡的點擊會把使用者啟用狀態傳到外層每一層（HTML 的 activation notification），
 * 所以外層看自己的 navigator.userActivation 就知道。單看它不夠——玩家在外層打字也算啟用——
 * 所以送出還要看焦點在不在首屏網頁上（見 clickedFrame）。沒有這個 API 的瀏覽器一律當沒操作，改成填入。
 */
export function hasUserActivation(win: Window): boolean {
  const ua = (win.navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation
  return !!ua && ua.isActive === true
}

/**
 * 玩家剛點了這個 iframe：這一層剛有操作，而且焦點在這個 iframe 上（點進 iframe 時，外層的 activeElement 就是它）。
 * 頁面自己用腳本送的 send，或玩家在外層輸入框打字時頁面趁機送的 send，都過不了，只能填入，
 * 不會在玩家沒按的情況下花他的點數。
 */
export function clickedFrame(win: Window, frame: HTMLIFrameElement): boolean {
  return hasUserActivation(win) && win.document.activeElement === frame
}

/** 在 container 裡放一個首屏網頁 iframe，接好高度與填入／送出。回傳的 destroy 會拿掉 iframe 與監聽。 */
export function mountOpeningPage(
  container: HTMLElement,
  html: string,
  handlers: OpeningHandlers,
  options: { title?: string; activated?: () => boolean } = {},
): OpeningPageMount {
  const doc = container.ownerDocument
  const win = doc.defaultView as Window
  const frame = doc.createElement('iframe')
  frame.setAttribute('sandbox', OPENING_SANDBOX)
  frame.setAttribute('allow', OPENING_ALLOW)
  frame.setAttribute('data-lt', 'opening-page')
  if (options.title) frame.title = options.title
  // 先給一個小高度，等頁面回報內容高度再撐開：量的是 body（html 的 scrollHeight 不會小於 iframe 本身，框只會變大不會變小）
  frame.style.cssText = 'display:block;width:100%;height:48px;border:0;border-radius:12px;background:#fff'
  frame.srcdoc = openingSrcdoc(html)
  const activated = options.activated ?? (() => clickedFrame(win, frame))
  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return
    const message = parseOpeningMessage(event.data)
    if (!message) return
    if (message.kind === 'height') frame.style.height = `${Math.max(message.height, 40)}px`
    else if (message.kind === 'send' && activated()) handlers.send(message.text)
    else handlers.fill(message.text)
  }
  win.addEventListener('message', onMessage)
  container.appendChild(frame)
  return {
    frame,
    destroy() {
      win.removeEventListener('message', onMessage)
      frame.remove()
    },
  }
}
