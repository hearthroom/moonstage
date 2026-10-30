/**
 * 作者腳本把氣泡內容搬進自己的殼之後，下一次重畫仍要畫得出來。
 *
 * 2026-10-31 作者回報：「AI 輸出到後面時，會整個縮起來，字完全看不到，輸出完才恢復。」
 * MMD 搬來的狀態欄常用 `<img onerror>` 啟動腳本：取 `closest('.content.left')`，把它的
 * 所有子節點搬進自己蓋的殼、殼掛回氣泡；下一次執行先刪掉上一個殼。MMD 每次整個重寫
 * `.content`，所以沒事。我們的訊息本體是氣泡裡 Vue 管的那個 `.lt-bubble-body`：串流中
 * 下一幀作者刪舊殼時，本體跟著離開文件，之後每一幀都寫進脫離的節點，畫面只剩空殼。
 *
 * jsdom 不會觸發 img onerror，這裡直接照那支腳本的動作搬節點。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasMessage from '../components/canvas-message.vue'

const BASE = {
  id: 'm1',
  mesid: 3,
  role: 'ai' as const,
  name: '示範角色',
  avatar: '',
  html: '<p>第一段</p>',
  finished: false,
  latest: true,
  latestAI: true,
  swipes: null,
}

/** 照作者狀態欄腳本做的事：刪上一個殼，把氣泡剩下的子節點搬進新殼，殼掛回氣泡。 */
function authorScriptRuns(bubble: Element) {
  bubble.querySelectorAll('.yws').forEach((el) => el.remove())
  const shell = document.createElement('div')
  shell.className = 'yws'
  const prose = document.createElement('div')
  prose.className = 'yP'
  Array.from(bubble.childNodes).forEach((node) => prose.appendChild(node))
  shell.appendChild(prose)
  bubble.appendChild(shell)
}

describe('作者腳本搬動氣泡內容之後的重畫', () => {
  it('串流下一幀的字仍畫在氣泡裡', async () => {
    const w = mount(CanvasMessage, { props: { message: { ...BASE } }, attachTo: document.body })
    const bubble = w.element.querySelector('.content.left')!

    authorScriptRuns(bubble)
    await w.setProps({ message: { ...BASE, html: '<p>第一段</p><p>第二段</p>' } })
    authorScriptRuns(bubble)
    await w.setProps({ message: { ...BASE, html: '<p>第一段</p><p>第二段</p><p>第三段</p>' } })

    expect(bubble.textContent).toContain('第三段')
    const body = bubble.querySelector('.lt-bubble-body')!
    expect(body.isConnected).toBe(true)
    expect(body.parentElement).toBe(bubble)
    w.unmount()
  })

  it('中間夾一次內容沒變的重畫，下一幀仍放得回來', async () => {
    const w = mount(CanvasMessage, { props: { message: { ...BASE } }, attachTo: document.body })
    const bubble = w.element.querySelector('.content.left')!

    authorScriptRuns(bubble)
    await w.setProps({ message: { ...BASE, latestAI: false } })
    await w.setProps({ message: { ...BASE, latestAI: false, html: '<p>第一段</p><p>第二段</p>' } })
    authorScriptRuns(bubble)

    expect(bubble.textContent).toContain('第二段')
    expect(bubble.querySelector('.lt-bubble-body')!.isConnected).toBe(true)
    w.unmount()
  })

  it('Vue 寫入的同一刻就被搬走（沒記到自己的節點）時不動氣泡，照舊畫在作者的殼裡', async () => {
    const w = mount(CanvasMessage, { props: { message: { ...BASE, loading: true, html: '' } }, attachTo: document.body })
    const bubble = w.element.querySelector('.content.left')!
    // 作者的自訂元素在 v-html 寫入時同步包起氣泡內容：Vue 更新完時本體已經不在氣泡直屬層。
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!
    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: true,
      get: original.get,
      set(this: Element, value: string) {
        original.set!.call(this, value)
        if (this.classList && this.classList.contains('lt-bubble-body') && this.parentElement === bubble) authorScriptRuns(bubble)
      },
    })
    try {
      await w.setProps({ message: { ...BASE, html: '<p>第一段</p>' } })
      await w.setProps({ message: { ...BASE, html: '<p>第一段</p><p>第二段</p>' } })
    } finally {
      Object.defineProperty(Element.prototype, 'innerHTML', original)
    }

    expect(bubble.textContent).toContain('第二段')
    expect(bubble.querySelector('.chat-typing-indicator')).toBeNull()
    w.unmount()
  })

  it('沙箱殼（chat 契約）作者掛在氣泡上的節點不受影響', async () => {
    const chat = { from: 'ai', state: 'streaming', msgId: 'm1', generating: true }
    const w = mount(CanvasMessage, { props: { message: { ...BASE }, chat }, attachTo: document.body })
    const bubble = w.element.querySelector('[data-chat="message-body"]')!
    const deco = document.createElement('div')
    deco.className = 'author-deco'
    bubble.appendChild(deco)

    await w.setProps({ message: { ...BASE, html: '<p>第一段</p><p>第二段</p>' }, chat })

    expect(bubble.querySelector(':scope > .author-deco')).toBe(deco)
    w.unmount()
  })

  it('內容沒變的重畫不拆掉作者已經蓋好的殼', async () => {
    const w = mount(CanvasMessage, { props: { message: { ...BASE, finished: true } }, attachTo: document.body })
    const bubble = w.element.querySelector('.content.left')!

    authorScriptRuns(bubble)
    await w.setProps({ message: { ...BASE, finished: true, latestAI: false } })

    expect(bubble.querySelector('.yws')).toBeTruthy()
    expect(bubble.textContent).toContain('第一段')
    w.unmount()
  })

  it('換內容時丟掉作者上一次蓋的殼，跟 MMD 整個重寫氣泡一樣', async () => {
    const w = mount(CanvasMessage, { props: { message: { ...BASE } }, attachTo: document.body })
    const bubble = w.element.querySelector('.content.left')!

    authorScriptRuns(bubble)
    await w.setProps({ message: { ...BASE, html: '<p>改過的內容</p>' } })

    expect(bubble.querySelector('.yws')).toBeNull()
    expect(bubble.querySelector(':scope > .lt-bubble-body')!.textContent).toBe('改過的內容')
    w.unmount()
  })
})
