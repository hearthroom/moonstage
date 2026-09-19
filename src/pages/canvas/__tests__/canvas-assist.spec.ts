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
