/**
 * 首屏網頁（AI 風月的「詳細介紹」）：無同源的 iframe、自己回報高度、能把一句話填進輸入框，
 * 只有玩家剛點過時才會替他送出。
 */
import { describe, it, expect, vi } from 'vitest'
import { mountOpeningPage, openingSrcdoc, parseOpeningMessage, OPENING_BOOTSTRAP, OPENING_MESSAGE_TYPE, OPENING_SANDBOX } from '../opening-page'
import { stylePolicyFor } from '../author-style-policy'
import { normalizeCardFormat } from '../card-format'

describe('srcdoc', () => {
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

  it('一開始就回報高度', () => {
    const { posted } = runBootstrap()
    expect(posted).toContainEqual({ type: OPENING_MESSAGE_TYPE, kind: 'height', height: 321 })
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

describe('mountOpeningPage', () => {
  function setup(activated: boolean) {
    const box = document.createElement('div')
    document.body.appendChild(box)
    const fill = vi.fn()
    const send = vi.fn()
    const page = mountOpeningPage(box, '<p>首屏</p>', { fill, send }, { activated: () => activated })
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
