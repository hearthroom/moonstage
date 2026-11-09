<template>
  <!--
    卡片數值面板。一般頁（canvas.vue）與沙箱殼（sandbox/shell.ts）掛的是同一個元件：
    鍵在畫布右下、輸入區上方；面板是畫布的標準彈層（canvas-popup，置中、遮罩、Esc 關、焦點鎖在裡面）。
    外框（標題、更新於、原始數值切換、出錯提示）是平台畫的；作者的皮膚只畫在 .lt-state-skin 裡，
    皮膚的 CSS 已經加上 .lt-state-skin 前綴（common/panel/state-panel.ts），漏不出去。

    元件不用 i18n：殼裡沒有 vue-i18n，所有字由呼叫端給（已是玩家語系）。
    data-lt 是作者的美化掛點，名字定了就不改。
  -->
  <div class="lt-state-anchor" data-lt="state-panel">
    <button
      type="button"
      class="lt-state-btn"
      data-lt="state-panel-toggle"
      :aria-label="labels.open"
      :title="labels.open"
      aria-haspopup="dialog"
      :aria-expanded="open ? 'true' : 'false'"
      @click="open = true"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" />
        <rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" />
      </svg>
    </button>
    <CanvasPopup :open="open" :title="labels.title" :close-label="labels.close" heading @close="open = false">
      <div class="lt-state-panel" data-lt="state-panel-body">
        <div class="lt-state-meta">
          <span class="lt-state-updated">{{ updatedText }}</span>
          <button type="button" class="lt-state-raw-toggle" :aria-pressed="raw ? 'true' : 'false'" @click="raw = !raw">
            {{ raw ? labels.showPanel : labels.showRaw }}
          </button>
        </div>
        <div v-if="raw" class="lt-state-raw">
          <pre class="lt-state-json">{{ json }}</pre>
          <template v-if="rejectedJson">
            <div class="lt-state-raw-label">{{ labels.rejected }}</div>
            <pre class="lt-state-json">{{ rejectedJson }}</pre>
          </template>
        </div>
        <div v-else-if="result.error" class="lt-state-error" role="alert">
          <template v-if="audience === 'author'">
            <p class="lt-state-error-title">{{ errorText }}</p>
          </template>
          <template v-else>
            <p class="lt-state-error-title">{{ labels.unavailable }}</p>
            <p class="lt-state-error-sub">{{ labels.unavailableSub }}</p>
          </template>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -- 已過 renderPanel 的清理（無 script、無 on*、無 javascript:） -->
        <div v-else ref="skinEl" :class="skinClass" data-lt="state-panel-skin" v-html="result.html"></div>
        <div class="lt-state-toast" role="status" aria-live="polite" :data-show="toast ? 'on' : 'off'">{{ toast }}</div>
      </div>
    </CanvasPopup>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import CanvasPopup from './canvas-popup.vue'
import { bindPanelCopy } from '@/common/panel/handlebars-lite'
import { renderStatePanelSkin, STATE_PANEL_SKIN_CLASS, type StatePanelAudience, type StatePanelLabels } from '@/common/panel/state-panel'
import { fillLabel, type CardStateChange, type CardStateUpdate } from '@/common/card-state'

const props = defineProps<{
  template: string
  /** 現在生效的數值；null＝還沒有任何數值（皮膚照樣畫，拿到空物件）。 */
  state: { data: unknown; changes: CardStateChange[]; rejected?: unknown[] } | null
  update: CardStateUpdate
  audience: StatePanelAudience
  labels: StatePanelLabels
}>()

const open = ref(false)
const raw = ref(false)
const skinClass = STATE_PANEL_SKIN_CLASS

const result = computed(() => renderStatePanelSkin(props.template, props.state?.data ?? {}, props.state?.changes ?? [], props.audience))

const updatedText = computed(() => {
  const u = props.update
  if (u.kind === 'latest') return props.labels.updatedLatest
  if (u.kind === 'ago') return u.n === 1 ? props.labels.updatedOneAgo : fillLabel(props.labels.updatedAgo, { n: u.n })
  return props.labels.updatedOpening
})

const errorText = computed(() => {
  const e = result.value.error
  if (!e) return ''
  return e.helper
    ? fillLabel(props.labels.errorHelper, { line: e.line, helper: e.helper })
    : fillLabel(props.labels.errorAt, { line: e.line, message: e.message })
})

const json = computed(() => JSON.stringify(props.state?.data ?? {}, null, 2))
// 沒被採用的變更只給作者看（伺服器也只對作者送這一欄）。
const rejectedJson = computed(() => (props.audience === 'author' && props.state?.rejected?.length ? JSON.stringify(props.state.rejected, null, 2) : ''))

const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(text: string) {
  toast.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = ''; toastTimer = null }, 1600)
}

// 皮膚裡的 data-panel-copy：點了複製，跳一個「已複製」。皮膚容器隨原始數值切換重建，跟著重綁。
const skinEl = ref<HTMLElement | null>(null)
let unbindCopy: (() => void) | null = null
watch(skinEl, (el) => {
  if (unbindCopy) { unbindCopy(); unbindCopy = null }
  if (el) unbindCopy = bindPanelCopy(el, () => showToast(props.labels.copied))
}, { flush: 'post' })

onBeforeUnmount(() => {
  if (unbindCopy) unbindCopy()
  if (toastTimer) clearTimeout(toastTimer)
})

defineExpose({ open, raw })
</script>
