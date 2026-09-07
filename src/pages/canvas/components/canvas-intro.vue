<template>
  <div
    class="item Ai avatar-body mes"
    :class="{ 'is-empty': !String(text || '').trim() }"
    data-lt="description"
    is_user="false"
    is_system="true"
  >
    <div class="touch-scope mes_block">
      <div
        ref="bodyEl"
        class="content left mes_text intro-body"
        :class="{ 'is-open': open, 'is-clamped': !open && overflowing }"
        role="button"
        tabindex="0"
        :aria-expanded="open ? 'true' : 'false'"
        @click="$emit('toggle')"
        @keydown.enter.prevent="$emit('toggle')"
        @keydown.space.prevent="$emit('toggle')"
      >
        <!-- 收行套在這一層而不是氣泡本體：氣泡有內距，-webkit-line-clamp 直接套在有內距的盒子上，
             被裁掉的第三行會從下內距露出半截（owner 2026-09-07 手機截圖）。 -->
        <span ref="textEl" class="intro-text">{{ text }}</span>
        <!-- 右下角的展開狀態。三行內就放得下的介紹沒有東西可展開，圖示也不出現。 -->
        <span class="intro-toggle" :hidden="!open && !overflowing" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/*
 角色介紹。示範卡的作者在他的樣式裡寫著
       `.item.Ai.avatar-body{display:none}`，旁邊還留了一行註解說「要顯示就把這行刪了」。
       所以這個節點必須存在——即使沒有描述文字，也必須畫得出來，
       否則那條規則命中零個節點，作者只會覺得引擎壞了。

       但「存在」不等於「畫一個空框」：卡片沒有描述時，這一列帶 is-empty，
       由 canvas.css 收起來。作者的卡把 .content.left 漆成有邊框的氣泡時，
       一個空的介紹列就是標題底下那個莫名其妙的白色小空框（owner 2026-09-04
       回報：每個對話都有、PC 也有）。
*/
const props = defineProps<{ text?: string; open?: boolean }>()
defineEmits<{ (e: 'toggle'): void }>()

const bodyEl = ref<HTMLElement | null>(null)
const textEl = ref<HTMLElement | null>(null)
/** 收起時文字有沒有被裁掉——沒被裁掉就不畫展開圖示，也沒有可展開的事。 */
const overflowing = ref(false)

function measure() {
  const el = textEl.value
  if (!el) return
  // 展開時量不到收起的高度；沿用上一次的結果，收回去時再量。
  if (props.open) return
  overflowing.value = el.scrollHeight > el.clientHeight + 1
}

let observer: ResizeObserver | null = null
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && bodyEl.value) {
    observer = new ResizeObserver(() => measure())
    observer.observe(bodyEl.value)
  }
})
watch(() => [props.text, props.open], () => { void nextTick(measure) })
onBeforeUnmount(() => { observer?.disconnect(); observer = null })
</script>
