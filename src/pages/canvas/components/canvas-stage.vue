<template>
  <div
    id="bg1"
    class="chat-scope-box"
    data-lt="page"
    :data-lt-player-bg="playerMode || null"
    :data-lt-player-tone="lightTone ? 'light' : null"
    :style="stageStyle"
  >
    <!-- 玩家自選背景（模糊／純色／自訂）畫在這一層，不畫在 #bg1：模糊加在 #bg1 上會連訊息一起糊。
         卡片原圖時這層不畫東西，背景照舊由 #bg1 的兩個變數畫，作者的 CSS 照舊蓋得到。 -->
    <div v-if="playerMode" class="lt-stage-bg" :class="'is-' + playerMode" :style="layerStyle" aria-hidden="true"></div>
    <div
      id="scrollview"
      class="scroll-view uni-scroll-view"
      ref="scrollEl"
      @scroll="$emit('scroll', $event)"
    >
      <!-- #chat 是酒館的訊息柱，#msglistview 是 MMD 的訊息列容器。
           兩個都是 id，不能掛同一個節點，所以分成兩層——外層負責留白與寬度，
           內層是真正的列表。 -->
      <div id="chat">
        <div id="msglistview" class="chat-body" data-lt="chat">
          <slot></slot>
          <!-- 捲底哨兵：內容什麼時候撐完只有版面知道，用它替代猜延遲。 -->
          <div id="chat-scroll-anchor" class="chat-scroll-anchor" ref="anchorEl"></div>
        </div>
      </div>
    </div>
    <!-- 作者資產的根。實際容器由 author-asset-mount 建在 body 上，這個節點只是
         讓作者的 CSS 有一個可指的畫布名。 -->
    <div data-lt="canvas" class="lt-canvas-root"></div>
  </div>
</template>

<script setup lang="ts">
/*
 舞台＝背景層 + 捲動層 + 訊息列容器。
       背景分直、橫兩張（橫式選填）。元件只寫兩個 CSS 變數，由 canvas.css 依螢幕方向
       選一張畫；不 inline 寫 background-image，作者的卡片 CSS 蓋 `.chat-scope-box`
       時才不必跟 inline 樣式比特異性。沒設就不寫，讓卡片 CSS 的預設值有效。
       玩家選了模糊／純色／自訂時改由 .lt-stage-bg 畫，並在 canvas.css 把作者畫在舞台各層的
       背景圖關掉（canvas-player-background.ts）。
*/
import { computed, ref } from 'vue'
import { cssUrl, isLightBackground, type StageBackground } from '../canvas-player-background'

const props = defineProps<{ background?: StageBackground | null }>()

/** 玩家換掉卡片原圖時的模式；卡片原圖（或還沒決定）是空的。 */
const playerMode = computed(() => {
  const bg = props.background
  if (bg?.pending) return 'pending'
  return bg?.mode && bg.mode !== 'card' ? bg.mode : ''
})

const lightTone = computed(() => isLightBackground(props.background))

const stageStyle = computed(() => {
  const bg = props.background
  if (!bg || playerMode.value) return null
  const style: Record<string, string> = {}
  if (bg.portrait) style['--lt-bg-portrait'] = cssUrl(bg.portrait)
  if (bg.landscape) style['--lt-bg-landscape'] = cssUrl(bg.landscape)
  return Object.keys(style).length ? style : null
})

const layerStyle = computed(() => {
  const bg = props.background
  if (!bg) return null
  const style: Record<string, string> = { '--lt-player-bg-color': bg.color || 'transparent' }
  if (bg.portrait) style['--lt-player-bg-portrait'] = cssUrl(bg.portrait)
  if (bg.landscape) style['--lt-player-bg-landscape'] = cssUrl(bg.landscape)
  return style
})
defineEmits<{ (e: 'scroll', ev: Event): void }>()

const scrollEl = ref<HTMLElement | null>(null)
const anchorEl = ref<HTMLElement | null>(null)

defineExpose({ scrollEl, anchorEl })
</script>
