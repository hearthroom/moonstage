import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

type Entry = { root: HTMLElement; focus: () => void; backgroundOnly: boolean }
type State = { stack: Entry[]; saved: Map<Element, [string | null, string | null]> }
const states = new WeakMap<Document, State>()

function stateFor(doc: Document): State {
  let state = states.get(doc)
  if (!state) { state = { stack: [], saved: new Map() }; states.set(doc, state) }
  return state
}

function restoreBackground(state: State) {
  for (const [el, [inert, hidden]] of state.saved) {
    if (inert === null) el.removeAttribute('inert'); else el.setAttribute('inert', inert)
    if (hidden === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', hidden)
  }
  state.saved.clear()
}

function syncBackground(state: State) {
  restoreBackground(state)
  const root = state.stack.at(-1)?.root
  // Isolate siblings along the whole ancestor path, including the embedding site's chrome.
  // Never hide an ancestor of the dialog itself from assistive technology.
  for (let branch: Element | undefined = root; branch?.parentElement; branch = branch.parentElement) {
    for (const el of branch.parentElement.children) {
      if (el === branch || ['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)) continue
      state.saved.set(el, [el.getAttribute('inert'), el.getAttribute('aria-hidden')])
      el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true')
    }
    if (branch.parentElement === root?.ownerDocument.body) break
  }
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [tabindex]')).filter(el => {
    if (el.tabIndex < 0 || el.matches(':disabled, [aria-disabled="true"]')) return false
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      if (node.hidden || node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true') return false
      const style = node.ownerDocument.defaultView?.getComputedStyle(node)
      if (style?.display === 'none' || style?.visibility === 'hidden') return false
      if (node === root) break
    }
    return true
  })
}

/** One lifecycle for the ordinary player and the sandbox's shared Vue components. */
export function useCanvasModalFocus(root: Ref<HTMLElement | null>, active: () => boolean, options: {
  initial?: () => string
  mode?: () => unknown
  backgroundOnly?: boolean
} = {}) {
  let release: (() => void) | null = null
  let entry: Entry | null = null
  let revision = 0
  watch(() => [active(), root.value, options.mode?.()], async () => {
    const current = ++revision
    await nextTick()
    if (current !== revision) return
    const el = root.value
    if (!active() || !el) { release?.(); release = null; entry = null; return }
    if (entry?.root === el) { entry.focus(); return }
    release?.()
    const doc = el.ownerDocument
    const state = stateFor(doc)
    const previous = doc.activeElement as HTMLElement | null
    const backgroundOnly = !!options.backgroundOnly
    const focus = () => {
      if (backgroundOnly) return
      const targets = focusables(el)
      if (targets.includes(doc.activeElement as HTMLElement)) return
      const preferred = options.initial?.()
      const target = (preferred && targets.find(target => target.matches(preferred))) || targets[0] || el
      target.focus({ preventScroll: true })
    }
    entry = { root: el, focus, backgroundOnly }
    const ownEntry = entry
    state.stack.push(ownEntry)
    // Move focus before aria-hiding the opener, avoiding aria-hidden focus violations.
    restoreBackground(state)
    el.removeAttribute('inert'); el.removeAttribute('aria-hidden')
    focus(); syncBackground(state)
    const onKeydown = (event: KeyboardEvent) => {
      if (state.stack.at(-1) !== ownEntry || backgroundOnly || event.key !== 'Tab' || event.defaultPrevented) return
      const targets = focusables(el)
      const index = targets.indexOf(doc.activeElement as HTMLElement)
      event.preventDefault()
      if (!targets.length) { el.focus({ preventScroll: true }); return }
      targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length].focus({ preventScroll: true })
    }
    const onFocus = (event: FocusEvent) => {
      if (state.stack.at(-1) === ownEntry && !backgroundOnly && !el.contains(event.target as Node)) focus()
    }
    doc.addEventListener('keydown', onKeydown, true)
    doc.addEventListener('focusin', onFocus, true)
    release = () => {
      doc.removeEventListener('keydown', onKeydown, true); doc.removeEventListener('focusin', onFocus, true)
      const wasTop = state.stack.at(-1) === ownEntry
      state.stack = state.stack.filter(value => value !== ownEntry)
      syncBackground(state)
      if (wasTop && !backgroundOnly) {
        if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true })
        else state.stack.at(-1)?.focus()
      }
    }
  }, { immediate: true, flush: 'post' })
  onBeforeUnmount(() => { ++revision; release?.() })
}
