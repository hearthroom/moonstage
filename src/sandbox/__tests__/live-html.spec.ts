import { describe, it, expect } from 'vitest'
import { createLiveHtml } from '../render/live-html'

describe('狀態欄來源投影', () => {
  it('只更新來源變更的文字與屬性，保留作者搬動的節點與覆寫值', () => {
    const root = document.createElement('div')
    const html = createLiveHtml(root)
    html.replace('<button title="old">old</button><span data-count="0">0</span>')
    const button = root.querySelector('button')!, counter = root.querySelector('span')!
    const extra = document.createElement('em')
    extra.textContent = 'script'
    root.prepend(extra)
    root.append(button)
    counter.setAttribute('data-count', '7')
    counter.textContent = '7'
    html.update('<button title="new">new</button><span data-count="0">0</span>')
    expect(root.querySelector('button')).toBe(button)
    expect(button.textContent).toBe('new')
    expect(button.title).toBe('new')
    expect(counter.textContent).toBe('7')
    expect(counter.getAttribute('data-count')).toBe('7')
    expect(root.firstChild).toBe(extra)
    html.update('<button title="third">third</button><span data-count="0">0</span>')
    expect(button.title).toBe('third')
    expect(button.textContent).toBe('third')
    expect(root.lastChild).toBe(button)
  })

  it('作者以同值 textContent 重建文字後，連續改名仍更新可見節點', () => {
    const root = document.createElement('div')
    const html = createLiveHtml(root)
    html.replace('<button>GlobalOld</button><span>0</span>')
    const button = root.querySelector('button')!, counter = root.querySelector('span')!
    let clicks = 0
    button.addEventListener('click', () => clicks++)
    const oldText = button.firstChild
    button.textContent = 'GlobalOld'
    expect(button.firstChild).not.toBe(oldText)
    counter.textContent = '7'
    html.update('<button>GlobalNew</button><span>0</span>')
    expect(button.textContent).toBe('GlobalNew')
    button.textContent = 'GlobalNew'
    html.update('<button>GlobalThird</button><span>0</span>')
    expect(button.textContent).toBe('GlobalThird')
    expect(root.querySelector('button')).toBe(button)
    button.click()
    expect(clicks).toBe(1)
    expect(counter.textContent).toBe('7')
  })

  it('作者重建並改寫的文字仍保留，不把不同值猜成玩家名', () => {
    const root = document.createElement('div')
    const html = createLiveHtml(root)
    html.replace('<span>GlobalOld</span>')
    const span = root.querySelector('span')!
    span.textContent = 'Author override'
    html.update('<span>GlobalNew</span>')
    expect(span.textContent).toBe('Author override')
  })

  it('來源新增、移除或更換標籤時，仍反映新來源而不重建未變的節點', () => {
    const root = document.createElement('div')
    const html = createLiveHtml(root)
    html.replace('<button>action</button><b>old</b>')
    const button = root.firstChild
    html.update('<button>action</button><i>new</i><span>added</span>')
    expect(root.firstChild).toBe(button)
    expect(root.innerHTML).toBe('<button>action</button><i>new</i><span>added</span>')
    html.update('<button>action</button>')
    expect(root.firstChild).toBe(button)
    expect(root.children).toHaveLength(1)
  })
})
