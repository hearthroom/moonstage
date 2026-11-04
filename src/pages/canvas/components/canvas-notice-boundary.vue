<template>
  <span ref="anchor" hidden aria-hidden="true" data-lt-notice-anchor></span>
  <slot />
  <Teleport v-if="floating" :to="portalTarget">
    <div ref="fallback" class="canvas-notice-fallback" data-lt="notice-fallback" popover="manual" :style="[theme, placement]" :lang="language">
      <slot />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, onUpdated, ref, watch } from 'vue'
import { leaveTopLayer, raiseToTopLayer } from '../canvas-top-layer'

const props = defineProps<{ enabled: boolean }>()
const anchor = ref<HTMLElement | null>(null)
const fallback = ref<HTMLElement | null>(null)
const floating = ref(false)
const theme = ref<Record<string, string>>({})
const language = ref('')
const placement = ref<Record<string, string>>({})
const portalTarget = ref<Element | string>('body')
let observer: MutationObserver | undefined
let resizeObserver: ResizeObserver | undefined
let frame = 0
let disposed = false
let original: HTMLElement | null = null
let ownerDoc: Document | undefined
let priorAriaHidden: string | null = null
let priorInert: string | null = null

// The source stays in the timeline so switching an author layout back to chat is
// measurable. Only the recovery copy enters the same top layer as platform panels.
function obscured(source: HTMLElement): boolean {
  const doc = source.ownerDocument
  const win = doc.defaultView!
  for (let node: HTMLElement | null = source; node; node = node.parentElement) {
    const cs = win.getComputedStyle(node)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return true
  }
  const box = source.getBoundingClientRect()
  const x = box.left + box.width / 2, y = box.top + box.height / 2
  // Reading earlier history is not an author layout hiding a failure.
  if (!box.width || !box.height || x < 0 || x >= win.innerWidth || y < 0 || y >= win.innerHeight) return false
  const hit = doc.elementsFromPoint?.(x, y).find(el => !fallback.value?.contains(el))
  if (!hit || source.contains(hit)) return false
  // Platform menus/dialogs must remain above the notice. An author book is an
  // ordinary fixed layer, not a native top-layer platform control.
  if (hit.closest('[popover], dialog[open], [aria-modal="true"]')) return false
  for (let node: Element | null = hit; node && !node.contains(source); node = node.parentElement) {
    if (win.getComputedStyle(node).position === 'fixed') return true
  }
  return false
}

function placeAboveComposer(source: HTMLElement) {
  const doc = source.ownerDocument
  const win = doc.defaultView!
  const scope = source.closest('.canvas-root') || doc
  const viewport = win.visualViewport
  const visibleTop = viewport?.offsetTop || 0
  let bottomEdge = Math.min(win.innerHeight, visibleTop + (viewport?.height || win.innerHeight))
  // Keep the input and its shortcut row available. Reserve their layout lane
  // even if an author book temporarily hides the composer without removing it.
  for (const composer of scope.querySelectorAll('.composer-scope, [data-chat="composer"]')) {
    resizeObserver?.observe(composer)
    const rect = composer.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0 && rect.top >= visibleTop && rect.top < bottomEdge) bottomEdge = rect.top
  }
  const next = {
    bottom: `${Math.max(12, win.innerHeight - bottomEdge + 12)}px`,
    maxHeight: `${Math.max(0, bottomEdge - visibleTop - 24)}px`,
  }
  if (JSON.stringify(placement.value) !== JSON.stringify(next)) placement.value = next
}

async function measure() {
  if (disposed || !anchor.value) return
  const source = anchor.value.nextElementSibling as HTMLElement | null
  const show = !!source && props.enabled && obscured(source)
  if (show) {
    placeAboveComposer(source)
    const cs = source.ownerDocument.defaultView!.getComputedStyle(source)
    const tokens: Record<string, string> = {}
    for (let i = 0; i < cs.length; i++) {
      const key = cs[i]
      if (key.startsWith('--lt-canvas-') || key.startsWith('--chat-') || ['--rpx', '--ms-rpx'].includes(key)) tokens[key] = cs.getPropertyValue(key)
    }
    portalTarget.value = source.ownerDocument.fullscreenElement || source.closest('.ms-stage') || source.ownerDocument.body
    if (JSON.stringify(theme.value) !== JSON.stringify(tokens)) theme.value = tokens
    language.value = source.closest('[lang]')?.getAttribute('lang') || source.ownerDocument.documentElement.lang
    if (show === floating.value) return
    original = source
    priorAriaHidden = source.getAttribute('aria-hidden')
    priorInert = source.getAttribute('inert')
    source.setAttribute('aria-hidden', 'true')
    source.setAttribute('inert', '')
  } else {
    if (show === floating.value) return
    leaveTopLayer(fallback.value)
    restoreSource()
  }
  floating.value = show
  await nextTick()
  if (show && !disposed) raiseToTopLayer(fallback.value)
}
function restoreSource() {
  if (original) {
    if (priorAriaHidden === null) original.removeAttribute('aria-hidden')
    else original.setAttribute('aria-hidden', priorAriaHidden)
    if (priorInert === null) original.removeAttribute('inert')
    else original.setAttribute('inert', priorInert)
  }
  original = null
}
function schedule() {
  if (frame || disposed) return
  frame = requestAnimationFrame(() => { frame = 0; void measure() })
}
function observe(enabled: boolean) {
  observer?.disconnect()
  resizeObserver?.disconnect()
  const doc = ownerDoc
  if (!doc) return
  doc.removeEventListener('scroll', schedule, true)
  doc.removeEventListener('toggle', schedule, true)
  doc.defaultView?.removeEventListener('resize', schedule)
  doc.defaultView?.visualViewport?.removeEventListener('resize', schedule)
  doc.defaultView?.visualViewport?.removeEventListener('scroll', schedule)
  if (enabled) {
    const Resize = doc.defaultView?.ResizeObserver
    if (Resize) resizeObserver ||= new Resize(schedule)
    observer ||= new MutationObserver(schedule)
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] })
    doc.addEventListener('scroll', schedule, true)
    doc.addEventListener('toggle', schedule, true)
    doc.defaultView?.addEventListener('resize', schedule)
    doc.defaultView?.visualViewport?.addEventListener('resize', schedule)
    doc.defaultView?.visualViewport?.addEventListener('scroll', schedule)
  }
  schedule()
}
onMounted(() => { ownerDoc = anchor.value!.ownerDocument; observe(props.enabled) })
onUpdated(schedule)
watch(() => props.enabled, observe)
onUnmounted(() => {
  disposed = true
  observer?.disconnect()
  resizeObserver?.disconnect()
  cancelAnimationFrame(frame)
  const doc = ownerDoc
  doc?.removeEventListener('scroll', schedule, true)
  doc?.removeEventListener('toggle', schedule, true)
  doc?.defaultView?.removeEventListener('resize', schedule)
  doc?.defaultView?.visualViewport?.removeEventListener('resize', schedule)
  doc?.defaultView?.visualViewport?.removeEventListener('scroll', schedule)
  leaveTopLayer(fallback.value)
  restoreSource()
})
</script>

<style scoped>
/* Recovery controls share the platform top layer; this resets the UA popover
   box only. The card itself keeps its existing tokens and author appearance. */
@layer lt-base {
.canvas-notice-fallback {
  position: fixed;
  inset: auto 0 max(12px, env(safe-area-inset-bottom));
  width: min(100%, 592px);
  max-height: calc(100dvh - 80px);
  margin: 0 auto;
  padding: 0;
  border: 0;
  overflow: auto;
  background: transparent;
  color: var(--lt-canvas-text);
}
.canvas-notice-fallback::backdrop { background: transparent; pointer-events: none; }
}
</style>
