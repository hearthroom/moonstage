/**
 * 瀏覽器頂部／底部工具列染色（iOS 26 Safari 不看 theme-color，看頁面背景與貼邊的 fixed 元素）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { paintBrowserChrome } from '../browser-chrome'

const probe = () => document.querySelectorAll<HTMLElement>('[data-stage-chrome-probe]')

afterEach(() => {
  paintBrowserChrome(document, null)
  document.documentElement.removeAttribute('style')
  vi.restoreAllMocks()
})

describe('paintBrowserChrome', () => {
  it('html 背景塗成頂欄色；底色不同時底邊放一條同色、不接點擊的細條', () => {
    paintBrowserChrome(document, 'rgb(32, 28, 40)', 'rgb(60, 40, 70)')
    expect(document.documentElement.style.backgroundColor).toBe('rgb(32, 28, 40)')
    expect(probe()).toHaveLength(1)
    const p = probe()[0]
    expect(p.style.position).toBe('fixed')
    expect(p.style.bottom).toBe('0px')
    expect(p.style.height).toBe('3px')
    expect(p.style.pointerEvents).toBe('none')
    expect(p.getAttribute('aria-hidden')).toBe('true')
    expect(p.style.backgroundColor).toBe('rgb(60, 40, 70)')
  })

  it('再叫一次只更新顏色，不會多一條；底色跟頂欄一樣或沒給就拿掉細條', () => {
    paintBrowserChrome(document, 'rgb(32, 28, 40)', 'rgb(60, 40, 70)')
    paintBrowserChrome(document, 'rgb(32, 28, 40)', 'rgb(70, 50, 80)')
    expect(probe()).toHaveLength(1)
    expect(probe()[0].style.backgroundColor).toBe('rgb(70, 50, 80)')
    paintBrowserChrome(document, 'rgb(32, 28, 40)', 'rgb(32, 28, 40)')
    expect(probe()).toHaveLength(0)
    paintBrowserChrome(document, 'rgb(32, 28, 40)', 'rgb(60, 40, 70)')
    paintBrowserChrome(document, 'rgb(32, 28, 40)')
    expect(probe()).toHaveLength(0)
  })

  it('離開對話頁（null）：細條拿掉、html 背景還原成原本的行內值', () => {
    document.documentElement.style.backgroundColor = 'rgb(1, 2, 3)'
    paintBrowserChrome(document, 'rgb(32, 28, 40)', 'rgb(60, 40, 70)')
    paintBrowserChrome(document, 'rgb(40, 30, 50)', 'rgb(60, 40, 70)')
    paintBrowserChrome(document, null)
    expect(probe()).toHaveLength(0)
    expect(document.documentElement.style.backgroundColor).toBe('rgb(1, 2, 3)')
    document.documentElement.removeAttribute('style')
    paintBrowserChrome(document, 'rgb(32, 28, 40)')
    paintBrowserChrome(document, null)
    expect(document.documentElement.style.backgroundColor).toBe('')
  })

  it('從主畫面開的獨立 App 沒有瀏覽器工具列：不放細條', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: q === '(display-mode: standalone)', media: q } as MediaQueryList))
    paintBrowserChrome(document, 'rgb(32, 28, 40)', 'rgb(60, 40, 70)')
    expect(probe()).toHaveLength(0)
    expect(document.documentElement.style.backgroundColor).toBe('rgb(32, 28, 40)')
  })
})
