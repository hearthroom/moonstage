import { describe, expect, it } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import CanvasModelPanel from '../components/canvas-model-panel.vue'
import ModelSelectPanel from '@/components/model-select/ModelSelectPanel.vue'

/*
  玩家在模型設定裡換了模型或檔位、還沒按確定時，頂欄要寫出「從哪個換到哪個、
  價格變成多少」。沒換就維持原本的一列。
*/
describe('模型設定頂欄：換模型時寫出從哪個換到哪個', () => {
  const mount = () => shallowMount(CanvasModelPanel, {
    props: {
      open: true, selectedValue: 'opus', modelName: 'Claude Opus 5.5 · 凌波', scoreText: '331–375',
      scoreLabel: '下一輪約 331–375', contextValue: 1,
      labels: { close: 'x', done: 'ok', perTurn: '/次', switchTo: '改成' },
    },
  })

  it('沒換的時候只有原本那一列', async () => {
    const w = mount()
    w.findComponent(ModelSelectPanel).vm.$emit('draft', { value: 'opus', name: 'Claude Opus 5.5 · 凌波', price: '下一輪約 331–375', context: 1 })
    await w.vm.$nextTick()
    expect(w.find('.mp-info-bar').classes()).not.toContain('is-switching')
    expect(w.find('.mp-info-bar').text()).toContain('下一輪約 331–375')
  })

  it('換了模型：原本的劃掉，箭頭指向新的模型與新價格', async () => {
    const w = mount()
    w.findComponent(ModelSelectPanel).vm.$emit('draft', { value: 'ling', name: 'Ling 3.0 Flash · Novita AI', price: '下一輪約 38–52', context: 1 })
    await w.vm.$nextTick()
    expect(w.find('.mp-info-bar').classes()).toContain('is-switching')
    expect(w.find('.mp-info-row.is-was').text()).toContain('Claude Opus 5.5 · 凌波')
    expect(w.find('.mp-info-row.is-was').text()).toContain('下一輪約 331–375')
    expect(w.find('.mp-info-arrow').text()).toContain('改成')
    expect(w.find('.mp-info-row.is-next').text()).toContain('Ling 3.0 Flash · Novita AI')
    expect(w.find('.mp-info-row.is-next').text()).toContain('下一輪約 38–52')
  })

  it('只換了檔位也算換：價格會變', async () => {
    const w = mount()
    w.findComponent(ModelSelectPanel).vm.$emit('draft', { value: 'opus', name: 'Claude Opus 5.5 · 凌波', price: '下一輪約 400–460', context: 3, tier: '128K', fromTier: '64K' })
    await w.vm.$nextTick()
    expect(w.find('.mp-info-row.is-next').text()).toContain('下一輪約 400–460')
    // 模型名一樣，要靠檔位分出前後
    expect(w.find('.mp-info-row.is-was').text()).toContain('64K')
    expect(w.find('.mp-info-row.is-next').text()).toContain('128K')
  })
})

import fs from 'node:fs'
import path from 'node:path'

// 「下一輪約 …」依這段對話目前的長度估，每一輪結束後畫布要重抓一次目錄，
// 不能等玩家重新整理頁面（owner 2026-10-02）。
describe('每輪結束後重抓估價', () => {
  it('回覆結束（生成中 → 不在生成）時重抓模型目錄', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
    const block = src.slice(src.indexOf('watch(() => isGenerating.value, (now, before) => {'))
    expect(block.length).toBeGreaterThan(0)
    expect(block.slice(0, 300)).toMatch(/if \(!before \|\| now\) return[\s\S]*loadModelCatalog\(\)/)
  })
})
