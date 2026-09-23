<template>
  <div class="capacity-scope">
  <!--
    第一輪就裝不下的卡：一句說明，底下是伺服器說裝得下的玩法（一個或兩個），最後是取消。
    第一個選項是建議的那一個，用強調色；其餘走外框。沙箱卡由殼用同一個元件畫
    （sandbox/render/panels.ts），作者對 .capacity-* 寫的美化兩邊都套得上。
    存失敗的原因留在這裡：沙箱卡的 iframe 蓋著宿主頁，宿主的提示玩家不一定看得到。
  -->
    <div class="capacity-content">{{ content }}</div>
    <div class="capacity-options">
      <div
        v-for="(option, index) in options"
        :key="option.key"
        class="capacity-option"
        :class="{ 'is-primary': index === 0, 'is-busy': saving }"
        role="button"
        :tabindex="saving ? -1 : 0"
        :aria-disabled="saving ? 'true' : 'false'"
        @click="pick(option.key)"
        @keydown.enter.prevent="pick(option.key)"
      >
        <div class="capacity-option-label">{{ option.label }}</div>
        <div v-if="option.desc" class="capacity-option-desc">{{ option.desc }}</div>
      </div>
    </div>
    <div v-if="error" class="capacity-error" role="alert">{{ error }}</div>
    <div class="capacity-cancel" role="button" tabindex="0"
         @click="$emit('cancel')"
         @keydown.enter.prevent="$emit('cancel')">{{ cancelText }}</div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  content?: string
  options?: Array<{ key: string; label: string; desc?: string }>
  saving?: boolean
  error?: string
  cancelText?: string
}>(), { content: '', options: () => [], saving: false, error: '', cancelText: 'Cancel' })

const emit = defineEmits<{ (e: 'pick', key: string): void; (e: 'cancel'): void }>()

// 存檔中再點一次會送出第二個請求、重送兩次同一則訊息。
function pick(key: string) {
  if (props.saving) return
  emit('pick', key)
}
</script>
