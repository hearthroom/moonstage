<template>
  <!-- 首屏網頁：開新對話時畫布最上方的作者網頁（AI 風月的「詳細介紹」）。只顯示、不送模型。 -->
  <div ref="box" class="opening-page" data-lt="opening-page"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { mountOpeningPage, type OpeningPageMount } from '../../../common/opening-page'
import type { MacroContext } from '../canvas-rule-engine-core'

const props = defineProps<{ html: string; title?: string; macros?: MacroContext }>()
const emit = defineEmits<{ fill: [text: string]; send: [text: string] }>()

const box = ref<HTMLElement | null>(null)
let mounted: OpeningPageMount | null = null

function mount() {
  mounted?.destroy()
  mounted = null
  if (!box.value || !props.html.trim()) return
  mounted = mountOpeningPage(box.value, props.html, {
    fill: (text) => emit('fill', text),
    send: (text) => emit('send', text),
  }, { title: props.title, macros: props.macros })
}

onMounted(mount)
watch(() => props.html, mount)
watch(() => [props.macros?.user, props.macros?.char], () => mounted?.updateMacros(props.macros || {}))
onBeforeUnmount(() => { mounted?.destroy(); mounted = null })
</script>

<style scoped>
/* 貼滿聊天欄：框自己抵掉訊息區的內距（common/opening-page fitOpeningFrame），這裡不再加。 */
.opening-page { margin: 0; }
</style>
