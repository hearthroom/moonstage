import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, nextTick, ref } from 'vue'
import Boundary from '../components/canvas-notice-boundary.vue'
import ChatSystemMessage from '@/components/chat-system-message/chat-system-message.vue'

const showNotice = ref(true)
let cover: HTMLElement | null
let wrapper: ReturnType<typeof mount> | undefined
const box = { left: 20, top: 120, right: 380, bottom: 220, width: 360, height: 100, x: 20, y: 120, toJSON() {} }
const settle = async () => { await nextTick(); await new Promise(resolve => setTimeout(resolve, 60)); await nextTick() }
function start(enabled = true, busy = false) {
  const root = document.createElement('div')
  root.className = 'canvas-root'
  document.body.append(root)
  wrapper = mount(Boundary, {
    attachTo: root, props: { enabled },
    slots: { default: () => showNotice.value ? h(ChatSystemMessage, {
      kind: 'server-error', label: '回覆中斷', sub: '請稍後重試。',
      ctas: [{ action: 'retry', label: '重試' }], busy,
      onCta: action => actions.push(action),
    }) : null },
  })
  return wrapper
}
let actions: string[]
beforeEach(() => {
  cover = null; actions = []; showNotice.value = true
  const computed = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation(el => computed(el))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(box as DOMRect)
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => cover ? [cover] : Array.from(document.querySelectorAll('.sys-label')) })
  Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value: vi.fn() })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.replaceChildren(); vi.restoreAllMocks() })

describe('最新系統失敗卡被作者書本畫面遮住', () => {
  it('一般與 sandbox 共用的卡片浮出，保留原文與同一個 retry；切回對話後撤掉副本', async () => {
    start()
    await settle()
    expect(document.querySelector('[data-lt="notice-fallback"]')).toBeNull()
    cover = document.createElement('div'); cover.style.position = 'fixed'; document.body.append(cover)
    await settle()
    const fallback = document.querySelector('[data-lt="notice-fallback"]')!
    expect(fallback).not.toBeNull()
    expect(fallback.textContent).toContain('回覆中斷')
    expect(fallback.textContent).toContain('請稍後重試。')
    ;(fallback.querySelector('[data-lt="retry"]') as HTMLElement).click()
    expect(actions).toEqual(['retry'])
    cover.remove(); cover = null
    await settle()
    expect(document.querySelector('[data-lt="notice-fallback"]')).toBeNull()
    expect(document.querySelectorAll('.sys-msg-card')).toHaveLength(1)
  })

  it('作者隱藏聊天祖先時仍有出路；busy 期間同一個按鍵不能重送', async () => {
    const view = start(true, true)
    ;(document.querySelector('[data-lt-notice-anchor]')!.parentElement as HTMLElement).style.display = 'none'
    await settle()
    const fallback = document.querySelector('[data-lt="notice-fallback"]')!
    expect(fallback).not.toBeNull()
    ;(fallback.querySelector('[data-lt="retry"]') as HTMLElement).click()
    expect(actions).toEqual([])
    await view.setProps({ enabled: false })
    await settle()
    expect(document.querySelector('[data-lt="notice-fallback"]')).toBeNull()
  })

  it('舊失敗列、正常上滑離開畫面的卡、平台彈層遮住的卡都不浮出', async () => {
    const view = start(false)
    cover = document.createElement('div'); cover.style.position = 'fixed'; document.body.append(cover)
    await settle()
    expect(document.querySelector('[data-lt="notice-fallback"]')).toBeNull()
    await view.setProps({ enabled: true })
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({ ...box, top: -200, bottom: -100 } as DOMRect)
    cover.className = 'changed'
    await settle()
    expect(document.querySelector('[data-lt="notice-fallback"]')).toBeNull()
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue(box as DOMRect)
    cover.setAttribute('role', 'dialog'); cover.setAttribute('aria-modal', 'true'); cover.className = 'platform-modal'
    await settle()
    expect(document.querySelector('[data-lt="notice-fallback"]')).toBeNull()
  })
  it('重試開始令原slot清空但boundary仍存在時，撤掉恢復副本並解除舊節點inert', async () => {
    start()
    cover = document.createElement('div'); cover.style.position = 'fixed'; document.body.append(cover)
    await settle()
    expect(document.querySelector('[data-lt="notice-fallback"]')).not.toBeNull()
    const source = document.querySelector('[data-lt-notice-anchor]')!.nextElementSibling!
    showNotice.value = false
    await settle()
    expect(document.querySelector('[data-lt="notice-fallback"]')).toBeNull()
    expect(source.hasAttribute('inert')).toBe(false)
  })

})
