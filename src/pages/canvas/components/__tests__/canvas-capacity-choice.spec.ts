// @vitest-environment jsdom
/**
 * 容量選擇的彈層：畫出宿主給的選項（一個或兩個），點了回報是哪一個；存檔中不接受第二次點擊；
 * 存失敗的原因留在彈層裡（沙箱卡看不到宿主的提示）。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasCapacityChoice from '../canvas-capacity-choice.vue'

const options = [
  { key: 'raise', label: '調到 128K', desc: '保留完整設定' },
  { key: 'trim', label: '用目前容量玩', desc: '只帶最重要的設定' },
]

describe('容量選擇彈層', () => {
  it('畫出每一個選項，點了回報是哪一個', async () => {
    const w = mount(CanvasCapacityChoice, { props: { content: '說明', options, cancelText: '取消' } })
    const rows = w.findAll('.capacity-option')
    expect(rows.map((r) => r.find('.capacity-option-label').text())).toEqual(['調到 128K', '用目前容量玩'])
    expect(rows[0].classes()).toContain('is-primary')
    await rows[1].trigger('click')
    expect(w.emitted('pick')).toEqual([['trim']])
    await w.find('.capacity-cancel').trigger('click')
    expect(w.emitted('cancel')).toHaveLength(1)
  })

  it('只有一個選項時只畫那一個', () => {
    const w = mount(CanvasCapacityChoice, { props: { content: '說明', options: [options[1]], cancelText: '取消' } })
    expect(w.findAll('.capacity-option')).toHaveLength(1)
  })

  it('存檔中不接受點擊；存失敗的原因顯示在彈層裡', async () => {
    const w = mount(CanvasCapacityChoice, { props: { content: '說明', options, cancelText: '取消', saving: true, error: '沒有存起來' } })
    await w.findAll('.capacity-option')[0].trigger('click')
    expect(w.emitted('pick')).toBeUndefined()
    expect(w.find('.capacity-error').text()).toBe('沒有存起來')
  })
})
