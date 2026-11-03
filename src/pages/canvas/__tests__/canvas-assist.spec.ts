/**
 * 幫答（.ai-assistant）：AI 替玩家寫下一句，只填進輸入框、由玩家送出。
 *
 * owner 2026-09-04 採納作者建議；跟開場選項同一條規矩——畫布上所有「替玩家準備
 * 一句話」的東西都不代送。DOM 照 MMD：.ai-assistant > .tooltip(.tooltip-arrow) + 圖示 + .beta-badge。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import CanvasComposer from '../components/canvas-composer.vue'
import CanvasAssist from '../components/canvas-assist.vue'

function mountComposer(extra: Record<string, unknown> = {}) {
  return mount(CanvasComposer, {
    props: { value: '', placeholder: 'x', sendState: 'send', generating: false, assistCost: 10, ...extra },
  })
}

describe('幫答鍵', () => {
  it('結構照 MMD：.ai-assistant 裡有 .tooltip + .tooltip-arrow + .beta-badge（顯示點數）', () => {
    const el = mountComposer().element as HTMLElement
    const btn = el.querySelector('.ai-assistant')!
    expect(btn).toBeTruthy()
    expect(btn.querySelector('.tooltip')).toBeTruthy()
    expect(btn.querySelector('.tooltip .tooltip-arrow')).toBeTruthy()
    expect(btn.querySelector('.beta-badge')!.textContent).toBe('10')
    // 幫答鍵不是送出鍵：卡片腳本抓 .send-msg .btn-icon 時不能抓到它
    expect(btn.classList.contains('btn-icon')).toBe(false)
  })

  it('點了送出 assist 事件；進行中再點不重複送', async () => {
    const wrapper = mountComposer()
    ;(wrapper.element.querySelector('.ai-assistant') as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('assist')).toHaveLength(1)
    expect(wrapper.emitted('send')).toBeFalsy()

    const busy = mountComposer({ assistBusy: true })
    ;(busy.element.querySelector('.ai-assistant') as HTMLElement).click()
    await busy.vm.$nextTick()
    expect(busy.emitted('assist')).toBeFalsy()
    expect(busy.element.querySelector('.ai-assistant')!.classList.contains('is-busy')).toBe(true)
  })

  it('候選按鈕只發出選取事件，生成需獨立確認', async () => {
    const wrapper=mount(CanvasAssist,{props:{choices:['First','Second','Third'],busy:false,confirming:false,error:'',labels:{hint:'Choose',refresh:'Refresh'}}})
    await wrapper.findAll('.assist-choice')[1].trigger('click')
    expect(wrapper.emitted('pick')).toEqual([[1]])
    expect(wrapper.emitted('send')).toBeFalsy()
    await wrapper.find('.assist-refresh').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeFalsy()
  })
  it('頁面及沙箱走同一面板，選取只填草稿', () => {
    const page=readFileSync(resolve(__dirname,'../canvas.vue'),'utf8')
    expect(page).toContain('fillComposer(text); closeCanvasSheet()')
    expect(page).toContain('count: 3')
    expect(page).not.toContain('shouldRegenerateAssist(')
    const panels=readFileSync(resolve(__dirname,'../../../sandbox/render/panels.ts'),'utf8')
    expect(panels).toContain('assist: CanvasAssist')
    expect(panels).toContain("assist: ['confirm','cancel','refresh','pick']")
  })
})

// 沙箱殼裡照 MMD 寫的卡會直接改這顆節點（藏起來、在旁邊插自己的鈕）。唯讀或關掉幫答時節點若被拿掉，
// 回來的是一顆新節點：作者的 inline 樣式不見，平台燈泡又冒出來；唯讀時才跑的卡腳本則找不到它。
describe('幫答鍵：沙箱殼裡節點常駐', () => {
  it('chat 模式唯讀／關閉時節點仍在、標 is-off 且點了不動作；恢復後是同一顆節點，作者的 inline 樣式還在', async () => {
    const wrapper = mountComposer({ chat: true, readOnly: true })
    const btn = wrapper.element.querySelector<HTMLElement>('[data-chat="assistant"]')
    expect(btn).not.toBeNull()
    expect(btn!.classList.contains('is-off')).toBe(true)
    btn!.style.setProperty('display', 'none', 'important')
    btn!.click()
    expect(wrapper.emitted('assist')).toBeUndefined()
    await wrapper.setProps({ readOnly: false })
    expect(wrapper.element.querySelector('[data-chat="assistant"]')).toBe(btn)
    expect(btn!.classList.contains('is-off')).toBe(false)
    expect(btn!.style.getPropertyPriority('display')).toBe('important')
    await wrapper.setProps({ assistEnabled: false })
    expect(wrapper.element.querySelector('[data-chat="assistant"]')).toBe(btn)
    btn!.click()
    expect(wrapper.emitted('assist')).toBeUndefined()
  })

  it('一般畫布維持原狀：唯讀時沒有這顆節點', () => {
    const wrapper = mountComposer({ readOnly: true })
    expect(wrapper.element.querySelector('.ai-assistant')).toBeNull()
  })

  it('is-off 在 lt-base 層藏起來（class 的 display 會蓋過 [hidden]，所以用 class）', () => {
    const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')
    expect(css).toMatch(/\.ai-assistant\.is-off\s*\{\s*display:\s*none;/)
  })
})
