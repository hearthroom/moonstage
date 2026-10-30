<template>
  <!--
    指令組子視圖（換一組／這張卡的新存檔、存成指令組）。在長期指令面板裡換掉清單那一片，
    不另開彈層：畫布同時只有一個彈層，疊上去會讓玩家剛點的清單整片消失。
    沙盒卡的殼用同一個元件畫，所以這裡只畫宿主算好的資料，按鍵全部交回宿主。
  -->
  <div class="ci-sets" :data-view="vm.view">
    <div class="ci-sets-head">
      <div class="ci-sets-back" role="button" tabindex="0"
           @click="$emit('sets-back')"
           @keydown.enter.prevent="$emit('sets-back')">‹ {{ labels.back }}</div>
      <div class="ci-sets-title">{{ vm.view === 'save-as' ? labels.saveAs : labels.title }}</div>
    </div>

    <template v-if="vm.view === 'sets'">
      <div class="ci-scope" role="radiogroup" :aria-label="`${labels.scopeSave} / ${labels.scopeCard}`">
        <div v-for="s in scopes" :key="s.key" class="ci-scope-item" role="radio"
             :tabindex="vm.sets.scope === s.key ? 0 : -1"
             :class="{ 'is-on': vm.sets.scope === s.key, 'is-disabled': s.key === 'save' && vm.sets.saveScopeDisabled }"
             :aria-checked="vm.sets.scope === s.key ? 'true' : 'false'"
             @click="$emit('sets-scope', s.key)"
             @keydown.enter.prevent="$emit('sets-scope', s.key)"
             @keydown.space.prevent="$emit('sets-scope', s.key)"
             @keydown="onArrow($event, scopes.map((x) => x.key), vm.sets.scope, 'sets-scope')">{{ s.label }}</div>
      </div>

      <div class="ci-set-list" role="radiogroup" :aria-label="labels.title">
        <div v-for="(row, i) in vm.sets.rows" :key="row.id || 'none'" class="ci-set" role="radio"
             :tabindex="vm.sets.picked === row.id || (!pickedInRows && i === 0) ? 0 : -1"
             :class="{ 'is-on': vm.sets.picked === row.id && (row.id !== '' || vm.sets.scope === 'card') }"
             :aria-checked="vm.sets.picked === row.id ? 'true' : 'false'"
             @click="$emit('sets-pick', row.id)"
             @keydown.enter.prevent="$emit('sets-pick', row.id)"
             @keydown.space.prevent="$emit('sets-pick', row.id)"
             @keydown="onArrow($event, vm.sets.rows.map((x) => x.id), vm.sets.picked, 'sets-pick')">
          <div class="ci-set-top">
            <span class="ci-set-name">{{ row.title }}</span>
            <span v-if="row.countText" class="ci-set-count">{{ row.countText }}</span>
          </div>
          <div v-for="(line, i) in row.preview" :key="i" class="ci-set-preview">{{ line }}</div>
        </div>
      </div>

      <div class="ci-sum" aria-live="polite">
        <div v-if="vm.sets.summary">{{ vm.sets.summary }}</div>
        <div v-if="vm.sets.already">{{ vm.sets.already }}</div>
        <div v-if="vm.sets.keepHint">{{ vm.sets.keepHint }}</div>
        <div v-if="vm.sets.note">{{ vm.sets.note }}</div>
      </div>
      <div class="ci-add-error" :hidden="!vm.sets.error">{{ vm.sets.error }}</div>
      <div class="ci-sets-actions">
        <div class="ci-main-btn" role="button" tabindex="0"
             :class="{ 'is-disabled': !vm.sets.canApply, 'is-busy': vm.sets.busy }"
             :aria-disabled="vm.sets.canApply ? 'false' : 'true'"
             @click="vm.sets.canApply && $emit('sets-apply')"
             @keydown.enter.prevent="vm.sets.canApply && $emit('sets-apply')">{{ vm.sets.applyLabel }}</div>
        <div v-if="vm.source.canManage" class="ci-link" role="button" tabindex="0"
             @click="$emit('sets-manage')"
             @keydown.enter.prevent="$emit('sets-manage')">{{ labels.manage }}</div>
      </div>
    </template>

    <template v-else-if="vm.view === 'save-as'">
      <template v-if="vm.saveAs.full">
        <div class="ci-sum">{{ vm.saveAs.full }}</div>
        <div class="ci-sets-actions">
          <div v-if="vm.source.canManage" class="ci-link" role="button" tabindex="0"
               @click="$emit('sets-manage')"
               @keydown.enter.prevent="$emit('sets-manage')">{{ labels.manage }}</div>
        </div>
      </template>
      <template v-else>
        <label class="ci-field">
          <span class="ci-field-label">{{ labels.nameLabel }}</span>
          <input class="ci-input" type="text" :value="name" :maxlength="vm.saveAs.maxTitle"
                 :placeholder="labels.namePlaceholder"
                 @input="$emit('sets-name', ($event.target as HTMLInputElement).value)" />
          <span class="ci-count">{{ Array.from(name).length }}/{{ vm.saveAs.maxTitle }}</span>
        </label>
        <div class="ci-sum" aria-live="polite">{{ vm.saveAs.summary }}</div>
        <div class="ci-check" role="checkbox" tabindex="0"
             :aria-checked="vm.saveAs.bindCard ? 'true' : 'false'"
             @click="$emit('sets-bind')"
             @keydown.enter.prevent="$emit('sets-bind')"
             @keydown.space.prevent="$emit('sets-bind')">
          <span class="ci-check-box" :class="{ 'is-on': vm.saveAs.bindCard }" aria-hidden="true">{{ vm.saveAs.bindCard ? '✓' : '' }}</span>
          <span>{{ labels.bindCard }}</span>
        </div>
        <div class="ci-add-error" :hidden="!vm.saveAs.error">{{ vm.saveAs.error }}</div>
        <div class="ci-sets-actions">
          <div class="ci-main-btn" role="button" tabindex="0"
               :class="{ 'is-disabled': !vm.saveAs.canSave, 'is-busy': vm.saveAs.busy }"
               :aria-disabled="vm.saveAs.canSave ? 'false' : 'true'"
               @click="vm.saveAs.canSave && $emit('sets-save-as')"
               @keydown.enter.prevent="vm.saveAs.canSave && $emit('sets-save-as')">{{ labels.saveAs }}</div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted } from 'vue'
import type { DirectiveSetsViewModel } from '../canvas-directives'

export interface DirectiveSetLabels {
  back: string
  title: string
  scopeSave: string
  scopeCard: string
  manage: string
  saveAs: string
  nameLabel: string
  namePlaceholder: string
  bindCard: string
}

const props = defineProps<{ vm: DirectiveSetsViewModel; labels: DirectiveSetLabels; name: string }>()
const emit = defineEmits<{
  (e: 'sets-back'): void
  (e: 'sets-scope', scope: string): void
  (e: 'sets-pick', id: string): void
  (e: 'sets-apply'): void
  (e: 'sets-manage'): void
  (e: 'sets-name', value: string): void
  (e: 'sets-bind'): void
  (e: 'sets-save-as'): void
}>()

/*
  Esc 回到清單，不關整個面板：彈層與畫布的 Esc 在 document 上一律關最上層，
  所以這裡在 capture 階段先攔下，否則「存成指令組」打到一半的名稱會跟著面板一起消失。
*/
function onEsc(event: KeyboardEvent) {
  if (event.key !== 'Escape' && event.key !== 'Esc') return
  event.preventDefault()
  event.stopImmediatePropagation()
  emit('sets-back')
}
onMounted(() => document.addEventListener('keydown', onEsc, true))
onBeforeUnmount(() => document.removeEventListener('keydown', onEsc, true))

const pickedInRows = computed(() => props.vm.sets.rows.some((r) => r.id === props.vm.sets.picked))

/** 單選群組的方向鍵：移到上一個／下一個並選取，焦點跟著走。 */
function onArrow(event: KeyboardEvent, ids: string[], current: string, name: 'sets-scope' | 'sets-pick') {
  const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
  if (!step || ids.length === 0) return
  event.preventDefault()
  const at = Math.max(0, ids.indexOf(current))
  const next = ids[(at + step + ids.length) % ids.length]
  if (name === 'sets-scope') emit('sets-scope', next)
  else emit('sets-pick', next)
  const group = (event.currentTarget as HTMLElement | null)?.parentElement
  void nextTick(() => (group?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus())
}

const scopes = computed(() => [
  { key: 'save', label: props.labels.scopeSave },
  { key: 'card', label: props.labels.scopeCard },
])
</script>
