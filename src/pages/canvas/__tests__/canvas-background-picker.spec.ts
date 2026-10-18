/**
 * 更換背景選單（美術方向 2026-10-18；PM 修訂：自訂圖片留到玩家換新圖或自己刪）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasBackgroundPicker from '../components/canvas-background-picker.vue'

const labels = {
  title: 'T', hint: 'H', optionOriginal: 'O', optionBlur: 'B', optionSolid: 'S', optionCustom: 'C',
  replace: 'Replace', remove: 'Delete', uploading: 'Up', customHint: 'h1', uploadLimit: 'h2', signIn: 'Sign in',
  saveError: 'E', retry: 'R',
}
const rows = (w: any) => w.findAll('.bg-picker-item')

describe('canvas-background-picker', () => {
  it('切到別的選項後，自訂列的預覽仍是玩家的圖；再點就直接用它，不開選檔', async () => {
    const w = mount(CanvasBackgroundPicker, { props: { labels, mode: 'color', color: '#16191E', customUrl: 'https://cdn/mine.jpg' } })
    const custom = rows(w)[3]
    expect(custom.find('.bg-picker-swatch').attributes('style')).toContain('https://cdn/mine.jpg')
    await custom.trigger('click')
    expect(w.emitted('pick')).toEqual([['custom']])
  })

  it('自訂展開區有「更換圖片」和「刪除圖片」，刪除不跳確認、直接發事件', async () => {
    const w = mount(CanvasBackgroundPicker, { props: { labels, mode: 'custom', customUrl: 'https://cdn/mine.jpg' } })
    expect(w.find('.bg-picker-replace').text()).toBe('Replace')
    await w.find('.bg-picker-remove').trigger('click')
    expect(w.emitted('delete')).toHaveLength(1)
  })

  it('上傳中不給刪除', () => {
    const w = mount(CanvasBackgroundPicker, { props: { labels, mode: 'custom', customUrl: 'https://cdn/mine.jpg', uploading: true } })
    expect(w.find('.bg-picker-remove').exists()).toBe(false)
  })

  it('沒有自訂圖時，點自訂列是開選檔（不發 pick）；不能上傳時顯示要登入', async () => {
    const w = mount(CanvasBackgroundPicker, { props: { labels, mode: 'card', canUpload: false } })
    await rows(w)[3].trigger('click')
    expect(w.emitted('pick')).toBeUndefined()
    expect(w.text()).toContain('Sign in')
  })

  it('不用 uni 會改寫的 <button>／<input>', () => {
    const w = mount(CanvasBackgroundPicker, { props: { labels, mode: 'color', color: '#16191E', colors: [{ value: '#16191E', label: 'Ink' }] } })
    expect(w.find('button').exists()).toBe(false)
    expect(w.find('input').exists()).toBe(false)
  })

  it('選單根節點帶畫面語言：沙盒殼的 html lang 固定，韓文斷行規則要掛在選單上', () => {
    const w = mount(CanvasBackgroundPicker, { props: { labels, lang: 'ko' } })
    expect(w.find('.bg-picker-scope').attributes('lang')).toBe('ko')
  })
})
