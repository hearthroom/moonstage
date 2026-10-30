<template>
 <div class="card mode-box response-preset" data-lt="response-preset">
  <div class="label">{{ t('responseSettings.preset.source') }}</div>
  <template v-if="applied">
   <div class="response-preset-name" data-lt="preset-current">{{ t('responseSettings.preset.current', { name: current!.title, n: current!.version }) }}</div>
   <div class="mode-hint">{{ t('responseSettings.preset.hint.on') }}</div>
  </template>
  <template v-else>
   <div class="mode-hint">{{ t('responseSettings.preset.hint.off') }}</div>
   <div class="mode-hint">{{ t('responseSettings.preset.hint.takeover') }}</div>
  </template>

  <div v-if="current?.state === 'unavailable'" class="response-preset-note" role="alert">
   <span class="response-error">{{ t('responseSettings.preset.loadFailed') }}</span>
   <button type="button" class="mode-item" data-action="preset-reload" :disabled="busy" @click="emit('stale')">{{ t('responseSettings.preset.loadFailed.retry') }}</button>
  </div>
  <div v-if="newer" class="response-preset-note" data-lt="preset-newer">
   <span class="mode-hint">{{ t('responseSettings.preset.newVersion', { name: current!.title, latest: newer.version, n: current!.version }) }}</span>
   <button type="button" class="mode-item" data-action="preset-upgrade" :disabled="busy || disabled" @click="apply(newer)">{{ t('responseSettings.preset.useNewVersion', { latest: newer.version }) }}</button>
  </div>
  <p v-if="toolNote" class="mode-hint" data-lt="preset-tool-reply">{{ toolNote }}</p>

  <div role="radiogroup" :aria-label="t('responseSettings.preset.pick.mine')">
   <!-- 套用著的預設已經封存、不在可選清單裡：照樣標成目前這個，不讓按鈕變成悄悄取消 -->
   <button v-if="orphan" type="button" class="preset-option" data-value="current" role="radio" :class="{ selected: choice === 'current' }" :aria-checked="choice === 'current' ? 'true' : 'false'" :disabled="busy" @click="choice = 'current'">
    <span class="preset-option-name">{{ t('responseSettings.preset.current', { name: current!.title, n: current!.version }) }}</span>
   </button>
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

  <div class="mode-hint">{{ t('responseSettings.preset.pick.note') }}</div>
  <p v-if="message" class="mode-hint" :class="{ 'response-error': failed }" role="status" data-lt="preset-message">{{ message }}</p>
  <div class="response-preset-actions">
   <button type="button" class="mode-item" data-action="preset-apply" :disabled="busy || disabled || !picked || picked.headRevisionId === current?.revisionId" @click="apply(picked)">
    {{ t(busy ? 'responseSettings.preset.applying' : 'responseSettings.preset.apply') }}
   </button>
   <button v-if="applied" type="button" class="mode-item" data-action="preset-stop" :disabled="busy || disabled" @click="apply(null)">{{ t('responseSettings.preset.useCard') }}</button>
   <button v-if="api.manage && choices.length" type="button" class="advanced-reset" data-action="preset-manage" @click="api.manage()">{{ t('responseSettings.preset.manage') }}</button>
  </div>
 </div>
</template>

<script setup lang="ts">
// 自訂預設：直接列在回覆偏好最下面（owner 2026-10-30），只有一種範圍——整張卡。
// 選了版本就固定在那個版本，作者之後存新版不會偷偷換掉，給一顆鍵讓玩家自己換。
import { computed, ref, watch } from 'vue'
import { applyOnce, newerVersion, presetFailure, readBinding, type PresetApi, type PresetBinding, type PresetChoice } from '../canvas-preset'

const props = defineProps<{
 api: PresetApi
 binding: PresetBinding | null
 choices: PresetChoice[]
 /** 面板正在存或讀：不能同時套用 */
 disabled?: boolean
 /** 「用工具回覆」在這個模型或模式不生效時的說明 */
 toolNote?: string
 /** 套用前問一下有沒有沒存的修改（套用後面板會重讀，沒存的會不見） */
 confirmLeave?: () => Promise<boolean>
 t: (key: string, values?: Record<string, unknown>) => string
}>()
const emit = defineEmits<{ (e: 'applied'): void; (e: 'stale'): void }>()

// 自己重讀過就用重讀的（面板那邊的重讀可能還沒回來），面板給了新的就跟著換
const current = ref<PresetBinding | null>(props.binding)
watch(() => props.binding, (b) => { current.value = b })
const applied = computed(() => current.value?.mode === 'revision')
const startChoice = (b: PresetBinding | null) => b?.mode !== 'revision' ? '' : props.choices.some((p) => p.id === b.presetId) ? b.presetId ?? '' : 'current'
const choice = ref(startChoice(props.binding))
watch([() => props.binding, () => props.choices], () => { choice.value = startChoice(current.value) })
const orphan = computed(() => applied.value && !props.choices.some((p) => p.id === current.value!.presetId))
const picked = computed(() => props.choices.find((p) => p.id === choice.value) ?? null)
const newer = computed(() => newerVersion(current.value, props.choices))
const busy = ref(false)
const message = ref('')
const failed = ref(false)
const modelName = (v: string) => props.api.modelName?.(v) || v

function fail(err: unknown) {
 const kind = presetFailure(err)
 failed.value = kind !== 'unknown'
 message.value = props.t(kind === 'failed' ? 'responseSettings.saveFailed' : kind === 'loadFailed' ? 'responseSettings.preset.loadFailed' : `responseSettings.preset.${kind}`)
}

/** 重讀這張卡現在套用的（版本被別處改了、或送出後一直沒收到回應）。讀不到就留著原本的。 */
async function reread(): Promise<PresetBinding | null> {
 try { current.value = readBinding(await props.api.card()) } catch { /* 留著原本的 */ }
 return current.value
}

async function apply(target: PresetChoice | null) {
 const now = current.value
 if (!now || busy.value) return
 if (props.confirmLeave && !await props.confirmLeave()) return
 busy.value = true
 message.value = ''
 failed.value = false
 const done = () => target ? props.t('responseSettings.preset.applied', { name: target.title, n: target.version }) : props.t('responseSettings.preset.reverted')
 try {
  await applyOnce((key) => props.api.apply(target?.headRevisionId ?? null, now.bindingVersion, key), () => { message.value = props.t('responseSettings.preset.unknown') })
  message.value = done()
  emit('applied')
 } catch (err) {
  fail(err)
  const kind = presetFailure(err)
  if (kind === 'conflict' || kind === 'unknown') {
   // 重讀完才放開按鈕：不讓玩家拿舊版本號再撞一次。一直沒收到回應的，看重讀結果判斷到底成了沒有
   const before = current.value
   const after = await reread()
   if (kind === 'unknown') {
    const landed = after && after !== before && (target ? after.revisionId === target.headRevisionId : after.mode === 'card_default')
    if (landed) { failed.value = false; message.value = done(); emit('applied') }
    else { failed.value = true; message.value = props.t('responseSettings.saveFailed') }
   }
  }
 } finally {
  busy.value = false
 }
}
</script>

<style scoped>
@layer lt-base {
 .response-preset{display:flex;flex-direction:column;gap:8px}
 .response-preset-name{font-weight:600;overflow-wrap:anywhere}
 .response-preset-note{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
 .response-preset-actions{display:flex;flex-wrap:wrap;gap:8px}
 .preset-option{display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:100%;min-height:44px;padding:10px 12px;margin-top:8px;border:1px solid var(--lt-canvas-sheet-line);border-radius:var(--lt-canvas-radius);background:var(--lt-canvas-sheet-item-bg);color:var(--lt-canvas-sheet-fg);font:inherit;text-align:start;cursor:pointer}
 .preset-option.selected{border-color:var(--lt-canvas-accent);box-shadow:inset 0 0 0 1px var(--lt-canvas-accent)}
 .preset-option:focus-visible{outline:2px solid var(--lt-canvas-accent);outline-offset:2px}
 .preset-option:disabled{cursor:default;opacity:.6}
 .preset-option-name{font-weight:600;overflow-wrap:anywhere}
 .preset-option-version{font-weight:400;opacity:.7}
 .preset-empty{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:8px}
 .response-preset .advanced-reset,.response-preset .mode-item{min-height:44px}
 .response-preset > p{margin:0}
}
</style>
