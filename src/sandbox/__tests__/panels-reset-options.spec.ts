import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPanels } from '../render/panels'

describe('sandbox reset choices', () => {
  it('forwards the checkbox event from the shared confirm component', async () => {
    document.body.innerHTML = '<div id="reset-panel"></div>'
    const sent: unknown[] = []
    const panels = createPanels({ mount: document.getElementById('reset-panel')!, send: (panel, event, args) => sent.push([panel, event, args]) })
    panels.set({
      sheet: 'confirm', title: 'Reset', heading: true, closeLabel: 'Cancel',
      props: { optionsTitle: 'Also clear', optionsHint: 'Unchecked is kept', options: [{ key: 'clearNotepad', label: 'Notepad', checked: false }] },
      menu: { open: false, editing: false, draft: '', message: null, actions: [], labels: { cancel: 'Cancel', confirm: 'OK' }, anchor: null },
    })
    await nextTick()
    const checkbox = document.querySelector('[role=checkbox]') as HTMLElement
    expect(checkbox.getAttribute('aria-checked')).toBe('false')
    checkbox.click()
    expect(sent).toContainEqual(['confirm', 'toggle-option', ['clearNotepad']])
    panels.unmount()
  })
})
