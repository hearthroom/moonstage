import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasDirectives from '../components/canvas-directives.vue'

describe('長指令的多行編輯', () => {
  it('編輯列給輸入區完整欄寬，新增與編輯都隨內容長高且保留原字數上限', async () => {
    const text = '這是合成的長指令。'.repeat(25).slice(0, 200)
    const w = mount(CanvasDirectives, { props: {
      list: [{ sourceId: 's1', text, origin: 'manual', status: 'active' }],
      editingSourceId: 's1', editingText: text, draft: text, maxLength: 200,
    } })
    expect(w.find('.item').classes()).toContain('is-editing')
    const fields = w.findAllComponents({ name: 'CanvasTextField' })
    expect(fields).toHaveLength(2)
    for (const field of fields) expect(field.props('autoGrow')).toBe(true)
    for (const field of w.findAll('textarea')) expect(field.attributes('maxlength')).toBe('200')
    await w.find('.item textarea').setValue('修改後')
    expect(w.emitted('update:editing-text')?.[0]).toEqual(['修改後'])
    await w.find('.item .right .ci-btn').trigger('click')
    expect(w.emitted('cancel-edit')).toHaveLength(1)
    w.unmount()
  })
})
