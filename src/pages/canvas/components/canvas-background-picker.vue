<template>
  <!-- 更換背景（美術方向 2026-10-18）：四個選項列，點了就套用，面板不關，讓玩家對著後面的頁面比。
       一般卡在宿主畫，沙盒卡在殼裡畫，同一個元件。 -->
  <div ref="rootEl" class="modify-scope bg-picker-scope" :lang="lang || null">
    <div class="modify-title">{{ labels.title }}</div>
    <div class="bg-picker-hint">{{ labels.hint }}</div>

    <template v-for="row in rows" :key="row.mode">
      <div
        class="modify-item bg-picker-item"
        :class="{ 'is-current': mode === row.mode }"
        role="button"
        tabindex="0"
        :aria-pressed="mode === row.mode"
        @click="pick(row.mode)"
        @keydown.enter.prevent="pick(row.mode)"
      >
        <span class="bg-picker-swatch" :class="'is-' + row.mode" :style="swatchStyle(row.mode)" aria-hidden="true">
          <svg v-if="row.mode === 'card'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="M20.5 15.5l-5-5-9 9" />
          </svg>
          <svg v-else-if="row.mode === 'custom' && !customUrl && !uploading" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M12 6v12M6 12h12" />
          </svg>
          <span v-else-if="row.mode === 'custom' && uploading" class="bg-picker-spinner"></span>
        </span>
        <span class="bg-picker-label">{{ row.label }}</span>
        <svg v-if="mode === row.mode" class="bg-picker-check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
      </div>

      <div v-if="row.mode === 'color' && mode === 'color'" class="bg-picker-colors">
        <span
          v-for="c in colors"
          :key="c.value"
          class="bg-picker-color"
          :class="{ 'is-current': color === c.value }"
          :style="{ backgroundColor: c.value }"
          role="button"
          tabindex="0"
          :aria-label="c.label"
          :aria-pressed="color === c.value"
          @click="$emit('color', c.value)"
          @keydown.enter.prevent="$emit('color', c.value)"
        ></span>
      </div>

      <div v-if="row.mode === 'custom' && (mode === 'custom' || customError || signInNeeded)" class="bg-picker-custom">
        <template v-if="mode === 'custom' && customUrl">
          <div class="bg-picker-custom-row">
            <span class="bg-picker-thumb" :style="{ backgroundImage: thumb(customUrl) }"></span>
            <span class="bg-picker-replace" :class="{ 'is-busy': uploading }" role="button" tabindex="0" :aria-disabled="uploading" @click="openFile" @keydown.enter.prevent="openFile">{{ uploading ? labels.uploading : labels.replace }}</span>
            <!-- 次要樣式、不跳確認：刪了重傳一次就回來（美術方向）。 -->
            <span v-if="!uploading" class="bg-picker-remove" role="button" tabindex="0" @click="$emit('delete')" @keydown.enter.prevent="$emit('delete')">{{ labels.remove }}</span>
          </div>
          <div class="bg-picker-note">{{ labels.customHint }}</div>
          <div class="bg-picker-note">{{ labels.uploadLimit }}</div>
        </template>
        <div v-if="signInNeeded" class="bg-picker-note">{{ labels.signIn }}</div>
        <div v-if="customError" class="bg-picker-error" role="alert">{{ customError }}</div>
      </div>

      <div v-if="saveError && saveErrorMode === row.mode" class="bg-picker-error" role="alert">
        {{ labels.saveError }}
        <span class="bg-picker-retry" role="button" tabindex="0" @click="$emit('retry')" @keydown.enter.prevent="$emit('retry')">{{ labels.retry }}</span>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { cssUrl, type BackgroundMode } from '../canvas-player-background'

const props = withDefaults(defineProps<{
  labels: Record<string, string>
  mode?: BackgroundMode
  color?: string
  customUrl?: string
  /** 模糊那一列的預覽：卡片目前畫的圖，在方塊裡糊掉畫 */
  blurPreviewUrl?: string
  colors?: Array<{ value: string; label: string }>
  uploading?: boolean
  canUpload?: boolean
  customError?: string
  saveError?: boolean
  saveErrorMode?: string
  accept?: string
  /** 畫面語言。沙盒殼的 <html lang> 固定，斷行規則（韓文照詞斷）要看選單自己的語言。 */
  lang?: string
}>(), { mode: 'card', color: '', customUrl: '', blurPreviewUrl: '', colors: () => [], uploading: false, canUpload: true, customError: '', saveError: false, saveErrorMode: '', accept: 'image/jpeg,image/png,image/webp' })

const emit = defineEmits<{
  (e: 'pick', mode: BackgroundMode): void
  (e: 'color', value: string): void
  (e: 'file', file: File): void
  (e: 'retry'): void
  (e: 'delete'): void
}>()

const rows = computed(() => ([
  { mode: 'card' as const, label: props.labels.optionOriginal },
  { mode: 'blur' as const, label: props.labels.optionBlur },
  { mode: 'color' as const, label: props.labels.optionSolid },
  { mode: 'custom' as const, label: props.labels.optionCustom },
]))

const signInNeeded = ref(false)
const rootEl = ref<HTMLElement | null>(null)

const thumb = (url: string) => cssUrl(url)

function swatchStyle(mode: BackgroundMode) {
  if (mode === 'blur' && props.blurPreviewUrl) return { '--bg-picker-blur': cssUrl(props.blurPreviewUrl) }
  if (mode === 'color') return { backgroundColor: props.color || (props.colors[0] && props.colors[0].value) || '' }
  if (mode === 'custom' && props.customUrl && !props.uploading) return { backgroundImage: cssUrl(props.customUrl) }
  return null
}

// 檔案選擇器用臨時建的原生 input：uni-app 會把模板裡的 <input> 換成它自己的元件，type=file 不可靠。
// 建在元件所在的文件裡（沙盒卡是殼的 iframe），選完就拿掉。
function openFile() {
  if (!props.canUpload) { signInNeeded.value = true; return }
  if (props.uploading) return
  const doc = rootEl.value?.ownerDocument || document
  const input = doc.createElement('input')
  input.type = 'file'
  input.accept = props.accept
  input.style.display = 'none'
  input.addEventListener('change', () => {
    const file = input.files && input.files[0]
    input.remove()
    if (file) emit('file', file)
  })
  doc.body.appendChild(input)
  input.click()
}

// 還沒有自訂圖時，點這一列直接開檔案選擇器；有圖就直接套用。
function pick(mode: BackgroundMode) {
  if (mode === 'custom' && !props.customUrl) { openFile(); return }
  signInNeeded.value = false
  emit('pick', mode)
}

</script>
