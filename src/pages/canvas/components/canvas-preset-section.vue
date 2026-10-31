<template>
 <div class="card mode-box response-preset" data-lt="response-preset">
  <div class="label">{{ t('responseSettings.preset.source') }}</div>
  <template v-if="applied">
   <div class="response-preset-current">
    <span class="response-preset-name" data-lt="preset-current">{{ current!.title }}</span>
    <span class="response-preset-tag">{{ t('responseSettings.preset.pick.tag.inUse') }}</span>
   </div>
   <div class="mode-hint">{{ t('responseSettings.preset.hint.on') }}</div>
   <!-- 作者改回私人或被下架：這張卡照常用，說一句讓玩家知道為什麼在預設庫找不到它 -->
   <p v-if="unlisted" class="mode-hint response-preset-unlisted" role="status" data-lt="preset-unlisted">
    <strong>{{ t('responseSettings.preset.unlisted') }}</strong> {{ t('responseSettings.preset.unlisted.hint') }}
   </p>
  </template>
  <template v-else>
   <div class="mode-hint">{{ t('responseSettings.preset.hint.off') }}</div>
   <div class="mode-hint">{{ t('responseSettings.preset.hint.takeover') }}</div>
  </template>

  <div v-if="current?.state === 'unavailable'" class="response-preset-note" role="alert">
   <span class="response-error">{{ t('responseSettings.preset.loadFailed') }}</span>
   <button type="button" class="mode-item" data-action="preset-reload" :disabled="busy" @click="emit('stale')">{{ t('responseSettings.preset.loadFailed.retry') }}</button>
  </div>
  <p v-if="toolNote" class="mode-hint" data-lt="preset-tool-reply">{{ toolNote }}</p>

  <p v-if="shown" class="mode-hint" :class="{ 'response-error': failed }" role="status" data-lt="preset-message">{{ shown }}</p>
  <div class="response-preset-actions">
   <button type="button" class="mode-item" data-action="preset-pick" :disabled="busy || disabled" @click="emit('pick')">
    {{ t(applied ? 'responseSettings.preset.change' : 'responseSettings.preset.pick.title') }}
   </button>
   <button v-if="applied" type="button" class="mode-item" data-action="preset-stop" :disabled="busy || disabled" @click="apply(null)">{{ t('responseSettings.preset.useCard') }}</button>
   <button v-if="api.manage" type="button" class="advanced-reset" data-action="preset-manage" @click="api.manage()">{{ t('responseSettings.preset.manage') }}</button>
  </div>
 </div>
</template>

<script setup lang="ts">
// 自訂預設：回覆偏好最下面一區（owner 2026-10-30），只有一種範圍——整張卡。
// 這裡只顯示目前套用的、取消套用；換一份在選擇器（我的／喜愛與用過／預設庫）。
// 綁的是預設本身：作者之後存檔，這張卡下一次回覆就用新內容（跟著作者走），沒有換版這件事。
import { computed, ref, watch } from 'vue'
import { usePresetApply } from '../canvas-preset-apply'
import type { PresetApi, PresetBinding } from '../canvas-preset'

const props = defineProps<{
 api: PresetApi
 binding: PresetBinding | null
 /** 目前套用的那份已不公開（作者改回私人或被下架） */
 unlisted?: boolean
 /** 從選擇器回來時帶的結果（已套用某份），顯示在這一區 */
 notice?: string
 /** 面板正在存或讀：不能同時套用 */
 disabled?: boolean
 /** 「用工具回覆」在這個模型或模式不生效時的說明 */
 toolNote?: string
 /** 套用前問一下有沒有沒存的修改（套用後面板會重讀，沒存的會不見） */
 confirmLeave?: () => Promise<boolean>
 t: (key: string, values?: Record<string, unknown>) => string
}>()
// changed：這張卡套用的預設變了——外層要重讀偏好，接管說明與被鎖的項目才跟得上；pick：打開選擇器
const emit = defineEmits<{ (e: 'changed'): void; (e: 'stale'): void; (e: 'pick'): void }>()

// 自己重讀過就用重讀的（面板那邊的重讀可能還沒回來），面板給了新的就跟著換
const current = ref<PresetBinding | null>(props.binding)
watch(() => props.binding, (b) => { current.value = b })
// 綁定 GET 換版期間可能回 'revision'，讀進來已經歸成 'preset'；以 presetId 判斷套用的是哪份
const applied = computed(() => current.value?.mode === 'preset' && !!current.value.presetId)
const { busy, message, failed, apply } = usePresetApply({
 api: () => props.api, binding: current, t: props.t, confirmLeave: props.confirmLeave,
 onChanged: () => emit('changed'), onStale: () => emit('stale'),
})
const shown = computed(() => message.value || props.notice || '')
</script>

<style scoped>
@layer lt-base {
 .response-preset{display:flex;flex-direction:column;gap:8px}
 .response-preset-current{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
 .response-preset-name{min-width:0;font-weight:600;overflow-wrap:anywhere}
 .response-preset-tag{flex:none;font-size:13px;color:var(--lt-canvas-accent)}
 .response-preset-note{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
 .response-preset-actions{display:flex;flex-wrap:wrap;gap:8px}
 .response-preset .advanced-reset,.response-preset .mode-item{min-height:44px}
 .response-preset > p{margin:0}
}
</style>
