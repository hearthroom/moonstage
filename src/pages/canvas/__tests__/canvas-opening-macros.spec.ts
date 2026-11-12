import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import OpeningPage from '../components/canvas-opening-page.vue'

describe('一般頁的網頁開局', () => {
  it('帶入既有解析好的稱呼，晚到／切換人設也會更新', async () => {
    const html = '<p>{{user}} / {{char}}</p>'
    const wrapper = mount(OpeningPage, { attachTo: document.body, props: { html, macros: { user: '帳號暱稱', char: '星' } } })
    const frame = wrapper.find('iframe').element as HTMLIFrameElement
    expect(frame.srcdoc).toContain('"user":"帳號暱稱","char":"星"')
    const before = frame.srcdoc
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    await wrapper.setProps({ macros: { user: '人設暱稱', char: '星' } })
    expect(post).toHaveBeenCalledWith({ type: 'hearthroom:opening-macros', macros: { user: '人設暱稱', char: '星' } }, '*')
    expect(frame.srcdoc).toBe(before)
    expect(wrapper.props('html')).toBe(html)
    wrapper.unmount()
  })
})
