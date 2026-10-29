<template>
 <div class="preset-picker" data-lt="preset-picker">
  <div class="label preset-picker-title">{{ t('responseSettings.preset.pick.title') }}</div>

  <div class="card mode-box">
   <div class="label" id="preset-scope-label">{{ t('responseSettings.preset.pick.scope') }}</div>
   <div class="radio-group" role="radiogroup" aria-labelledby="preset-scope-label">
    <button v-for="s in scopes" :key="s" type="button" class="mode-item" data-axis="preset-scope" :data-value="s" role="radio"
     :class="{ selected: scope === s }" :aria-checked="scope === s ? 'true' : 'false'" :disabled="busy" @click="pickScope(s)">{{ t(`responseSettings.preset.scope.${s}`) }}</button>
   </div>
   <div class="mode-hint">{{ t(`responseSettings.preset.scope.${scope}.hint`) }}</div>
  </div>

  <div class="card mode-box" role="radiogroup" :aria-label="t('responseSettings.preset.pick.mine')">
   <button type="button" class="preset-option" data-value="" role="radio" :class="{ selected: choice === '' }" :aria-checked="choice === '' ? 'true' : 'false'" :disabled="busy" @click="choice = ''">
    <span class="preset-option-name">{{ t('responseSettings.preset.pick.card') }}</span>
    <span class="mode-hint">{{ t('responseSettings.preset.pick.card.hint') }}</span>
   </button>
   <div class="label preset-picker-mine">{{ t('responseSettings.preset.pick.mine') }}</div>
   <div v-if="!choices.length" class="preset-empty" data-lt="preset-empty">
    <div class="preset-option-name">{{ t('responseSettings.preset.pick.empty.title') }}</div>
    <div class="mode-hint">{{ t('responseSettings.preset.pick.empty.body') }}</div>
    <button v-if="api.manage" type="button" class="advanced-reset" data-action="preset-manage" @click="api.manage()">{{ t('responseSettings.preset.pick.empty.action') }}</button>
   </div>
   <button v-for="p in choices" :key="p.id" type="button" class="preset-option" :data-value="p.id" role="radio"
    :class="{ selected: choice === p.id }" :aria-checked="choice === p.id ? 'true' : 'false'" :disabled="busy" @click="choice = p.id">
    <span class="preset-option-name">{{ p.title }} <span class="preset-option-version">{{ t('responseSettings.preset.pick.version', { n: p.version }) }}</span></span>
    <template v-if="p.recommendedModels.length">
     <span class="mode-hint">{{ t('responseSettings.preset.pick.models', { models: p.recommendedModels.map(modelName).join(t('responseSettings.preset.separator')) }) }}</span>
     <span class="mode-hint">{{ t('responseSettings.preset.pick.models.hint') }}</span>
    </template>
   </button>
  </div>

  <p v-if="message" class="mode-hint" :class="{ 'response-error': failed }" role="status" data-lt="preset-message">{{ message }}</p>
  <div class="mode-hint preset-note">{{ t('responseSettings.preset.pick.note') }}</div>
  <button v-if="api.manage && choices.length" type="button" class="advanced-reset preset-manage" data-action="preset-manage" @click="api.manage()">{{ t('responseSettings.preset.manage') }}</button>

  <div class="role-setting__actions">
   <button type="button" class="icon-back" data-action="preset-back" :disabled="busy" @click="emit('back')">{{ t('main.back') }}</button>
   <button type="button" class="complete-btn" data-action="preset-apply" :disabled="busy || !changed" @click="apply">
    {{ t(busy ? 'responseSettings.preset.applying' : choice ? 'responseSettings.preset.apply' : 'responseSettings.preset.applyCard') }}
   </button>
  </div>
 </div>
</template>

<script setup lang="ts">
// 選用預設：先選範圍（這段對話／這張卡的新存檔），再選「不用預設」或自己的某個預設。
// 每次只改一個範圍。選了版本就固定在那個版本，作者之後存新版不會偷偷換掉。
import { computed, ref } from 'vue'
import { applyOnce, presetFailure, readBinding, type PresetApi, type PresetBinding, type PresetChoice, type PresetScope } from '../canvas-preset'

const props = defineProps<{ api: PresetApi; conversationId: string; binding: PresetBinding | null; choices: PresetChoice[]; t: (key: string, values?: Record<string, unknown>) => string }>()
const emit = defineEmits<{ (e: 'back'): void; (e: 'applied', scope: PresetScope, message: string): void }>()

const scopes: PresetScope[] = ['conversation', 'card']
const scope = ref<PresetScope>('conversation')
const card = ref<PresetBinding | null>(null)
const current = computed(() => (scope.value === 'conversation' ? props.binding : card.value))
const choice = ref(props.binding?.mode === 'revision' ? props.binding.presetId ?? '' : '')
const busy = ref(false)
const message = ref('')
const failed = ref(false)
const modelName = (v: string) => props.api.modelName?.(v) || v
const picked = computed(() => props.choices.find((p) => p.id === choice.value) ?? null)
// 選的就是現在用的那一版：不必再按一次
const changed = computed(() => !!current.value && (picked.value ? current.value.revisionId !== picked.value.headRevisionId : current.value.mode !== 'card_default'))

async function pickScope(next: PresetScope) {
 scope.value = next
 message.value = ''
 if (next === 'card' && !card.value) {
  busy.value = true
  try { card.value = readBinding(await props.api.card()) } catch (err) { fail(err) } finally { busy.value = false }
 }
 const now = current.value
 choice.value = now?.mode === 'revision' ? now.presetId ?? '' : ''
}

function fail(err: unknown) {
 const kind = presetFailure(err)
 failed.value = kind !== 'unknown'
 message.value = props.t(kind === 'failed' ? 'responseSettings.saveFailed' : kind === 'loadFailed' ? 'responseSettings.preset.loadFailed' : `responseSettings.preset.${kind}`)
}

async function apply() {
 const now = current.value
 if (!now || busy.value || !changed.value) return
 busy.value = true
 message.value = ''
 failed.value = false
 const target = picked.value
 try {
  await applyOnce((key) => props.api.apply(scope.value, props.conversationId, target?.headRevisionId ?? null, now.bindingVersion, key), () => { message.value = props.t('responseSettings.preset.unknown') })
  const done = target
   ? props.t(`responseSettings.preset.applied.${scope.value}`, { name: target.title, n: target.version })
   : props.t(`responseSettings.preset.reverted.${scope.value}`)
  emit('applied', scope.value, done)
 } catch (err) {
  fail(err)
 } finally {
  busy.value = false
 }
}
</script>

<style scoped>
@layer lt-base {
 .preset-picker{display:flex;flex-direction:column;gap:12px}
 .preset-picker-title{font-size:16px}
 .preset-picker-mine{margin-top:12px}
 .preset-option{display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:100%;min-height:44px;padding:10px 12px;margin-top:8px;border:1px solid var(--lt-canvas-sheet-line);border-radius:var(--lt-canvas-radius);background:var(--lt-canvas-sheet-item-bg);color:var(--lt-canvas-sheet-fg);font:inherit;text-align:start;cursor:pointer}
 .preset-option.selected{border-color:var(--lt-canvas-accent);box-shadow:inset 0 0 0 1px var(--lt-canvas-accent)}
 .preset-option:focus-visible{outline:2px solid var(--lt-canvas-accent);outline-offset:2px}
 .preset-option:disabled{cursor:default;opacity:.6}
 .preset-option-name{font-weight:600;overflow-wrap:anywhere}
 .preset-option-version{font-weight:400;opacity:.7}
 .preset-empty{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:8px}
 .preset-note,.preset-manage{align-self:flex-start}
}
</style>
