// @vitest-environment jsdom
/**
 * 殼的面板層認得容量選擇：用標準元件畫，選了哪一個照原樣交回宿主（手勢檢查在殼那一層）。
 */
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPanels } from '../render/panels'

describe('面板層：容量選擇', () => {
  it('畫出宿主給的選項，點了把選的那一個交回宿主', async () => {
    document.body.innerHTML = '<div id="m"></div>'
    const sent: Array<[string, string, unknown[]]> = []
    const panels = createPanels({ mount: document.getElementById('m')!, send: (p, e, a) => sent.push([p, e, a]) })
    panels.set({
      sheet: 'capacity', title: '這張卡需要更多容量', closeLabel: '取消', heading: true,
      props: { content: '說明', cancelText: '取消', saving: false, error: '', options: [{ key: 'trim', label: '用目前容量玩', desc: '只帶最重要的設定' }] },
      menu: { open: false, editing: false, draft: '', message: null, actions: [], labels: { cancel: 'Cancel', confirm: 'OK' }, anchor: null },
    })
    await nextTick()
    const row = document.querySelector('.capacity-option') as HTMLElement
    expect(row.textContent).toContain('用目前容量玩')
    row.click()
    expect(sent).toContainEqual(['capacity', 'pick', ['trim']])
    panels.unmount()
  })
})
