/**
 * 首屏網頁（AI 風月的「詳細介紹」）：無同源的 iframe、自己回報高度、能把一句話填進輸入框，
 * 只有玩家剛點過時才會替他送出。
 */
import { describe, it, expect, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { clickedFrame, createFrameSizer, mountOpeningPage, openingSrcdoc, parseOpeningMessage, OPENING_BOOTSTRAP, OPENING_MESSAGE_TYPE, OPENING_SANDBOX } from '../opening-page'
import { stylePolicyFor } from '../author-style-policy'
import { normalizeCardFormat } from '../card-format'

describe('srcdoc', () => {
  it('網頁開局展開顯示文字的 user／char，名字是純文字且只展開一次', () => {
    const html = '<html lang="en"><head><title>{{char}}</title></head><body><p>{{ USER }} / {{char}} / {{unknown}}</p><input placeholder="{{user}}"></body></html>'
    const name = '<旅人> & $1 {{char}}'
    const doc = new JSDOM(openingSrcdoc(html, { user: name, char: '星' }), { runScripts: 'dangerously' }).window.document
    expect(doc.querySelector('p')!.textContent).toBe(`${name} / 星 / {{unknown}}`)
    expect(doc.querySelector('p')!.children.length).toBe(0)
    expect(doc.querySelector('input')!.placeholder).toBe(name)
    expect(doc.title).toBe('星')
    expect(doc.documentElement.lang).toBe('en')
  })

  it('保留作者的 script、style、事件與機讀屬性', () => {
    const html = '<style>.{{user}}{color:red}</style><p id="{{user}}" onclick="window.hit=1">{{user}}</p><script>window.template="{{user}}"</script>'
    const doc = new JSDOM(openingSrcdoc(html, { user: '小明', char: '星' }), { runScripts: 'dangerously' }).window.document
    expect(doc.querySelector('p')!.textContent).toBe('小明')
    expect(doc.querySelector('p')!.id).toBe('{{user}}')
    expect(doc.querySelector('p')!.getAttribute('onclick')).toBe('window.hit=1')
    expect(doc.querySelector('style:last-of-type')!.textContent).toBe('.{{user}}{color:red}')
    expect(Array.from(doc.querySelectorAll('script')).some(s => s.textContent === 'window.template="{{user}}"')).toBe(true)
  })

  it('頁內更新只接受父頁，保留玩家表單、腳本狀態；後加入的顯示文字也展開', async () => {
    const dom = new JSDOM(openingSrcdoc('<p>{{user}} / {{char}}</p><input value="draft"><script>window.boots=(window.boots||0)+1</script>', { user: '帳號名', char: '星' }), { runScripts: 'dangerously' })
    const win = dom.window
    const input = win.document.querySelector('input')!
    input.value = '玩家已填內容'
    const post = (source: any, name: string) => win.dispatchEvent(new win.MessageEvent('message', { source, data: { type: 'hearthroom:opening-macros', macros: { user: name, char: '星' } } }))
    post(null, '外來訊息')
    expect(win.document.querySelector('p')!.textContent).toBe('帳號名 / 星')
    post(win.parent, '</script><b>$1 {{char}}</b>')
    expect(win.document.querySelector('p')!.textContent).toBe('</script><b>$1 {{char}}</b> / 星')
    expect(input.value).toBe('玩家已填內容')
    expect((win as any).boots).toBe(1)
    const extra = win.document.createElement('div')
    extra.textContent = '{{user}}'
    win.document.body.append(extra)
    await Promise.resolve()
    expect(extra.textContent).toBe('</script><b>$1 {{char}}</b>')
    dom.window.close()
  })

  it('不改 SVG 的 script/style；作者改寫文字或刪除顯示屬性後不還原舊模板', () => {
    const dom = new JSDOM(openingSrcdoc('<svg><style>.{{user}}{fill:red}</style><script>window.svgName="{{user}}"</script></svg><p>{{user}}</p><input placeholder="{{user}}">', { user: '帳號名', char: '星' }), { runScripts: 'dangerously' })
    const win = dom.window
    expect(win.document.querySelector('svg style')!.textContent).toBe('.{{user}}{fill:red}')
    expect(win.document.querySelector('svg script')!.textContent).toBe('window.svgName="{{user}}"')
    win.document.querySelector('p')!.firstChild!.nodeValue = '作者另寫的文字'
    win.document.querySelector('input')!.removeAttribute('placeholder')
    win.dispatchEvent(new win.MessageEvent('message', { source: win.parent, data: { type: 'hearthroom:opening-macros', macros: { user: '新名', char: '星' } } }))
    expect(win.document.querySelector('p')!.textContent).toBe('作者另寫的文字')
    expect(win.document.querySelector('input')!.hasAttribute('placeholder')).toBe(false)
    dom.window.close()
  })

  it('更新稱呼不重載 iframe，保留玩家表單與作者腳本狀態', () => {
    const box = document.createElement('div')
    document.body.appendChild(box)
    const page = mountOpeningPage(box, '<p>{{user}}</p>', { fill() {}, send() {} }, { macros: { user: '帳號名', char: '星' } })
    const before = page.frame.srcdoc
    const post = vi.spyOn(page.frame.contentWindow!, 'postMessage')
    page.updateMacros({ user: '人設名', char: '星' })
    expect(page.frame.srcdoc).toBe(before)
    expect(post).toHaveBeenCalledWith({ type: 'hearthroom:opening-macros', macros: { user: '人設名', char: '星' } }, '*')
    page.destroy()
    box.remove()
  })

  it('腳本在作者內容之前，淺色紙的預設樣式也在作者樣式之前', () => {
    const doc = openingSrcdoc('<style>html{background:#000}</style><p>TEST</p>')
    expect(doc.indexOf(OPENING_BOOTSTRAP)).toBeGreaterThan(0)
    expect(doc.indexOf(OPENING_BOOTSTRAP)).toBeLessThan(doc.indexOf('<p>TEST</p>'))
    expect(doc.indexOf('background:#fff')).toBeLessThan(doc.indexOf('background:#000'))
  })
})

describe('頁面裡的腳本', () => {
  function runBootstrap(clipboardWrite?: (t: string) => Promise<void>) {
    const posted: any[] = []
    const listeners: Record<string, (e: any) => void> = {}
    const win: any = {}
    const doc: any = {
      documentElement: { scrollHeight: 321 }, body: { scrollHeight: 300 }, activeElement: null,
      addEventListener: (name: string, fn: any) => { listeners[name] = fn },
      getSelection: () => '',
    }
    const nav: any = clipboardWrite ? { clipboard: { writeText: clipboardWrite } } : {}
    win.addEventListener = () => {}
    const parent = { postMessage: (m: any) => posted.push(m) }
    new Function('window', 'document', 'navigator', 'parent', 'setTimeout', 'ResizeObserver', OPENING_BOOTSTRAP)(win, doc, nav, parent, (fn: () => void) => fn(), undefined)
    return { posted, win, doc, nav, listeners }
  }

  it('hearthroom.fill／send 送出帶類型的訊息；空白不送；過長截斷', () => {
    const { posted, win } = runBootstrap()
    win.hearthroom.fill('我推開門。')
    win.hearthroom.send('出發')
    win.hearthroom.send('   ')
    win.hearthroom.fill('字'.repeat(9000))
    const texts = posted.filter((m) => m.kind !== 'height')
    expect(texts.map((m) => [m.type, m.kind, [...m.text].length])).toEqual([
      [OPENING_MESSAGE_TYPE, 'fill', 5], [OPENING_MESSAGE_TYPE, 'send', 2], [OPENING_MESSAGE_TYPE, 'fill', 8000],
    ])
  })

  it('一開始就回報內容高度：量 body，不量 html（html 的 scrollHeight 不會小於框本身，短內容的框會縮不回來）', () => {
    const { posted } = runBootstrap()
    expect(posted).toContainEqual({ type: OPENING_MESSAGE_TYPE, kind: 'height', height: 300 })
  })

  it('風月的開局生成器把字寫進剪貼簿：照樣寫，也填進輸入框', async () => {
    const written: string[] = []
    const { posted, nav } = runBootstrap(async (t) => { written.push(t) })
    await nav.clipboard.writeText('身分：旅人')
    expect(written).toEqual(['身分：旅人'])
    expect(posted).toContainEqual({ type: OPENING_MESSAGE_TYPE, kind: 'fill', text: '身分：旅人' })
  })

  it('剪貼簿在沙箱裡被拒時，頁面拿到的仍是成功（不讓作者的頁面報錯），字照樣填進輸入框', async () => {
    const { posted, nav } = runBootstrap(() => Promise.reject(new Error('denied')))
    await expect(nav.clipboard.writeText('第一句')).resolves.toBeUndefined()
    expect(posted.some((m) => m.kind === 'fill' && m.text === '第一句')).toBe(true)
  })

  it('用 textarea 選取再 execCommand(copy) 的寫法：取選到的那一段', () => {
    const { posted, doc, listeners } = runBootstrap()
    doc.activeElement = { value: 'xx開局文字yy', selectionStart: 2, selectionEnd: 6 }
    listeners.copy({})
    expect(posted).toContainEqual({ type: OPENING_MESSAGE_TYPE, kind: 'fill', text: '開局文字' })
  })
})

describe('parseOpeningMessage', () => {
  it('只認自己的類型與形狀', () => {
    expect(parseOpeningMessage({ type: 'other', kind: 'fill', text: 'x' })).toBeNull()
    expect(parseOpeningMessage({ type: OPENING_MESSAGE_TYPE, kind: 'eval', text: 'x' })).toBeNull()
    expect(parseOpeningMessage({ type: OPENING_MESSAGE_TYPE, kind: 'fill', text: '  ' })).toBeNull()
    expect(parseOpeningMessage({ type: OPENING_MESSAGE_TYPE, kind: 'height', height: 999999 })).toEqual({ kind: 'height', height: 20000 })
    expect(parseOpeningMessage(null)).toBeNull()
  })
})

describe('clickedFrame', () => {
  it('要剛有操作、而且焦點在這個 iframe 上：玩家在外層打字時頁面趁機送出，不算', () => {
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    const ua = { isActive: true }
    Object.defineProperty(window.navigator, 'userActivation', { configurable: true, get: () => ua })
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(clickedFrame(window, frame)).toBe(false)
    Object.defineProperty(document, 'activeElement', { configurable: true, get: () => frame })
    expect(clickedFrame(window, frame)).toBe(true)
    ua.isActive = false
    expect(clickedFrame(window, frame)).toBe(false)
    delete (document as any).activeElement
    delete (window.navigator as any).userActivation
    frame.remove(); input.remove()
  })
})

describe('mountOpeningPage', () => {
  function setup(activated: boolean, maxHeight = 1000) {
    const box = document.createElement('div')
    document.body.appendChild(box)
    const fill = vi.fn()
    const send = vi.fn()
    const page = mountOpeningPage(box, '<p>首屏</p>', { fill, send }, { activated: () => activated, maxHeight: () => maxHeight })
    const post = (data: unknown, source: unknown = page.frame.contentWindow) =>
      window.dispatchEvent(new MessageEvent('message', { data, source: source as Window }))
    return { box, page, fill, send, post }
  }

  it('無同源的 sandbox，內容走 srcdoc', () => {
    const { page } = setup(false)
    expect(page.frame.getAttribute('sandbox')).toBe(OPENING_SANDBOX)
    expect(page.frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(page.frame.srcdoc).toContain('<p>首屏</p>')
    page.destroy()
  })

  it('高度撐開 iframe；別的視窗送來的訊息不理', () => {
    const { page, post, fill } = setup(true)
    post({ type: OPENING_MESSAGE_TYPE, kind: 'height', height: 512 })
    expect(page.frame.style.height).toBe('512px')
    post({ type: OPENING_MESSAGE_TYPE, kind: 'fill', text: '冒充' }, window)
    expect(fill).not.toHaveBeenCalled()
    page.destroy()
  })

  // 風月的做法：首屏是一個聊天區高度的框，內容超過就在框裡捲。作者照「一個視窗」寫頁面（min-height:88vh、
  // position:fixed 的頂欄底欄），框跟著內容撐高的話，vh 會跟著框變大、再把框撐得更高，一路放大到視窗的十幾倍。
  describe('框的高度', () => {
    const height = (n: number) => ({ type: OPENING_MESSAGE_TYPE, kind: 'height', height: n })

    it('一開始就是上限高度；內容再高也停在上限，在框裡捲', () => {
      const { page, post } = setup(true, 600)
      expect(page.frame.style.height).toBe('600px')
      post(height(12930))
      expect(page.frame.style.height).toBe('600px')
      page.destroy()
    })

    it('短頁縮到內容高；頁面還沒排版時回報的 0 不算', () => {
      const { page, post } = setup(true, 600)
      post(height(0))
      expect(page.frame.style.height).toBe('600px')
      post(height(300))
      expect(page.frame.style.height).toBe('300px')
      page.destroy()
    })

    it('剛縮完回報又變小：內容跟著框縮（vh、height:100%），回到上限並固定', () => {
      vi.useFakeTimers()
      const { page, post } = setup(true, 600)
      post(height(300))
      post(height(160))
      expect(page.frame.style.height).toBe('600px')
      post(height(100))
      post(height(5000))
      expect(page.frame.style.height).toBe('600px')
      page.destroy()
      vi.useRealTimers()
    })

    it('頂著上限的框，上限變了就跟著新上限（轉向、拉寬視窗）；沒頂著的照內容高', () => {
      const atCap = createFrameSizer(600)
      atCap.report(600)
      expect(atCap.setCap(400)).toBe(400)
      atCap.report(400)
      expect(atCap.setCap(900)).toBe(900)
      const short = createFrameSizer(600)
      short.report(300)
      expect(short.setCap(900)).toBe(300)
      expect(short.setCap(250)).toBe(250)
    })

    it('短頁的上限先降後升（打開又收起上方的介紹）：回到內容高，不被拉成新上限；比上限高的頁也只撐到內容高', () => {
      const short = createFrameSizer(550)
      short.report(450)
      expect(short.setCap(380)).toBe(380)
      expect(short.setCap(550)).toBe(450)
      const tall = createFrameSizer(600)
      tall.report(700)
      expect(tall.setCap(900)).toBe(700)
    })

    it('縮完過一陣子內容才變短（玩家收合一段）：照常縮', () => {
      vi.useFakeTimers()
      const { page, post } = setup(true, 600)
      post(height(300))
      vi.advanceTimersByTime(2000)
      post(height(200))
      expect(page.frame.style.height).toBe('200px')
      post(height(450))
      expect(page.frame.style.height).toBe('450px')
      page.destroy()
      vi.useRealTimers()
    })
  })

  it('首屏藏起來之後（沙箱殼送出第一句後只藏不拆），聊天內容再怎麼變都不重量框', () => {
    const callbacks: Array<() => void> = []
    const RO = class { constructor(cb: () => void) { callbacks.push(cb) } observe() {} disconnect() {} }
    vi.stubGlobal('ResizeObserver', RO)
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    Object.defineProperty(scroller, 'clientHeight', { value: 700 })
    Object.defineProperty(scroller, 'clientWidth', { value: 390 })
    const box = document.createElement('div')
    scroller.appendChild(box)
    document.body.appendChild(scroller)
    let shown = true
    box.getClientRects = () => (shown ? [box.getBoundingClientRect()] : []) as unknown as DOMRectList
    let measured = 0
    const page = mountOpeningPage(box, '<p>首屏</p>', { fill() {}, send() {} }, { maxHeight: () => { measured++; return 600 } })
    const before = measured
    // 第一個觀察器看聊天區裡的內容；第二個看聊天區本身（見下一條）。
    shown = false
    callbacks[0]()
    expect(measured).toBe(before)
    shown = true
    callbacks[0]()
    expect(measured).toBe(before + 1)
    page.destroy()
    scroller.remove()
    vi.unstubAllGlobals()
  })

  it('聊天區變矮而視窗沒變（輸入區變高：點進輸入框展開、打了好幾行）：重量框；視窗高度變了（鍵盤開合）不動', () => {
    const observers: Array<{ cb: () => void; targets: Element[] }> = []
    const RO = class {
      targets: Element[] = []
      constructor(cb: () => void) { observers.push({ cb, targets: this.targets }) }
      observe(el: Element) { this.targets.push(el) }
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', RO)
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    Object.defineProperty(scroller, 'clientHeight', { value: 700 })
    Object.defineProperty(scroller, 'clientWidth', { value: 390 })
    const box = document.createElement('div')
    scroller.appendChild(box)
    document.body.appendChild(scroller)
    box.getClientRects = () => [box.getBoundingClientRect()] as unknown as DOMRectList
    let cap = 600
    const page = mountOpeningPage(box, '<p>首屏</p>', { fill() {}, send() {} }, { maxHeight: () => cap })
    const area = observers.find((o) => o.targets.includes(scroller))
    expect(area).toBeTruthy()
    cap = 560
    area!.cb()
    expect(page.frame.style.height).toBe('560px')
    const innerHeight = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { value: innerHeight - 300, configurable: true })
    cap = 300
    area!.cb()
    expect(page.frame.style.height).toBe('560px')
    Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true })
    page.destroy()
    scroller.remove()
    vi.unstubAllGlobals()
  })

  it('玩家剛點過才送出；沒點過的送出改成填入', () => {
    const clicked = setup(true)
    clicked.post({ type: OPENING_MESSAGE_TYPE, kind: 'send', text: '出發' })
    expect(clicked.send).toHaveBeenCalledWith('出發')
    clicked.page.destroy()

    const scripted = setup(false)
    scripted.post({ type: OPENING_MESSAGE_TYPE, kind: 'send', text: '出發' })
    expect(scripted.send).not.toHaveBeenCalled()
    expect(scripted.fill).toHaveBeenCalledWith('出發')
    scripted.page.destroy()
  })

  it('destroy 之後不再接訊息', () => {
    const { page, post, fill } = setup(true)
    const source = page.frame.contentWindow
    page.destroy()
    post({ type: OPENING_MESSAGE_TYPE, kind: 'fill', text: 'x' }, source)
    expect(fill).not.toHaveBeenCalled()
  })
})

describe('風月格式', () => {
  it('認得 fengyue；樣式整頁生效、深淺跟著宿主（風月的聊天頁是淺色，不鎖深色）', () => {
    expect(normalizeCardFormat('fengyue')).toBe('fengyue')
    expect(stylePolicyFor('fengyue')).toEqual({ scope: null, fencedDocument: 'inline', theme: 'host' })
  })
})
