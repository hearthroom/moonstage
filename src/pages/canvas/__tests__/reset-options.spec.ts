import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
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

it('resets on the first confirmation even when a fresh conversation has no history snapshot yet', async () => {
  const source = readFileSync('src/pages/canvas/canvas.vue', 'utf8')
  const fn = source.match(/(?:async )?function resetConversation\(\) \{[\s\S]*?\n\}/)![0]
  const snapshot = { value: null as any }, post = vi.fn()
  const choices = { clearNotepad: true, clearDirectives: false, clearResponseSettings: false }
  const deps = {
    unref: (x: any) => x.value, conversationId: { value: 'c' },
    stopRunningTurnForTimelineMutation: () => true, readPendingBackwardOperation: () => null,
    backwardHistorySnapshot: snapshot, rollbackPending: { value: false },
    resetChoices: { value: choices }, createBackwardOperationEntry,
    writePendingBackwardOperation: () => true, postPendingBackwardOperation: post,
    ajax: { value: {} }, getHistoryMsg: vi.fn(), t: (key: string) => key,
    uni: { showToast: vi.fn() }, message: { error: vi.fn() },
    _this: { requestUrl: { historyMessageList: '/messages' }, http: { get: async () => ({ statusCode: 200, data: { historyEpoch: 0, nextSeq: 2 } }) } },
    applyBackwardHistorySnapshot: (data: any) => { snapshot.value = { conversationId: 'c', ...data } },
  }
  const pending = new Function('deps', `const { ${Object.keys(deps).join(',')} } = deps; return (${fn})()`)(deps)
  deps.resetChoices.value = { clearNotepad: false, clearDirectives: false, clearResponseSettings: true }
  await pending
  expect(post).toHaveBeenCalledOnce()
  expect(post.mock.calls[0][0].resetOptions).toEqual(choices)
})
