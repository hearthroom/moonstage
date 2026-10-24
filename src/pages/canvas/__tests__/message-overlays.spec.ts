import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPanels } from '@/sandbox/render/panels'
import type { PanelsState } from '@/sandbox/protocol'
import Menu from '../components/canvas-message-menu.vue'
import Popup from '../components/canvas-popup.vue'
import Confirm from '../components/canvas-confirm.vue'

const mounted: VueWrapper[] = []
afterEach(() => { mounted.splice(0).forEach(w => w.unmount()); document.body.innerHTML = '' })
function background() {
  const el = document.createElement('button'); el.textContent = 'opener'; document.body.append(el); el.focus(); return el
}
async function settle() { await nextTick(); await nextTick() }
function tab(shiftKey = false) { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })) }

describe('message overlay lifecycle', () => {
  it('menu isolates background, enters focus, cycles both directions and restores opener', async () => {
    const opener = background()
    const w = mount(Menu, { attachTo: document.body, props: { open: false, actions: [{ key: 'copy', label: 'Copy' }, { key: 'edit', label: 'Edit' }] } }); mounted.push(w)
    await w.setProps({ open: true }); await settle()
    const actions = w.findAll('.msg-options-box [role=button]')
    expect(document.activeElement).toBe(actions[0].element)
    expect(opener.hasAttribute('inert')).toBe(true)
    expect(opener.getAttribute('aria-hidden')).toBe('true')
    tab(true); expect(document.activeElement).toBe(actions[1].element)
    tab(); expect(document.activeElement).toBe(actions[0].element)
    await w.setProps({ editing: true }); await settle()
    expect(document.activeElement).toBe(w.find('textarea').element)
    const ok = w.find('.ok-btn').element as HTMLElement; ok.focus(); tab(); expect(document.activeElement).toBe(w.find('textarea').element)
    await w.setProps({ open: false, editing: false }); await settle()
    expect(document.activeElement).toBe(opener)
    expect(opener.hasAttribute('inert')).toBe(false)
    expect(opener.hasAttribute('aria-hidden')).toBe(false)
  })
  it('confirmation popup focuses cancel, traps Tab and Escape closes once', async () => {
    const opener = background()
    const w = mount(Popup, { attachTo: document.body, props: { open: false }, slots: { default: Confirm } }); mounted.push(w)
    await w.setProps({ open: true }); await settle()
    expect(document.activeElement).toBe(w.find('.cancel-btn').element)
    expect(opener.hasAttribute('inert')).toBe(true)
    tab(); expect(document.activeElement).toBe(w.find('[aria-label="Close"]').element)
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(w.emitted('close')).toHaveLength(1)
    await w.setProps({ open: false }); await settle()
    expect(document.activeElement).toBe(opener)
  })
  it('sandbox menu to confirmation transition keeps the new dialog operable and restores focus', async () => {
    const opener = background()
    const shell = document.createElement('div'); document.body.append(shell)
    const panels = createPanels({ mount: shell, send: () => {} })
    const base: PanelsState = { sheet: '', title: 'Confirm', closeLabel: 'Close', props: {}, menu: { open: false, editing: false, draft: '', message: null, actions: [{ key: 'rewrite', label: 'Rewrite' }], labels: { cancel: 'Cancel', confirm: 'OK' }, anchor: null } }
    panels.set({ ...base, menu: { ...base.menu, open: true } }); await settle()
    expect(document.activeElement).toBe(shell.querySelector('.lt-option-rewrite'))
    panels.set({ ...base, sheet: 'confirm', props: { content: 'Continue?' } }); await settle()
    expect(document.activeElement).toBe(shell.querySelector('.confirm-scope .cancel-btn'))
    expect(document.activeElement!.closest('[inert]')).toBeNull()
    expect(opener.hasAttribute('inert')).toBe(true)
    panels.set(base); await settle()
    expect(document.activeElement).toBe(opener)
    panels.unmount(); shell.remove()
  })
  it('unmount releases isolation and preserves pre-existing aria-hidden and inert', async () => {
    const opener = background(); opener.setAttribute('aria-hidden', 'false')
    const prior = document.createElement('div'); prior.setAttribute('inert', ''); prior.setAttribute('aria-hidden', 'true'); document.body.append(prior)
    const w = mount(Menu, { attachTo: document.body, props: { open: true, actions: [{ key: 'copy', label: 'Copy' }] } }); mounted.push(w)
    await settle(); expect(opener.getAttribute('aria-hidden')).toBe('true')
    w.unmount(); mounted.pop()
    expect(opener.getAttribute('aria-hidden')).toBe('false'); expect(opener.hasAttribute('inert')).toBe(false)
    expect(prior.hasAttribute('inert')).toBe(true); expect(prior.getAttribute('aria-hidden')).toBe('true')
  })
})
