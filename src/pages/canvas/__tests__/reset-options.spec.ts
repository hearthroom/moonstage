import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasConfirm from '../components/canvas-confirm.vue'
import { createBackwardOperationEntry, normalizeBackwardOperationEntry } from '../chat-operation-ui-state'

describe('reset choices', () => {
  it('renders controlled checkboxes and sends keyboard and pointer changes', async () => {
    const wrapper = mount(CanvasConfirm, { props: {
      content: 'Reset the story', optionsTitle: 'Also clear', optionsHint: 'Unchecked is kept',
      options: [{ key: 'clearNotepad', label: 'Notepad', checked: false }, { key: 'clearDirectives', label: 'Instructions', checked: true }],
    } })
    const checks = wrapper.findAll('[role=checkbox]')
    expect(checks).toHaveLength(2)
    expect(checks[0].attributes('aria-checked')).toBe('false')
    expect(checks[1].attributes('aria-checked')).toBe('true')
    await checks[0].trigger('click')
    await checks[1].trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('toggle-option')).toEqual([['clearNotepad'], ['clearDirectives']])
    expect(wrapper.text()).toContain('Unchecked is kept')
  })
  it('keeps all choices across persisted retries and reloads', () => {
    const base = createBackwardOperationEntry({ conversationId: 'c', operationId: 'reset-1', targetChatId: 'reset', now: 100 })
    const entry = { ...base, resetOptions: { clearNotepad: true, clearDirectives: false, clearResponseSettings: true } }
    expect(normalizeBackwardOperationEntry(JSON.parse(JSON.stringify(entry)), 'c', 110)).toMatchObject(entry)
    expect(normalizeBackwardOperationEntry({ ...entry, resetOptions: { clearNotepad: 'false' } }, 'c', 110)).toBeNull()
  })
})
