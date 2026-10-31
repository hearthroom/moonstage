<template>
 <div ref="root" class="preset-picker" data-lt="preset-picker">
  <div class="preset-picker-head">
   <button ref="backButton" type="button" class="preset-picker-back" data-action="preset-back" :aria-label="t('responseSettings.preset.pick.back')" @click="emit('back')">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
   </button>
   <div class="page-title">{{ t('responseSettings.preset.source') }}</div>
  </div>
  <p class="mode-hint">{{ t('responseSettings.preset.hint.off') }}</p>

  <div class="preset-picker-tabs" role="tablist" :aria-label="t('responseSettings.preset.pick.tabs.label')" @keydown="tabKey">
   <button v-for="k in TABS" :id="`${uid}-tab-${k}`" :key="k" type="button" role="tab" class="mode-item" :class="{ selected: tab === k }"
    :aria-selected="tab === k ? 'true' : 'false'" :aria-controls="`${uid}-panel`" :tabindex="tab === k ? 0 : -1" :data-tab="k" @click="openTab(k)">
    {{ t(`responseSettings.preset.pick.tab.${k}`) }}
   </button>
  </div>

  <div :id="`${uid}-panel`" role="tabpanel" :aria-labelledby="`${uid}-tab-${tab}`" class="preset-picker-panel">
   <div role="radiogroup" :aria-label="t(`responseSettings.preset.pick.tab.${tab}`)" class="preset-picker-list">
    <button type="button" class="preset-option" data-value="" role="radio" :class="{ selected: choice === NONE }" :aria-checked="choice === NONE ? 'true' : 'false'" @click="choice = NONE">
     <span class="preset-option-name">{{ t('responseSettings.preset.pick.none.title') }}</span>
     <span class="mode-hint">{{ t('responseSettings.preset.pick.none.hint') }}</span>
    </button>

    <template v-if="tab === 'mine'">
     <div v-if="!mine.length" class="preset-empty" data-lt="preset-empty">
      <div class="preset-option-name">{{ t('responseSettings.preset.pick.empty.title') }}</div>
      <div class="mode-hint">{{ t('responseSettings.preset.pick.empty.body') }}</div>
      <button v-if="api.manage" type="button" class="advanced-reset" data-action="preset-manage" @click="api.manage()">{{ t('responseSettings.preset.pick.empty.action') }}</button>
     </div>
     <!-- 套用中的那份不在任何清單裡（作者刪了，已套用的卡照常用）：照樣列成目前這個，不讓按鈕變成悄悄取消 -->
     <PresetRowItem v-if="orphan" :row="orphan" />
     <PresetRowItem v-for="p in mine" :key="p.id" :row="p" :sub="testedLine(p)" />
    </template>

    <template v-else-if="tab === 'fav'">
     <p v-if="shelfState === 'loading'" class="mode-hint" role="status">{{ t('responseSettings.loading') }}</p>
     <p v-else-if="shelfState === 'failed'" class="mode-hint response-error" role="alert">{{ t('responseSettings.preset.pick.error.load') }}</p>
     <p v-else-if="!favs.length && !used.length" class="mode-hint" data-lt="preset-empty-fav">{{ t('responseSettings.preset.pick.empty.fav') }}</p>
     <template v-if="favs.length">
      <div class="preset-picker-group">{{ t('responseSettings.preset.pick.group.fav') }}</div>
      <PresetRowItem v-for="p in favs" :key="p.id" :row="p" :sub="authorLine(p)" />
     </template>
     <template v-if="used.length">
      <div class="preset-picker-group">{{ t('responseSettings.preset.pick.group.used') }}</div>
      <PresetRowItem v-for="p in used" :key="p.id" :row="p" :sub="authorLine(p, true)" />
     </template>
    </template>

    <template v-else>
     <div class="preset-picker-group">{{ modelLabel ? t('responseSettings.preset.pick.group.hotModel', { model: modelLabel }) : t('responseSettings.preset.pick.group.hot') }}</div>
     <p v-if="hotState === 'loading'" class="mode-hint" role="status">{{ t('responseSettings.loading') }}</p>
     <p v-else-if="hotState === 'failed'" class="mode-hint response-error" role="alert">{{ t('responseSettings.preset.pick.error.load') }}</p>
     <p v-else-if="!hot.length" class="mode-hint" data-lt="preset-empty-public">{{ t('responseSettings.preset.pick.empty.public') }}</p>
     <PresetRowItem v-for="p in hot" :key="p.id" :row="p" :sub="usesLine(p)" />
    </template>
   </div>

   <div v-if="tab === 'public' && api.library" class="preset-picker-browse">
    <button type="button" class="mode-item" data-action="preset-browse" @click="emit('browse')">{{ t('responseSettings.preset.pick.browse') }}</button>
    <span class="mode-hint">{{ t('responseSettings.preset.pick.browse.note') }}</span>
   </div>
  </div>

  <div class="mode-hint">{{ t('responseSettings.preset.pick.note') }}</div>
  <p v-if="message" class="mode-hint" :class="{ 'response-error': failed }" role="status" data-lt="preset-message">{{ message }}</p>
  <div class="preset-picker-actions">
   <button type="button" class="complete-btn" data-action="preset-apply" :disabled="!canApply" @click="confirm">
    {{ busy ? t('responseSettings.preset.applying') : picked ? t('responseSettings.preset.pick.apply', { name: picked.title }) : t(currentId ? 'responseSettings.preset.useCard' : 'responseSettings.preset.apply') }}
   </button>
   <span v-if="picked" class="mode-hint">{{ t('responseSettings.preset.pick.follow') }}</span>
  </div>
 </div>
</template>

<script setup lang="ts">
// 自訂預設選擇器（P2，PM 2026-10-30）：回覆偏好裡一層，三組「我的／喜愛與用過／預設庫」。
// 預設庫只列目前模型的熱門前三，下面「瀏覽預設庫」開抽屜看全部；選了按「套用『X』到這張卡」。
// 「不用預設」＝取消套用，回到玩家原本的選擇。每一列旁有到網站看內容的連結（宿主給了才畫）。
import { computed, defineComponent, h, nextTick, onMounted, ref, watch, type PropType } from 'vue'
import { syncChromeTone } from '../canvas-chrome-tone'
import { usePresetApply } from '../canvas-preset-apply'
import { modelValueName, readPresetRows, type PresetApi, type PresetBinding, type PresetRow } from '../canvas-preset'

type Tab = 'mine' | 'fav' | 'public'
const TABS: Tab[] = ['mine', 'fav', 'public']
const NONE = '__none__'
const HOT_SHOWN = 3

const props = defineProps<{
 api: PresetApi
 binding: PresetBinding | null
 /** 我的預設（面板已經讀過） */
 mine: PresetRow[]
 /** 喜愛與用過（面板已經讀過就給；沒給這裡自己讀） */
 shelf?: PresetRow[] | null
 confirmLeave?: () => Promise<boolean>
 t: (key: string, values?: Record<string, unknown>) => string
}>()
const emit = defineEmits<{ (e: 'back'): void; (e: 'browse'): void; (e: 'changed'): void; (e: 'stale'): void; (e: 'applied', message: string): void }>()

const uid = `pp-${Math.random().toString(36).slice(2, 8)}`
const backButton = ref<HTMLButtonElement | null>(null)
const root = ref<HTMLElement | null>(null)
// 主鈕的字色要照實際底色挑深或淺（作者的卡可能把面板漆成任何顏色）：面板只在打開時量一次，
// 這一層是後來才掛上的，所以自己量；換選擇時按鈕可能從停用變可按，再量一次
const syncTone = () => void nextTick(() => syncChromeTone(root.value?.closest('.u-popup') ?? root.value))
const current = ref<PresetBinding | null>(props.binding)
const currentId = computed(() => (current.value?.mode === 'preset' ? current.value.presetId : null))

const shelfRows = ref<PresetRow[] | null>(props.shelf ?? null)
const shelfState = ref<'idle' | 'loading' | 'ready' | 'failed'>(props.shelf ? 'ready' : 'idle')
const hotRows = ref<PresetRow[]>([])
const hotState = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle')
const favs = computed(() => (shelfRows.value ?? []).filter((p) => p.favorited))
const used = computed(() => (shelfRows.value ?? []).filter((p) => !p.favorited))
const hot = computed(() => hotRows.value.slice(0, HOT_SHOWN))
const lane = computed(() => props.api.context?.().model ?? '')
const modelLabel = computed(() => (lane.value ? props.api.modelName?.(lane.value) || lane.value : ''))

// 先開在套用中那份所在的一組；沒有套用時有自己的就開「我的」，否則開預設庫
const startTab = (): Tab => {
 const id = currentId.value
 if (id && props.mine.some((p) => p.id === id)) return 'mine'
 if (id && props.shelf?.some((p) => p.id === id)) return 'fav'
 return props.mine.length || id ? 'mine' : 'public'
}
const tab = ref<Tab>(startTab())
const choice = ref<string>(currentId.value ?? NONE)
const orphan = computed<PresetRow | null>(() => {
 const id = currentId.value
 if (!id || [...props.mine, ...(shelfRows.value ?? []), ...hotRows.value].some((p) => p.id === id)) return null
 return { id, title: current.value?.title ?? '', author: '', usesLast7d: 0, fresh: false, listed: true, favorited: false, lastAppliedAt: '', mine: false, recommendedModels: [] }
})
const all = computed(() => [...(orphan.value ? [orphan.value] : []), ...props.mine, ...(shelfRows.value ?? []), ...hotRows.value])
const picked = computed(() => (choice.value === NONE ? null : all.value.find((p) => p.id === choice.value) ?? null))
// 選的就是目前套用的（或沒套用時選「不用預設」）：沒有要改的
const canApply = computed(() => !busy.value && (picked.value ? picked.value.id !== currentId.value : !!currentId.value))

async function loadShelf() {
 if (!props.api.shelf || shelfState.value === 'loading' || shelfState.value === 'ready') return
 shelfState.value = 'loading'
 try { shelfRows.value = readPresetRows(await props.api.shelf()); shelfState.value = 'ready' } catch { shelfState.value = 'failed' }
}
async function loadHot() {
 if (!props.api.hot || hotState.value === 'loading' || hotState.value === 'ready') return
 hotState.value = 'loading'
 try { hotRows.value = readPresetRows(await props.api.hot(lane.value)); hotState.value = 'ready' } catch { hotState.value = 'failed' }
}
// 分頁打開時才讀，不在面板打開時就打三支
function openTab(k: Tab) {
 tab.value = k
 if (k === 'fav') void loadShelf()
 if (k === 'public') void loadHot()
}
function tabKey(e: KeyboardEvent) {
 const at = TABS.indexOf(tab.value)
 const next = e.key === 'ArrowRight' ? TABS[(at + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(at + TABS.length - 1) % TABS.length] : null
 if (!next) return
 e.preventDefault()
 openTab(next)
 void nextTick(() => document.getElementById(`${uid}-tab-${next}`)?.focus())
}

const { busy, message, failed, apply } = usePresetApply({
 api: () => props.api, binding: current, t: props.t, confirmLeave: props.confirmLeave,
 onChanged: () => emit('changed'), onStale: () => { shelfState.value = 'idle'; hotState.value = 'idle'; openTab(tab.value); emit('stale') },
})
async function confirm() {
 const target = picked.value
 if (await apply(target ? { id: target.id, title: target.title } : null)) emit('applied', message.value)
}

const dateOf = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}` }
const unlisted = (p: PresetRow) => (p.listed ? [] : [props.t('responseSettings.preset.unlisted')])
function testedLine(p: PresetRow) {
 return p.recommendedModels.length ? props.t('responseSettings.preset.pick.models', { models: p.recommendedModels.map(modelValueName).join(props.t('responseSettings.preset.separator')) }) : ''
}
function authorLine(p: PresetRow, withDate = false) {
 const date = withDate && p.lastAppliedAt ? dateOf(p.lastAppliedAt) : ''
 return [p.author, ...unlisted(p), ...(date ? [props.t('responseSettings.preset.pick.used.on', { date })] : [])].filter(Boolean).join(' · ')
}
function usesLine(p: PresetRow) {
 return [p.author, props.t('responseSettings.preset.pick.users7d', { n: p.usesLast7d })].filter(Boolean).join(' · ')
}

// 一列：選這份（單選）＋到網站看內容
const PresetRowItem = defineComponent({
 props: { row: { type: Object as PropType<PresetRow>, required: true }, sub: { type: String, default: '' } },
 setup(rowProps) {
  return () => {
   const p = rowProps.row
   const on = choice.value === p.id
   return h('div', { class: 'preset-row' }, [
    h('button', { type: 'button', class: ['preset-option', { selected: on }], role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-value': p.id, onClick: () => { choice.value = p.id } }, [
     h('span', { class: 'preset-option-top' }, [
      h('span', { class: 'preset-option-name' }, p.title),
      p.id === currentId.value ? h('span', { class: 'preset-option-tag' }, props.t('responseSettings.preset.pick.tag.inUse')) : null,
     ]),
     rowProps.sub ? h('span', { class: 'mode-hint' }, rowProps.sub) : null,
    ]),
    props.api.view ? h('button', { type: 'button', class: 'preset-row-view', 'data-action': 'preset-view', 'aria-label': props.t('responseSettings.preset.pick.view'), title: props.t('responseSettings.preset.pick.view'), onClick: () => props.api.view!(p.id) }, [
     h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [h('path', { d: 'M14 5h5v5M19 5l-8 8M10 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })]),
    ]) : null,
   ])
  }
 },
})

watch(() => [choice.value, busy.value], syncTone)
onMounted(() => {
 syncTone()
 openTab(tab.value)
 void nextTick(() => backButton.value?.focus())
})
</script>

<style scoped>
@layer lt-base {
 .preset-picker{display:flex;flex-direction:column;gap:12px}
 .preset-picker > p{margin:0}
 .preset-picker-head{display:flex;align-items:center;gap:12px}
 .preset-picker-back{flex:none;display:inline-grid;place-items:center;width:44px;height:44px;padding:0;border:0;border-radius:999px;background:var(--lt-canvas-sheet-item-bg);color:var(--lt-canvas-sheet-fg);cursor:pointer}
 .preset-picker-back svg{width:18px;height:18px}
 .preset-picker-back:focus-visible{outline:2px solid var(--lt-canvas-accent);outline-offset:2px}
 .preset-picker-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
 .preset-picker-tabs .mode-item{min-height:44px}
 .preset-picker-panel{display:flex;flex-direction:column;gap:12px}
 .preset-picker-list{display:flex;flex-direction:column;gap:8px}
 .preset-picker-group{margin-top:4px;font-size:13px;font-weight:600;opacity:.8}
 .preset-picker-browse{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}
 .preset-picker-browse .mode-item{min-height:44px}
 .preset-picker-actions{display:flex;flex-direction:column;align-items:stretch;gap:6px}
 .preset-picker-actions .complete-btn{min-height:48px}
 .preset-picker-list :deep(.preset-row){display:flex;align-items:stretch;gap:8px}
 .preset-picker-list :deep(.preset-option){display:flex;flex-direction:column;align-items:stretch;gap:4px;flex:1;min-width:0;min-height:44px;padding:10px 12px;border:1px solid var(--lt-canvas-sheet-line);border-radius:var(--lt-canvas-radius);background:var(--lt-canvas-sheet-item-bg);color:var(--lt-canvas-sheet-fg);font:inherit;text-align:start;cursor:pointer}
 .preset-picker-list .preset-option{display:flex;flex-direction:column;align-items:stretch;gap:4px;min-height:44px;padding:10px 12px;border:1px solid var(--lt-canvas-sheet-line);border-radius:var(--lt-canvas-radius);background:var(--lt-canvas-sheet-item-bg);color:var(--lt-canvas-sheet-fg);font:inherit;text-align:start;cursor:pointer}
 .preset-picker-list :deep(.preset-option.selected),.preset-picker-list .preset-option.selected{border-color:var(--lt-canvas-accent);box-shadow:inset 0 0 0 1px var(--lt-canvas-accent)}
 .preset-picker-list :deep(.preset-option:focus-visible),.preset-picker-list .preset-option:focus-visible{outline:2px solid var(--lt-canvas-accent);outline-offset:2px}
 .preset-picker-list :deep(.preset-option-top){display:flex;align-items:baseline;justify-content:space-between;gap:8px}
 .preset-picker-list :deep(.preset-option-name),.preset-picker-list .preset-option-name{min-width:0;font-weight:600;overflow-wrap:anywhere}
 .preset-picker-list :deep(.preset-option-tag){flex:none;font-size:13px;color:var(--lt-canvas-accent)}
 .preset-picker-list :deep(.preset-row-view){flex:none;display:inline-grid;place-items:center;width:44px;padding:0;border:1px solid var(--lt-canvas-sheet-line);border-radius:var(--lt-canvas-radius);background:transparent;color:var(--lt-canvas-sheet-fg);cursor:pointer}
 .preset-picker-list :deep(.preset-row-view svg){width:18px;height:18px}
 .preset-picker-list :deep(.preset-row-view:focus-visible){outline:2px solid var(--lt-canvas-accent);outline-offset:2px}
 .preset-empty{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
}
</style>
