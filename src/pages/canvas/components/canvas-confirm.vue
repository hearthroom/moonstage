<template>
  <div class="confirm-scope">
  <!--
    一次性確認。節點名照 MMD（.confirm-scope > .confirm-content + .confirm-bottom
    裡確定在前、取消在後）——作者的卡對這一族寫了按鈕外觀，順序換掉他的
    `:first-child` 之類的規則就會上錯顆。
  -->
    <div class="confirm-content">{{ content }}</div>
    <div v-if="options.length" class="confirm-options" role="group" :aria-label="optionsTitle">
      <div class="confirm-options-title">{{ optionsTitle }}</div>
      <div v-for="option in options" :key="option.key" class="confirm-option" role="checkbox" tabindex="0"
           :aria-checked="option.checked ? 'true' : 'false'"
           @click="$emit('toggle-option', option.key)"
           @keydown.enter.prevent="$emit('toggle-option', option.key)"
           @keydown.space.prevent="$emit('toggle-option', option.key)">
        <span class="confirm-check-box" :class="{ 'is-on': option.checked }" aria-hidden="true">{{ option.checked ? '✓' : '' }}</span>
        <span>{{ option.label }}</span>
      </div>
      <div class="confirm-options-hint">{{ optionsHint }}</div>
    </div>
    <div class="confirm-bottom">
      <div class="ok-btn" role="button" tabindex="0"
           @click="$emit('ok')"
           @keydown.enter.prevent="$emit('ok')">{{ okText }}</div>
      <div class="btn-gap"></div>
      <div class="cancel-btn" role="button" tabindex="0"
           @click="$emit('cancel')"
           @keydown.enter.prevent="$emit('cancel')">{{ cancelText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  content?: string
  okText?: string
  cancelText?: string
  optionsTitle?: string
  optionsHint?: string
  options?: Array<{ key: string; label: string; checked: boolean }>
}>(), { content: '', okText: 'OK', cancelText: 'Cancel', optionsTitle: '', optionsHint: '', options: () => [] })

defineEmits<{ (e: 'ok'): void; (e: 'cancel'): void; (e: 'toggle-option', key: string): void }>()
</script>
