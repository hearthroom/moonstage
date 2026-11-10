/**
 * 首屏網頁：開新對話時顯示在畫布最上方的作者網頁（AI 風月的「詳細介紹」）。
 *
 * 只給看的人看，不送模型——資料放在作者資產（openingPage），伺服器組提示詞與整理記憶都不讀它。
 *
 * 怎麼放：無同源的 srcdoc iframe，跟風月一樣（sandbox 只給 allow-scripts allow-forms allow-pointer-lock）。
 * 不直接塞進畫布或沙箱殼：這些頁面是寫給獨立文件的，`body{}`、`*{}` 重設與 `html{height:100%}`
 * 放進來會改掉整頁的樣式。底色固定是淺色紙：風月的聊天頁是淺色，作者照淺底配色，跟著我們的深色走字會看不見。
 *
 * 框多大：貼滿聊天欄——寬對齊聊天區左右兩緣，高的上限到輸入列上緣，內容超過就在框裡捲（風月也是固定框、框內捲）。
 * 作者照「一個視窗」寫這些頁面
 * （min-height:88vh 的封面、position:fixed 的頂欄與底欄、全屏的開場遮罩），框跟著內容撐高的話，
 * vh 會跟著框變大、又把框撐得更高（卡片 101005 撐到視窗的十幾倍），fixed 的底欄也掉到看不到的地方。
 * 短頁照舊縮到內容高（見 createFrameSizer）。
 *
 * 頁面能做的事只有三件，都經 postMessage 告訴外層：
 *   - 回報自己的高度（外層據此決定 iframe 多高，見上）
 *   - `hearthroom.fill(text)`：把一句話填進玩家的輸入框
 *   - `hearthroom.send(text)`：把一句話當玩家的第一句送出（外層只在玩家剛點過時照做，否則改成填入）
 * 風月的開局生成器是「拼好文字、複製到剪貼簿、讓玩家貼上」：頁面寫進剪貼簿的那段字也一併填進輸入框，
 * 玩家不必再貼一次。
 */

export const OPENING_MESSAGE_TYPE = 'hearthroom:opening'
/** 一次填入／送出的字數上限，避免頁面把整份文件塞進輸入框。 */
export const OPENING_TEXT_MAX = 8000
const HEIGHT_MAX = 20000
const HEIGHT_MIN = 40
/** 框的上限至少這麼高：聊天區量不到或很矮時（橫向手機、鍵盤開著）首屏仍看得到一段。 */
const CAP_MIN = 240
/** 剛縮小之後這段時間內回報變得更小，算是內容跟著框縮（vh、height:100%），不是玩家收合。 */
const SHRINK_ECHO_MS = 1000

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

/**
 * 框的高度怎麼跟著頁面回報走。
 *
 * 一開始就給上限高度：照視窗寫的頁面（vh、100%）量到的就是上限以上，一步到位，不會一格一格往上撐。
 * 回報比上限小就縮到內容高；但縮完立刻又回報更小，代表內容是跟著框縮的（50vh 的區塊之類），
 * 再縮下去只會越縮越小——這時回到上限並固定，跟風月一樣在框裡捲。
 */
export function createFrameSizer(cap: number, now: () => number = () => Date.now()) {
  let limit = Math.max(CAP_MIN, Math.floor(cap))
  let current = limit
  let measured = limit
  let locked = false
  let shrunkTo = 0
  let shrunkAt = 0
  return {
    get height() { return current },
    /** 頁面回報內容高度；回傳框該有的高度。 */
    report(reported: number): number {
      // 0 是頁面還沒排版（srcdoc 剛開始解析），不代表內容是空的。
      if (locked || !(reported > 0)) return current
      measured = reported
      if (shrunkTo && reported < shrunkTo && now() - shrunkAt < SHRINK_ECHO_MS) {
        locked = true
        shrunkTo = 0
        current = limit
        return current
      }
      const next = Math.min(Math.max(reported, HEIGHT_MIN), limit)
      if (next < current) { shrunkTo = reported; shrunkAt = now() } else shrunkTo = 0
      current = next
      return current
    },
    /**
     * 聊天區或框周圍的內容變了，換上限。頁面量到的剛好是框高（照視窗寫的頁面，內容跟著框走）或已固定的，跟著新上限走；
     * 其他照內容高——頁面內容沒變就不會再回報，這裡拉高了就再也縮不回來。
     */
    setCap(nextCap: number): number {
      const followsFrame = locked || Math.abs(measured - limit) <= 1
      limit = Math.max(CAP_MIN, Math.floor(nextCap))
      current = followsFrame ? limit : Math.min(Math.max(measured, HEIGHT_MIN), limit)
      return current
    },
  }
}

/** 聊天區：往上第一個會捲、而且已經排好版的容器。 */
function chatScroller(el: HTMLElement): HTMLElement | null {
  const win = el.ownerDocument.defaultView as Window
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflowY = win.getComputedStyle(p).overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.clientHeight > 0 && p.clientWidth > 0) return p
  }
  return null
}

/** 值沒變就不寫：寫樣式會讓整頁重排，這支在聊天內容每次變高時都會跑。 */
function setStyle(el: HTMLElement, prop: 'width' | 'margin', value: string) {
  if (el.style[prop] !== value) el.style[prop] = value
}

/** 框上方只隔著訊息區的內距（沒有別的內容）時，往上貼齊聊天區頂端；隔著序章之類的內容就不動。 */
const FLUSH_TOP_MAX = 32

/**
 * 框貼滿聊天欄：用負邊距抵掉訊息區的左右內距，寬＝聊天區寬。高的上限＝聊天區高扣掉框上方用掉的距離與框下方的內容
 * （開場選項、內距）：開場時整列剛好放進聊天區，框頂貼著頁首、下方內容貼著輸入列，不必捲。
 * 框下方的內容多到框剩不到聊天區一半（作者另寫了長的 AI 開場白）就不扣，框照聊天區高，下方內容往下捲。
 * 回傳高度上限。找不到聊天區（還沒排版）就照容器寬、以視窗高為上限。
 */
export function fitOpeningFrame(container: HTMLElement, frame: HTMLIFrameElement): number {
  const win = container.ownerDocument.defaultView as Window
  const scroller = chatScroller(container)
  if (!scroller) {
    setStyle(frame, 'width', '100%')
    setStyle(frame, 'margin', '0px')
    return win.innerHeight
  }
  const s = scroller.getBoundingClientRect()
  const c = container.getBoundingClientRect()
  const cs = win.getComputedStyle(container)
  const left = c.left + (parseFloat(cs.paddingLeft) || 0) - (s.left + scroller.clientLeft)
  const above = c.top + (parseFloat(cs.paddingTop) || 0) - (s.top + scroller.clientTop) + scroller.scrollTop
  const pullUp = above > 0 && above <= FLUSH_TOP_MAX ? above : 0
  setStyle(frame, 'width', `${scroller.clientWidth}px`)
  setStyle(frame, 'margin', `${-Math.round(pullUp)}px 0px 0px ${-Math.round(left)}px`)
  // 框下方的內容：聊天區內容的下緣（含內距）減掉框的下緣；跟框本身多高無關，框變高變矮都量得一樣。
  let contentBottom = 0
  for (const child of Array.from(scroller.children)) contentBottom = Math.max(contentBottom, child.getBoundingClientRect().bottom)
  const below = Math.max(0, contentBottom + (parseFloat(win.getComputedStyle(scroller).paddingBottom) || 0) - frame.getBoundingClientRect().bottom)
  const full = scroller.clientHeight - Math.max(0, above - pullUp)
  return full - below >= full / 2 ? full - below : full
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
  options: { title?: string; activated?: () => boolean; maxHeight?: () => number } = {},
): OpeningPageMount {
  const doc = container.ownerDocument
  const win = doc.defaultView as Window
  const frame = doc.createElement('iframe')
  frame.setAttribute('sandbox', OPENING_SANDBOX)
  frame.setAttribute('allow', OPENING_ALLOW)
  frame.setAttribute('data-lt', 'opening-page')
  if (options.title) frame.title = options.title
  frame.style.cssText = 'display:block;width:100%;border:0;background:#fff'
  frame.srcdoc = openingSrcdoc(html)
  const activated = options.activated ?? (() => clickedFrame(win, frame))
  container.appendChild(frame)
  // 位置與上限在掛上之後量（要知道聊天區多寬多高）。之後只在視窗變寬變窄、或聊天區內容變高變矮時重量：
  // 手機開鍵盤只改視窗高度，框不該跟著跳。
  const maxHeight = options.maxHeight ?? (() => fitOpeningFrame(container, frame))
  const sizer = createFrameSizer(maxHeight())
  const setHeight = (h: number) => { frame.style.height = `${h}px` }
  setHeight(sizer.height)
  let width = win.innerWidth
  let cap = Math.floor(maxHeight())
  const refit = () => {
    // 沙箱殼在玩家送出第一句後只把首屏藏起來、不拆：藏著的時候不量，否則之後整段對話每長一行都要重排一次。
    if (!container.getClientRects().length) return
    const next = Math.floor(maxHeight())
    if (next === cap) return
    cap = next
    setHeight(sizer.setCap(next))
  }
  const onResize = () => {
    if (win.innerWidth === width) return
    width = win.innerWidth
    refit()
  }
  // 框下方的內容（開場選項、作者的 AI 開場白）是之後才畫上的：內容高度一變就重算上限。框自己變高變矮不影響上限，不會來回跳。
  const content = typeof ResizeObserver === 'function' ? new ResizeObserver(() => refit()) : null
  const scroller = chatScroller(container)
  if (content && scroller) for (const child of Array.from(scroller.children)) content.observe(child)
  // 聊天區自己變矮變高、視窗沒變：輸入區多了或少了一排（第一句選項在輸入區最上面），框要跟著讓位，
  // 不然框底會壓到輸入區後面、要捲才看得到。鍵盤開合會改視窗高度，那時不動（見上）。
  const viewportHeight = () => Math.round(win.visualViewport?.height ?? win.innerHeight)
  let lastViewport = viewportHeight()
  const area = typeof ResizeObserver === 'function' && scroller ? new ResizeObserver(() => {
    const now = viewportHeight()
    if (now !== lastViewport) { lastViewport = now; return }
    refit()
  }) : null
  if (area && scroller) area.observe(scroller)
  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return
    const message = parseOpeningMessage(event.data)
    if (!message) return
    if (message.kind === 'height') setHeight(sizer.report(message.height))
    else if (message.kind === 'send' && activated()) handlers.send(message.text)
    else handlers.fill(message.text)
  }
  win.addEventListener('message', onMessage)
  win.addEventListener('resize', onResize)
  return {
    frame,
    destroy() {
      win.removeEventListener('message', onMessage)
      win.removeEventListener('resize', onResize)
      content?.disconnect()
      area?.disconnect()
      frame.remove()
    },
  }
}
