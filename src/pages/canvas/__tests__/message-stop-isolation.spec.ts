import { afterEach, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import Composer from '../components/canvas-composer.vue'
import Menu from '../components/canvas-message-menu.vue'
let mounted: VueWrapper[] = []
afterEach(() => { mounted.forEach(w => w.unmount()); mounted = []; document.body.innerHTML = '' })
it('keeps the active stop control operable and in the modal keyboard cycle while isolating other composer controls', async () => {
 const composer = mount(Composer, { attachTo: document.body, props: { generating: true, value: '', placeholder: '', sendState: 'send' } }); mounted.push(composer)
 const menu = mount(Menu, { attachTo: document.body, props: { open: true, actions: [{ key: 'copy', label: 'Copy' }] } }); mounted.push(menu)
 await nextTick(); await nextTick()
 const stop = composer.get('#mes_stop').element as HTMLElement
 expect(stop.closest('[inert]')).toBeNull()
 expect(stop.closest('[aria-hidden=true]')).toBeNull()
 expect(composer.get('.chat-bottom').element.closest('[inert]')).toBeTruthy()
 await composer.setProps({ generating: false }); await nextTick(); await nextTick()
 expect(stop.closest('[inert]')).toBeTruthy()
 await composer.setProps({ generating: true }); await nextTick(); await nextTick()
 expect(stop.closest('[inert]')).toBeNull()
 const action = menu.get('[data-lt-action=copy]').element as HTMLElement
 action.focus(); action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
 expect(document.activeElement).toBe(stop)
 stop.click(); expect(composer.emitted('stop')).toHaveLength(1)
})
it('excludes the hidden sandbox host composer stop from the modal Tab cycle', async () => {
 const hiddenHost = document.createElement('div'); hiddenHost.style.display = 'none'; document.body.append(hiddenHost)
 const composer = mount(Composer, { attachTo: hiddenHost, props: { generating: true, value: '', placeholder: '', sendState: 'send' } }); mounted.push(composer)
 const menu = mount(Menu, { attachTo: document.body, props: { open: true, actions: [{ key: 'copy', label: 'Copy' }] } }); mounted.push(menu)
 await nextTick(); await nextTick()
 const action = menu.get('[data-lt-action=copy]').element as HTMLElement
 action.focus(); action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
 expect(document.activeElement).toBe(action)
 expect(hiddenHost.hasAttribute('inert')).toBe(true)
})
