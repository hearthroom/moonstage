<template>
  <svg v-if="state === 'continue'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z" />
  </svg>
  <span v-else-if="state === 'pending'" class="is-spinning" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" focusable="false">
      <circle cx="12" cy="12" r="9" stroke-dasharray="28 20" opacity="0.7" />
    </svg>
  </span>
  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 19V5M5 12L12 5L19 12" />
  </svg>
</template>

<script setup lang="ts">
/* 主鍵的圖示。輸入區折疊與展開兩態各有一顆主鍵（MMD 的 DOM 就是兩顆，一次只露一顆），
   圖示抽出來免得兩份 SVG 漂移。
   轉圈轉的是外面那層 span，不是 svg 本身：瀏覽器不把 svg 元素上的 transform 動畫交給合成器，
   整段生成期間每一幀都重畫整頁（2026-10-01 手機模擬量到等待期間主執行緒被重畫吃滿）。 */
defineProps<{ state: string }>()
</script>
