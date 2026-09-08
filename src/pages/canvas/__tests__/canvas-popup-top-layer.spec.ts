/**
 * 系統彈層要在最上層——用瀏覽器的 top layer（popover），不是比 z-index。
 *
 * 舞台的樣式整份包在 @layer 裡、刻意輸給卡片；卡片又常把 `position: fixed` 的面板寫成
 * `z-index: 2147483647 !important`。結果是模型設定一打開，卡片的行動選項、場景卡蓋在
 * 它上面（owner 2026-09-08 手機與桌機截圖）。z-index 這場比賽舞台注定輸，
 * popover 的 top layer 不看 z-index，卡片再大的數字也壓不到它。
 *
 * 停止鍵（I-2：生成中永遠按得到）原本靠 z-index 60 浮在彈層之上；彈層進了 top layer
 * 之後它也得進去，而且要排在彈層後面（top layer 後進者在上）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CanvasPopup from '../components/canvas-popup.vue'
import CanvasComposer from '../components/canvas-composer.vue'

const calls: string[] = []
const openSet = new WeakSet<Element>()

beforeEach(() => {
  calls.length = 0
  Object.defineProperty(HTMLElement.prototype, 'showPopover', {
    configurable: true,
    value(this: HTMLElement) { openSet.add(this); calls.push(`show:${this.id || this.className.split(' ')[0]}`) },
  })
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
    configurable: true,
    value(this: HTMLElement) { openSet.delete(this); calls.push(`hide:${this.id || this.className.split(' ')[0]}`) },
  })
  // jsdom 不認 :popover-open，用我們自己記的集合代替
  const matches = Element.prototype.matches
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, sel: string) {
    if (sel === ':popover-open') return openSet.has(this)
    return matches.call(this, sel)
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  delete (HTMLElement.prototype as any).showPopover
  delete (HTMLElement.prototype as any).hidePopover
})

describe('系統彈層走 top layer', () => {
  it('殼是 manual popover：開就 showPopover、關就 hidePopover', async () => {
    const w = mount(CanvasPopup, { props: { open: false, title: '模型設定' }, attachTo: document.body })
    expect(w.find('.u-popup').attributes('popover')).toBe('manual')
    await w.setProps({ open: true })
    await nextTick()
    expect(calls).toEqual(['show:u-popup'])
    await w.setProps({ open: false })
    await nextTick()
    expect(calls).toEqual(['show:u-popup', 'hide:u-popup'])
    w.unmount()
  })

  it('停止鍵在生成中也進 top layer；彈層打開時把它重新抬到最上面', async () => {
    const composer = mount(CanvasComposer, {
      props: { value: '', placeholder: '', sendState: 'send', generating: true },
      attachTo: document.body,
    })
    await nextTick()
    const stop = document.getElementById('mes_stop')!
    expect(stop.getAttribute('popover')).toBe('manual')
    expect(calls).toEqual(['show:mes_stop'])

    const popup = mount(CanvasPopup, { props: { open: true, title: '模型設定' }, attachTo: document.body })
    await nextTick()
    // 彈層先進 top layer，停止鍵再進一次——後進者在上，停止鍵仍然按得到
    expect(calls).toEqual(['show:mes_stop', 'show:u-popup', 'hide:mes_stop', 'show:mes_stop'])

    await composer.setProps({ generating: false })
    await nextTick()
    expect(calls.at(-1)).toBe('hide:mes_stop')
    popup.unmount()
    composer.unmount()
  })

  it('沒有 popover API 的瀏覽器照舊：不丟錯', async () => {
    delete (HTMLElement.prototype as any).showPopover
    delete (HTMLElement.prototype as any).hidePopover
    const w = mount(CanvasPopup, { props: { open: true, title: '模型設定' }, attachTo: document.body })
    await nextTick()
    expect(w.find('.u-popup').attributes('data-open')).toBe('on')
    w.unmount()
  })
})
