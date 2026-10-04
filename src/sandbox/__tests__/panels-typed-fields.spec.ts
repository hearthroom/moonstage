// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPanels, type PanelsController } from '../render/panels'
import type { PanelsState } from '../protocol'

/*
  沙箱卡的面板畫在殼裡，打字欄位的每一次輸入要以 panel.ui 交回宿主；宿主存檔時送的是它自己那份草稿。
  2026-10-04 玩家回報：手帳在沙箱卡上「存了、關掉再開是空白」。伺服器日誌顯示 save 收到的就是空字串——
  殼把 update:draft 這類帶冒號的事件名拼成 onUpdateDraft，Vue 找的是 onUpdate:draft，字從來沒送出殼。
  一般卡沒事（面板由宿主自己畫），所以在一般卡上重現不出來。
*/

const base: PanelsState = {
  sheet: '',
  title: '',
  closeLabel: 'Close',
  props: {},
  menu: { open: false, editing: false, draft: '', message: null, actions: [], labels: { cancel: 'Cancel', confirm: 'OK' }, anchor: null },
}

let mount: HTMLElement | null = null
let panels: PanelsController | null = null

afterEach(() => {
  panels?.unmount()
  mount?.remove()
  panels = null
  mount = null
})

async function open(sheet: string, props: Record<string, unknown>) {
  mount = document.createElement('div')
  document.body.appendChild(mount)
  const send = vi.fn()
  panels = createPanels({ mount, send })
  panels.set({ ...base, sheet, props })
  await nextTick()
  return send
}

function type(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('殼裡面板的打字欄位：每一次輸入都要交回宿主', () => {
  it('手帳：打字送 notepad update:draft，而且殼自己留一份草稿', async () => {
    const send = await open('notepad', { draft: '', savedContent: '', hasConversation: true })
    const ta = mount!.querySelector<HTMLTextAreaElement>('textarea.np-textarea')
    expect(ta).toBeTruthy()
    type(ta!, '主角叫小明')
    expect(send).toHaveBeenCalledWith('notepad', 'update:draft', ['主角叫小明'])
    // 宿主把同一個值回音回來，殼保留自己那份；textarea 不會被清掉
    panels!.set({ ...base, sheet: 'notepad', props: { draft: '主角叫小明', savedContent: '', hasConversation: true } })
    await nextTick()
    expect(ta!.value).toBe('主角叫小明')
  })

  it('長期指令：新增草稿與編輯中的字都送回宿主（事件名裡同時有冒號與連字號）', async () => {
    const send = await open('directives', {
      list: [{ sourceId: 's1', text: '舊的', type: 'manual', origin: 'manual', turn: 1, status: 'active' }],
      hasConversation: true, canAdd: true, draft: '', editingSourceId: 's1', editingText: '舊的',
    })
    const editing = mount!.querySelector<HTMLTextAreaElement>('textarea.custom-textarea-box')
    const draft = mount!.querySelector<HTMLTextAreaElement>('textarea.custom-textarea')
    expect(editing).toBeTruthy()
    expect(draft).toBeTruthy()
    type(editing!, '改過的')
    expect(send).toHaveBeenCalledWith('directives', 'update:editing-text', ['改過的'])
    type(draft!, '新指令')
    expect(send).toHaveBeenCalledWith('directives', 'update:draft', ['新指令'])
  })

  it('沒有冒號的事件照常轉給宿主（不是只修冒號、弄壞別的）', async () => {
    const send = await open('notepad', { draft: '', savedContent: '', hasConversation: true })
    const save = mount!.querySelector<HTMLElement>('.np-save-btn')
    expect(save).toBeTruthy()
    save!.click()
    expect(send).toHaveBeenCalledWith('notepad', 'save', [])
  })
})
