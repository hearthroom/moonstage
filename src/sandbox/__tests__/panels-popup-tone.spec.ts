import { expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPanels } from '../render/panels'
import type { PanelsState } from '../protocol'

it('measures a new confirmation action when sandbox changes sheets without closing the popup', async () => {
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const panels = createPanels({ mount, send() {} })
  const menu: PanelsState['menu'] = { open: false, editing: false, draft: '', message: null, actions: [], labels: { cancel: 'Cancel', confirm: 'OK' }, anchor: null }
  try {
    panels.set({ sheet: 'conversations', title: 'Archives', closeLabel: 'Close', props: {}, menu })
    await nextTick(); await nextTick()
    const popup = mount.querySelector('.u-popup')
    expect(popup?.getAttribute('data-open')).toBe('on')
    panels.set({ sheet: 'confirm', title: 'Delete archive?', closeLabel: 'Close', heading: true, props: { content: 'Synthetic confirmation', okText: 'Delete', cancelText: 'Cancel' }, menu })
    await nextTick(); await nextTick()
    expect(mount.querySelector('.u-popup')).toBe(popup)
    const ok = mount.querySelector('.confirm-bottom .ok-btn')
    expect(ok?.textContent).toBe('Delete')
    expect(ok?.getAttribute('data-lt-tone')).toMatch(/^(light|dark)$/)
    expect(ok?.getAttribute('data-lt-contrast')).toMatch(/^(normal|high)$/)
  } finally { panels.unmount(); mount.remove() }
})
