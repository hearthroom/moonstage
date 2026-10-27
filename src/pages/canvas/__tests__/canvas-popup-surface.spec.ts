import { describe, it, expect } from 'vitest'
import { solidPopupBackground, syncChromeTone } from '../canvas-chrome-tone'

describe('平台彈層的不透明底色', () => {
  const panel = (background: string, sheet = '#faf7f2') => {
    const el = document.createElement('div')
    el.style.backgroundColor = background
    el.style.setProperty('--lt-canvas-sheet-bg', sheet)
    document.body.appendChild(el)
    return el
  }
  it('透明的作者頁底不能讓平台面板透出正文', () => {
    const el = panel('transparent')
    expect(solidPopupBackground(el)).toBe('rgb(250, 247, 242)')
    el.remove()
  })
  it('保留作者的不透明底色；半透明色疊在平台表面後轉成不透明', () => {
    const el = panel('rgb(30, 40, 50)')
    expect(solidPopupBackground(el)).toBe('rgb(30, 40, 50)')
    el.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
    expect(solidPopupBackground(el)).toBe('rgb(125, 124, 121)')
    el.remove()
  })
  it('作者把共用色彩變數清成透明，仍用對應深淺模式的實底', () => {
    const el = panel('transparent', 'transparent')
    el.dataset.theme = 'light'
    expect(solidPopupBackground(el)).toBe('rgb(255, 255, 255)')
    el.dataset.theme = 'dark'
    expect(solidPopupBackground(el)).toBe('rgb(24, 27, 33)')
    el.remove()
  })
  it('實底跟著主題重算，字色以實底而非背後正文判斷', () => {
    const el = panel('transparent')
    el.className = 'u-popup__content'
    el.innerHTML = '<div class="lt-dialog-backplate"></div>'
    syncChromeTone(document.body)
    expect((el.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(250, 247, 242)')
    expect(el.getAttribute('data-lt-tone')).toBe('light')
    el.style.setProperty('--lt-canvas-sheet-bg', '#181b21')
    syncChromeTone(document.body)
    expect((el.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(24, 27, 33)')
    expect(el.getAttribute('data-lt-tone')).toBe('dark')
    el.remove()
  })
})
