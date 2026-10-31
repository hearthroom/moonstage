<template>
 <div ref="root" class="preset-drawer" popover="manual" data-lt="preset-drawer">
  <div class="preset-drawer-mask" @click="emit('close')"></div>
  <section class="preset-drawer-sheet" role="dialog" aria-modal="true" :aria-labelledby="`${uid}-title`">
   <header class="preset-drawer-head">
    <div class="preset-drawer-titles">
     <h2 :id="`${uid}-title`" class="preset-drawer-title">{{ t('responseSettings.preset.pick.drawer.title') }}</h2>
     <span v-if="card" class="mode-hint">{{ t('responseSettings.preset.pick.drawer.sub', { card }) }}</span>
    </div>
    <button type="button" class="preset-drawer-icon" data-action="drawer-close" :aria-label="t('responseSettings.preset.pick.drawer.close')" @click="emit('close')">
     <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    </button>
   </header>

   <div class="preset-drawer-body">
    <label class="preset-drawer-search">
     <span class="sr-only">{{ t('responseSettings.preset.pick.search.label') }}</span>
     <input v-model="query" type="search" data-lt="drawer-search" :placeholder="t('responseSettings.preset.pick.search.placeholder')" @input="search" />
    </label>
    <div class="preset-drawer-filters" role="group" :aria-label="t('responseSettings.preset.pick.filter.label')">
     <button type="button" class="mode-item" :class="{ selected: filter === 'all' }" :aria-pressed="filter === 'all' ? 'true' : 'false'" data-filter="all" @click="setFilter('all')">{{ t('responseSettings.preset.pick.filter.all') }}</button>
     <button type="button" class="mode-item" :class="{ selected: filter === 'general' }" :aria-pressed="filter === 'general' ? 'true' : 'false'" data-filter="general" @click="setFilter('general')">{{ t('responseSettings.preset.pick.filter.general') }}</button>
     <button v-if="lane" type="button" class="mode-item" :class="{ selected: filter === lane }" :aria-pressed="filter === lane ? 'true' : 'false'" data-filter="model" @click="setFilter(lane)">{{ modelLabel }}</button>
    </div>
    <p v-if="filter === lane && lane" class="mode-hint">{{ t('responseSettings.preset.pick.sort.model') }}</p>

    <p v-if="state === 'failed'" class="mode-hint response-error" role="alert">{{ t('responseSettings.preset.pick.error.load') }}</p>
    <p v-else-if="state === 'ready' && !rows.length" class="mode-hint" data-lt="drawer-empty">{{ t('responseSettings.preset.pick.empty.public') }}</p>
    <ul class="preset-drawer-list" :aria-busy="state === 'loading'">
     <li v-for="p in rows" :key="p.id" class="preset-drawer-row" :data-id="p.id">
      <div class="preset-drawer-text">
       <strong class="preset-drawer-name">{{ p.title }}</strong>
       <span v-if="p.author" class="mode-hint">{{ p.author }}</span>
       <span class="mode-hint">{{ statLine(p) }}</span>
      </div>
      <button v-if="api.view" type="button" class="preset-drawer-icon" data-action="drawer-view" :aria-label="t('responseSettings.preset.pick.view')" :title="t('responseSettings.preset.pick.view')" @click="api.view!(p.id)">
       <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M10 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <span v-if="p.id === currentId" class="preset-drawer-tag">{{ t('responseSettings.preset.pick.tag.inUse') }}</span>
      <button v-else type="button" class="complete-btn preset-drawer-apply" data-action="drawer-apply" :disabled="busy" @click="choose(p)">{{ t('responseSettings.preset.pick.drawer.apply') }}</button>
     </li>
    </ul>
    <p v-if="message" class="mode-hint" :class="{ 'response-error': failed }" role="status" data-lt="drawer-message">{{ message }}</p>
    <button v-if="more" type="button" class="mode-item preset-drawer-more" data-action="drawer-more" :disabled="state === 'loading'" @click="load(true)">{{ t('responseSettings.preset.pick.list.more') }}</button>
   </div>
  </section>
 </div>
</template>

<script setup lang="ts">
// 預設庫抽屜（PM 2026-10-30）：從選擇器「瀏覽預設庫」打開，在畫布上蓋一層——手機全屏、桌機右側 600 寬。
// 搜尋、模型篩選（預設帶目前對話的模型，可換通用／全部），每列「套用」直接套到這張卡；
// 套好由外層關掉抽屜與回覆偏好、回到對話並出一行提示。跟回覆偏好同一條套用路徑。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { usePresetApply } from '../canvas-preset-apply'
import { leaveTopLayer, raiseToTopLayer } from '../canvas-top-layer'
import { useCanvasModalFocus } from '../canvas-modal-focus'
import { readBinding, readPresetRows, type PresetApi, type PresetBinding, type PresetRow } from '../canvas-preset'

const PAGE = 20

const props = defineProps<{
 api: PresetApi
 /** 套用前問一下回覆偏好有沒有沒存的修改 */
 confirmLeave?: () => Promise<boolean>
 t: (key: string, values?: Record<string, unknown>) => string
}>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'applied', message: string): void }>()

const uid = `pd-${Math.random().toString(36).slice(2, 8)}`
const root = ref<HTMLElement | null>(null)
const ctx = props.api.context?.() ?? { model: '', card: '' }
const lane = ctx.model
const card = ctx.card
const modelLabel = computed(() => props.api.modelName?.(lane) || lane)
const filter = ref(lane || 'all')
const query = ref('')
const rows = ref<PresetRow[]>([])
const state = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle')
const more = ref(false)
const binding = ref<PresetBinding | null>(null)
const currentId = computed(() => (binding.value?.mode === 'preset' ? binding.value.presetId : null))
let loadId = 0
let timer: ReturnType<typeof setTimeout> | undefined

async function load(append = false) {
 if (!props.api.library) return
 const my = ++loadId
 state.value = 'loading'
 try {
  const page = readPresetRows(await props.api.library({ model: filter.value, q: query.value.trim(), sort: 'hot', offset: append ? rows.value.length : 0, limit: PAGE }))
  if (my !== loadId) return
  rows.value = append ? [...rows.value, ...page] : page
  more.value = page.length === PAGE
  state.value = 'ready'
 } catch { if (my === loadId) state.value = 'failed' }
}
function setFilter(v: string) { if (filter.value !== v) { filter.value = v; void load() } }
// 停手才查，打字中不連打
function search() { clearTimeout(timer); timer = setTimeout(() => void load(), 300) }

const { busy, message, failed, apply } = usePresetApply({
 api: () => props.api, binding, t: props.t, confirmLeave: props.confirmLeave,
 onChanged: () => {}, onStale: () => void load(),
})
async function choose(p: PresetRow) {
 if (await apply({ id: p.id, title: p.title })) emit('applied', message.value)
}
const statLine = (p: PresetRow) => props.t('responseSettings.preset.pick.users7d', { n: p.usesLast7d })

// Esc 只關抽屜：攔在 capture，不讓底下的回覆偏好也一起關
function onKey(e: KeyboardEvent) {
 if (e.key !== 'Escape' && e.key !== 'Esc') return
 e.preventDefault(); e.stopImmediatePropagation()
 emit('close')
}
// 跟畫布其他彈層同一個疊放：抽屜在最上面時，底下的回覆偏好變成不可操作，焦點留在抽屜裡；關掉後焦點回到「瀏覽預設庫」
useCanvasModalFocus(root, () => true, { initial: () => '[data-action="drawer-close"]' })

onMounted(async () => {
 document.addEventListener('keydown', onKey, true)
 await nextTick()
 raiseToTopLayer(root.value)
 try { binding.value = readBinding(await props.api.card()) } catch { /* 讀不到就照樣列，套用時伺服器會擋版本不符 */ }
 void load()
})
onBeforeUnmount(() => {
 clearTimeout(timer)
 document.removeEventListener('keydown', onKey, true)
 leaveTopLayer(root.value)
})
</script>

<style scoped>
@layer lt-base {
 .preset-drawer{position:fixed;inset:0;margin:0;padding:0;width:100%;height:100%;max-width:none;max-height:none;border:0;background:transparent;overflow:hidden;z-index:60}
 .preset-drawer-mask{position:absolute;inset:0;background:rgba(0,0,0,.5)}
 .preset-drawer-sheet{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--lt-canvas-sheet-bg);color:var(--lt-canvas-sheet-fg);font-family:var(--lt-canvas-font, inherit)}
 @media (min-width:768px){
  .preset-drawer-sheet{left:auto;width:min(600px,100%);box-shadow:-12px 0 32px -8px rgba(0,0,0,.5)}
 }
 .preset-drawer-head{flex:none;display:flex;align-items:center;gap:8px;padding:12px 8px 12px 16px;border-bottom:1px solid var(--lt-canvas-sheet-line)}
 .preset-drawer-titles{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
 .preset-drawer-title{margin:0;font-size:18px;font-weight:700;line-height:1.3}
 .preset-drawer-icon{flex:none;display:inline-grid;place-items:center;width:44px;height:44px;padding:0;border:0;border-radius:999px;background:var(--lt-canvas-sheet-item-bg);color:var(--lt-canvas-sheet-fg);cursor:pointer}
 .preset-drawer-icon svg{width:18px;height:18px}
 .preset-drawer-icon:focus-visible,.preset-drawer-apply:focus-visible,.preset-drawer input:focus-visible{outline:2px solid var(--lt-canvas-accent);outline-offset:2px}
 .preset-drawer-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:16px;display:flex;flex-direction:column;gap:12px}
 .preset-drawer-body > p{margin:0}
 .preset-drawer-search input{width:100%;box-sizing:border-box;height:44px;padding:0 12px;border:1px solid var(--lt-canvas-sheet-line);border-radius:var(--lt-canvas-radius);background:var(--lt-canvas-sheet-item-bg);color:var(--lt-canvas-sheet-fg);font:inherit;font-size:16px}
 .preset-drawer-filters{display:flex;flex-wrap:wrap;gap:8px}
 .preset-drawer-filters .mode-item{min-height:44px}
 .preset-drawer-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
 .preset-drawer-row{display:flex;align-items:center;gap:8px;padding:12px;border:1px solid var(--lt-canvas-sheet-line);border-radius:var(--lt-canvas-radius);background:var(--lt-canvas-sheet-item-bg)}
 .preset-drawer-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
 .preset-drawer-name{font-weight:600;overflow-wrap:anywhere}
 .preset-drawer-apply{flex:none;min-height:44px;padding:0 16px}
 .preset-drawer-tag{flex:none;font-size:13px;color:var(--lt-canvas-accent)}
 .preset-drawer-more{align-self:center;min-height:44px}
 .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
}
</style>
