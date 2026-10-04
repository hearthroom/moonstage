/**
 * 手帳的長度與「從其他對話複製」。
 *
 * 超過上限時要讓玩家看見超出幾字、自己刪減：輸入框不能帶原生 maxlength，
 * 否則貼上一萬五千字會被瀏覽器默默砍掉五千，而玩家以為存好了。
 * 字數照伺服器的算法（一個字元算一個，emoji 不算兩個），兩邊才不會一邊說超過一邊說沒有。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import CanvasNotepad from '../components/canvas-notepad.vue'
import { notepadLength, notepadSourceRowsOf } from '../canvas-notepad-sources'

const LABELS = {
  title: '手帳', subtitle: '', close: '關閉', save: '儲存', loading: '', loadFailed: '', retry: '',
  placeholder: '', waitingConversation: '', costNotice: '寫得越長越貴', overBy: '超出了',
  templateEntry: '', templateApply: '', templateEmpty: '', templateUntitled: '',
  templateSaveCurrent: '', templateShare: '', templateDelete: '', templateDeleteConfirm: '',
  codePlaceholder: '', codePreview: '', codeMalformed: '', codeChecksum: '',
  cancel: '', importToLibrary: '', shareHint: '', revoke: '', copyCode: '', done: '',
  copyFrom: '', copyEmpty: '', copyPick: '', copyOverwrite: '', copyOverwriteOk: '',
  untitled: '', discardTitle: '', discardOk: '', keepEditing: '',
}

function notepad(extra: Record<string, unknown> = {}) {
  return mount(CanvasNotepad, {
    props: { draft: '', hasConversation: true, maxLength: 10, discountThreshold: 5, labels: LABELS, ...extra },
  })
}

describe('手帳長度', () => {
  it('輸入框沒有原生 maxlength：超過上限的字留著讓玩家自己刪', () => {
    const w = notepad({ draft: '一二三四五六七八九十十一' })
    const area = w.find('textarea.np-textarea')
    expect(area.exists()).toBe(true)
    expect(area.attributes('maxlength')).toBeUndefined()
  })

  it('超過上限：計數與提示出現、儲存停用', () => {
    const w = notepad({ draft: '一二三四五六七八九十十一' })
    const el = w.element as HTMLElement
    expect(el.querySelector('.np-footnote')!.classList.contains('is-over')).toBe(true)
    expect(el.querySelector('.np-count')!.textContent).toBe('12 / 10')
    expect(el.querySelector('.np-hint')!.textContent).toBe('超出了')
    expect(el.querySelector('.np-save-btn')!.classList.contains('is-disabled')).toBe(true)
  })

  it('emoji 算一個字：十個 emoji 剛好在上限內，可以存', () => {
    const w = notepad({ draft: '🌙'.repeat(10) })
    const el = w.element as HTMLElement
    expect(el.querySelector('.np-count')!.textContent).toBe('10 / 10')
    expect(el.querySelector('.np-footnote')!.classList.contains('is-over')).toBe(false)
    expect(el.querySelector('.np-save-btn')!.classList.contains('is-disabled')).toBe(false)
  })

  it('notepadLength 照字元數算', () => {
    expect(notepadLength('')).toBe(0)
    expect(notepadLength('a🌙中')).toBe(3)
  })
})

describe('從其他對話複製的來源', () => {
  const list = [
    { conversationId: 'c-now', conversationRoleId: 'r1', roleName: '月' },
    { conversationId: 'c-old', conversationRoleId: 'r1', roleName: '月' },
    { conversationId: 'c-other', conversationRoleId: 'r2', roleName: '星' },
    { conversationId: '', conversationRoleId: 'r3', roleName: '壞資料' },
  ]

  it('同一張卡的其他存檔也列出來，每段對話各一列，只排除現在這一段', () => {
    const rows = notepadSourceRowsOf(list, 'c-now')
    expect(rows.map((r) => r.key)).toEqual(['c-old', 'c-other'])
    expect(rows.map((r) => r.name)).toEqual(['月', '星'])
  })

  it('還沒有對話時全部都能選', () => {
    expect(notepadSourceRowsOf(list, '').map((r) => r.key)).toEqual(['c-now', 'c-old', 'c-other'])
  })
})
