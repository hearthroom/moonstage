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
   <!-- 綁著的預設已經封存、不在可選清單裡：照樣標成目前這個，不讓按鈕變成悄悄解除 -->
   <button v-if="orphan" type="button" class="preset-option" data-value="current" role="radio" :class="{ selected: choice === 'current' }" :aria-checked="choice === 'current' ? 'true' : 'false'" :disabled="busy" @click="choice = 'current'">
    <span class="preset-option-name">{{ t('responseSettings.preset.current', { name: current!.title, n: current!.version }) }}</span>
   </button>
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

  <div class="mode-hint preset-note">{{ t('responseSettings.preset.pick.note') }}</div>
  <button v-if="api.manage && choices.length" type="button" class="advanced-reset preset-manage" data-action="preset-manage" @click="api.manage()">{{ t('responseSettings.preset.manage') }}</button>

  <!-- 結果與錯誤放在貼底的動作列裡：列會蓋住捲動內容，訊息放在列上面才一直看得到 -->
  <div class="preset-picker-bar">
   <p v-if="message" class="mode-hint" :class="{ 'response-error': failed }" role="status" data-lt="preset-message">{{ message }}</p>
  <div class="role-setting__actions">
   <button type="button" class="icon-back" data-action="preset-back" :disabled="busy" @click="emit('back')">{{ t('main.back') }}</button>
   <button type="button" class="complete-btn" data-action="preset-apply" :disabled="busy || !changed" @click="apply">
    {{ t(busy ? 'responseSettings.preset.applying' : choice || !changed ? 'responseSettings.preset.apply' : 'responseSettings.preset.applyCard') }}
   </button>
  </div>
  </div>
 </div>
</template>

<script setup lang="ts">
// 選用預設：先選範圍（這段對話／這張卡的新存檔），再選「不用預設」或自己的某個預設。
// 每次只改一個範圍。選了版本就固定在那個版本，作者之後存新版不會偷偷換掉。
import { computed, ref, watch } from 'vue'
import { applyOnce, presetFailure, readBinding, type PresetApi, type PresetBinding, type PresetChoice, type PresetScope } from '../canvas-preset'

const props = defineProps<{ api: PresetApi; conversationId: string; binding: PresetBinding | null; choices: PresetChoice[]; t: (key: string, values?: Record<string, unknown>) => string }>()
const emit = defineEmits<{ (e: 'back'): void; (e: 'applied', scope: PresetScope, message: string): void; (e: 'stale'): void }>()

const scopes: PresetScope[] = ['conversation', 'card']
const scope = ref<PresetScope>('conversation')
const card = ref<PresetBinding | null>(null)
// 這段對話的綁定：自己重讀過就用重讀的（面板那邊的重讀可能還沒回來），面板給了新的就跟著換
const conversation = ref<PresetBinding | null>(props.binding)
watch(() => props.binding, (b) => { conversation.value = b })
const current = computed(() => (scope.value === 'conversation' ? conversation.value : card.value))
const startChoice = (b: PresetBinding | null) => b?.mode !== 'revision' ? '' : props.choices.some((p) => p.id === b.presetId) ? b.presetId ?? '' : 'current'
const choice = ref(startChoice(props.binding))
const orphan = computed(() => current.value?.mode === 'revision' && !props.choices.some((p) => p.id === current.value!.presetId))
const busy = ref(false)
const message = ref('')
const failed = ref(false)
const modelName = (v: string) => props.api.modelName?.(v) || v
const picked = computed(() => props.choices.find((p) => p.id === choice.value) ?? null)
// 選的就是現在用的那一版：不必再按一次
const changed = computed(() => !!current.value && choice.value !== 'current' && (picked.value ? current.value.revisionId !== picked.value.headRevisionId : current.value.mode !== 'card_default'))

async function loadCard() {
 busy.value = true
 try { card.value = readBinding(await props.api.card()) } catch (err) { fail(err) } finally { busy.value = false }
}
async function pickScope(next: PresetScope) {
 scope.value = next
 message.value = ''
 if (next === 'card' && !card.value) await loadCard()
 choice.value = startChoice(current.value)
}

function fail(err: unknown) {
 const kind = presetFailure(err)
 failed.value = kind !== 'unknown'
 message.value = props.t(kind === 'failed' ? 'responseSettings.saveFailed' : kind === 'loadFailed' ? 'responseSettings.preset.loadFailed' : `responseSettings.preset.${kind}`)
}

/** 重讀這個範圍現在的綁定（版本被別處改了、或送出後一直沒收到回應）。對話範圍的同時通知面板重讀。 */
async function reread(): Promise<PresetBinding | null> {
 if (scope.value === 'card') { card.value = null; await loadCard(); return card.value }
 emit('stale')
 try { conversation.value = readBinding(await props.api.conversation(props.conversationId)) } catch { /* 讀不到：留著原本的 */ }
 return conversation.value
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
  const kind = presetFailure(err)
  if (kind === 'conflict' || kind === 'unknown') {
   // 重讀完才放開按鈕：不讓玩家拿舊版本號再撞一次。一直沒收到回應的，看重讀結果判斷到底成了沒有
   const after = await reread()
   if (kind === 'unknown') {
    const landed = after && (target ? after.revisionId === target.headRevisionId : after.mode === 'card_default')
    if (landed) emit('applied', scope.value, target ? props.t(`responseSettings.preset.applied.${scope.value}`, { name: target.title, n: target.version }) : props.t(`responseSettings.preset.reverted.${scope.value}`))
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
 /* 選項很多時，返回與套用仍留在畫面上：貼著彈層的捲動容器底部 */
 .preset-picker-bar{position:sticky;bottom:0;z-index:1;display:flex;flex-direction:column;gap:6px;padding-block:8px;background:var(--lt-canvas-sheet-bg)}
 .preset-picker-bar > p{margin:0}
 .preset-manage,.preset-empty .advanced-reset{min-height:44px}
}
</style>
