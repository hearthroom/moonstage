// @vitest-environment jsdom
/**
 * 人設彈層的三檔：僅使用稱呼只留名字欄；全局那檔編輯的是帳號那份、存出去帶 personaMode=global；
 * 單獨那檔編輯的是這張卡自己那份。切來切去，各自的草稿都還在。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasPersona from '../canvas-persona.vue'

const labels = {
  title: '用戶人設', cancel: '取消', save: '確定',
  modeLabel: '人設來源', modeNameOnly: '僅使用稱呼', modeGlobal: '全局人設', modeCustom: '單獨設置',
  modeNameOnlyHint: '只帶名字', modeGlobalHint: '到處生效', modeCustomHint: '只在這張卡', nickNameHint: '沒填就用你的暱稱：阿強',
  nameLabel: 'AI 怎麼稱呼你', namePlaceholder: '例如：小明', sexLabel: '性別',
  defineLabel: '你想讓 AI 知道的事', definePlaceholder: '', sandboxLabel: '沙盒', sandboxDesc: '',
  advanced: '進階', jailbreakLabel: '', jailbreakHint: '', jailbreakReset: '',
}
const sexOptions = [{ value: 'man', label: '男' }, { value: 'women', label: '女' }]

function mountPersona(props: Record<string, unknown> = {}) {
  return mount(CanvasPersona, {
    props: {
      labels, sexOptions, sandboxOptions: [],
      personaMode: 'custom', userName: '桐人', userSex: 'man', userDefine: '卡片專用',
      globalPersona: { userName: '阿強', userSex: 'women', userDefine: '全局的' },
      nickName: '阿強',
      ...props,
    },
  })
}
const modeButton = (w: ReturnType<typeof mountPersona>, text: string) =>
  w.findAll('.mode-item').find((n) => n.text() === text)!

describe('人設彈層', () => {
  it('單獨設置：欄位是這張卡的；存出去帶 custom', async () => {
    const w = mountPersona()
    expect(w.find('.mode-item.selected').text()).toBe('單獨設置')
    expect(w.find('.gender-box').exists()).toBe(true)
    await w.find('.complete-btn').trigger('click')
    const saved = w.emitted('save')![0][0] as any
    expect(saved.personaMode).toBe('custom')
    expect(saved.userName).toBe('桐人')
    expect(saved.userDefine).toBe('卡片專用')
  })

  it('切到全局：欄位換成帳號那份；存出去帶 global 與全局的內容', async () => {
    const w = mountPersona()
    await modeButton(w, '全局人設').trigger('click')
    await w.find('.complete-btn').trigger('click')
    const saved = w.emitted('save')![0][0] as any
    expect(saved.personaMode).toBe('global')
    expect(saved.userName).toBe('阿強')
    expect(saved.userSex).toBe('women')
    expect(saved.userDefine).toBe('全局的')
  })

  it('僅使用稱呼：性別與自我介紹不畫；沒填稱呼時提示會用暱稱', async () => {
    const w = mountPersona({ personaMode: 'name_only', userName: '' })
    expect(w.find('.gender-box').exists()).toBe(false)
    expect(w.find('.textarea-wrapper:not(.advanced-body)').exists()).toBe(false)
    expect(w.find('.nick-hint').text()).toContain('阿強')
    await w.find('.complete-btn').trigger('click')
    const saved = w.emitted('save')![0][0] as any
    expect(saved.personaMode).toBe('name_only')
    expect(saved.userName).toBe('')
  })

  it('切來切去各自的草稿都還在', async () => {
    const w = mountPersona()
    await modeButton(w, '全局人設').trigger('click')
    await modeButton(w, '單獨設置').trigger('click')
    await w.find('.complete-btn').trigger('click')
    const saved = w.emitted('save')![0][0] as any
    expect(saved.userName).toBe('桐人')
  })
})
