<template>
  <div ref="shellEl" class="model-setting-scope theme-dark">
  <!--
    模型設定。外層節點名照 MMD（`.mp-top` / `.mp-info-bar` / `.mp-setting-body` /
    `.bottom .btn`）——作者的卡對 `.model-setting-scope` 與那顆完成鍵寫了外觀。

    裡面裝的是主站那一份模型選單原封搬進來的元件：分類、排序、搜尋、線路展開、
    可用率、Agent 開關、上下文檔位、思考深度都在裡面，不重寫一份——重寫的那份
    遲早跟主站各說各話。

    這裡曾經還有一個「對話設定」切面（`.history-setting-scope`）。它被拿掉了：
    模型、上下文檔位、Agent 模式本來就都在模型選單裡，而自動摘要不該讓玩家撥
    ——關掉它會讓長對話的記憶行為整個改變，那不是一個開關該承擔的後果。
  -->
    <!-- 搜尋框跟標題同一列：單獨佔一行時，手機第一屏連一個模型都看不到
         （owner 2026-10-02 iPhone 截圖）。它在捲動區外面，往下捲也一直在。
         真的 input（模板裡的 <input> 會被編譯器包一層殼，殼自帶尺寸與一個空的
         佔位點，看起來像 bug）；左邊放放大鏡，讓人一眼知道這是搜尋。 -->
    <div class="mp-top">
      <div class="mp-title">{{ title }}</div>
      <div class="ms-search">
        <span class="ms-search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        </span>
        <CanvasInput
          el-class="ms-search-input"
          :value="searchQuery"
          :placeholder="labels.search || ''"
          @input="searchQuery = $event" />
        <span v-if="searchQuery" class="ms-search-clear" role="button" tabindex="0"
              :aria-label="labels.close"
              @click="searchQuery = ''"
              @keydown.enter.prevent="searchQuery = ''">×</span>
      </div>
      <div class="mp-close" role="button" tabindex="0"
           :aria-label="labels.close"
           @click="$emit('close')"
           @keydown.enter.prevent="$emit('close')">×</div>
    </div>

    <div class="mp-setting-body">
      <ModelSelectPanel
        ref="picker"
        :open="open"
        :role-id="roleId"
        :select-model="selectedValue"
        :select-model-name="modelName"
        :context="contextValue"
        :thinking-depth="thinkingDepth"
        :show-thinking-process="showThinkingProcess"
        v-model:search-query="searchQuery"
        @select="$emit('apply', $event)"
        @draft="draft = $event"
        :dock-chips="dockChips"
        :dock-panel="dockPanel"
        @close="$emit('close')"
      />
    </div>

    <!--
      底部一塊：攤開的設定面板（點了才有）→ 設定鍵一排 → 現用模型＋確定鍵。
      設定跟確定擺在一起：要確認的就是這幾樣，手指也在這裡。上面整片留給模型清單。
      設定的內容由模型選單元件 Teleport 進 dockPanel / dockChips 這兩個位置。
    -->
    <div class="bottom">
      <div ref="dockPanel" class="mp-dock-panel-slot"></div>
      <div ref="dockChips" class="mp-dock-chips-slot"></div>
      <div class="mp-dock-row">
        <!-- 玩家在下面換了模型或檔位、還沒按確定時，這一列寫出「從哪個換到哪個、價格
             變成多少」：原本的劃掉，箭頭指向新的。沒換就維持原本的一列。 -->
        <div class="mp-info-bar" :class="{ 'is-switching': switching }">
          <template v-if="!switching">
            <div class="mp-model-name">{{ modelName }}</div>
            <div class="mp-energy-pill" :class="{ 'is-dynamic': scoreDynamic }">
              <template v-if="scoreLabel"><span class="mp-ev"><span>{{ scoreLabel }}</span></span></template>
              <template v-else>
                <span class="mp-ev"><span>{{ scoreText || '—' }}</span></span>
                <span class="mp-el"><span>{{ labels.perTurn }}</span></span>
              </template>
            </div>
          </template>
          <template v-else>
            <div class="mp-info-row is-was">
              <div class="mp-model-name">{{ modelName }}<template v-if="tierChanged && draft && draft.fromTier"> · {{ draft.fromTier }}</template></div>
              <div class="mp-energy-pill"><span class="mp-ev"><span>{{ scoreLabel || scoreText || '—' }}</span></span></div>
            </div>
            <div class="mp-info-arrow" aria-hidden="true">↓ {{ labels.switchTo }}</div>
            <div class="mp-info-row is-next">
              <div class="mp-model-name">{{ draft && draft.name }}<template v-if="tierChanged && draft && draft.tier"> · {{ draft.tier }}</template></div>
              <div class="mp-energy-pill is-dynamic"><span class="mp-ev"><span>{{ draft && draft.price }}</span></span></div>
            </div>
          </template>
        </div>
        <div class="btn" role="button" tabindex="0"
             @click="onDone"
             @keydown.enter.prevent="onDone">{{ labels.done }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import ModelSelectPanel from '@/components/model-select/ModelSelectPanel.vue'
import { CanvasInput } from './canvas-field'
import { attachDelegatedDragScroll } from '../canvas-drag-scroll'

const props = withDefaults(defineProps<{
  /** 彈層開著嗎——模型選單靠它決定要不要重抓清單 */
  open?: boolean
  title?: string
  roleId?: string
  selectedValue?: string
  modelName?: string
  scoreText?: string
  scoreDynamic?: boolean
  /** 價格連同它的意思（「下一輪約 …」）；固定計價時空字串，退回 scoreText＋perTurn */
  scoreLabel?: string
  contextValue?: number
  thinkingDepth?: string
  showThinkingProcess?: boolean
  labels?: {
    close: string
    done: string
    perTurn: string
    switchTo?: string
    search?: string
  }
}>(), {
  open: true,
  title: '',
  roleId: '',
  selectedValue: '',
  modelName: '',
  scoreText: '',
  scoreDynamic: false,
  scoreLabel: '',
  contextValue: 1,
  thinkingDepth: '',
  showThinkingProcess: true,
  labels: () => ({ close: 'Close', done: 'Done', perTurn: '/turn' }),
})

const emit = defineEmits<{
  /** 模型選單按下確認：整包設定一次交出去 */
  (e: 'apply', payload: Record<string, unknown>): void
  (e: 'close'): void
}>()

const picker = ref<any>(null)

/** 選單裡還沒確認的選擇（模型、檔位、價格），由 ModelSelectPanel 回報。 */
const draft = ref<{ value: string; name: string; price: string; context?: number; tier?: string; fromTier?: string } | null>(null)
const tierChanged = computed(() => !!draft.value && draft.value.context != null && draft.value.context !== props.contextValue)
const switching = computed(() => {
  const d = draft.value
  if (!d || !d.value) return false
  return d.value !== props.selectedValue || (d.context != null && d.context !== props.contextValue)
})
const searchQuery = ref('')
watch(() => props.open, (open) => { if (!open) draft.value = null })
const shellEl = ref<HTMLElement | null>(null)
/** 底部給設定用的兩個位置，掛上之後才有值；交給模型選單 Teleport 進來。 */
const dockChips = ref<HTMLElement | null>(null)
const dockPanel = ref<HTMLElement | null>(null)

// 分類與排序那兩條橫向 rail 在桌機要拉得動（滑鼠沒有橫向滾輪）。掛在殼上用事件委派：
// rail 是資料到了才長出來、換分頁又重畫的節點，開面板那一刻逐個掛會掛到已經不在
// 畫面上的那一批——Windows 用戶「游標停在廠商 tab 上滾滾輪不生效」（2026-09-13）。
let detachRails: () => void = () => {}
watch(() => props.open, async (open) => {
  detachRails(); detachRails = () => {}
  if (!open) return
  await nextTick()
  detachRails = attachDelegatedDragScroll(shellEl.value, '.ms-rail').detach
}, { immediate: true })
onBeforeUnmount(() => { detachRails() })

/*
  作者的卡寫的是 `.model-setting-scope .bottom .btn`，所以完成鍵必須留在殼上。
  按它等於按選單自己的確認鍵——中間的高消費確認也走同一條路，不是兩套。
*/
function onDone() {
  const inner = picker.value
  if (inner && typeof inner.sure === 'function') {
    inner.sure()
    return
  }
  emit('close')
}
</script>
