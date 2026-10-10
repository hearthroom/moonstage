<template>
  <div class="context-breakdown-scope">
  <!--
    上下文用量：一行「用了多少／容量」、一條用量條、每一部分各占容量幾成、剩餘空間。
    先前是一個大圓環加四格數字，百分比是「占這次提示詞幾成」，玩家最想知道的「離上限
    還多遠、什麼時候開始濃縮舊劇情」反而看不出來（owner 2026-10-10，參考 Claude 的上下文面板）。
    供應商沒給容量時（LunaTalk、舊回合）退回「占提示詞幾成」，不畫剩餘空間與那條線。
    MOD 那一列只在報告真的帶著 MOD 用量時才畫（HarperHarbor 沒有 MOD，見 visiblePromptBreakdownItems）。

    元件不打 API：資料由頁面整理好餵進來（canvas-context-breakdown.ts 正規化過，
    內部欄位進不來），文案也由頁面翻好餵進來，這裡只負責畫。
    外面那層 `.u-popup__content` 是 MMD 的殼，作者對它寫的底色與圓角照樣生效；
    這一片的字色全部 inherit，底色與分隔線都從殼的文字色調出來。
  -->
    <div class="cb-top">
      <div class="cb-heading">
        <div class="cb-title">{{ labels.title }}</div>
        <div class="cb-subtitle">{{ statusText }}</div>
      </div>
      <div class="cb-close" role="button" tabindex="0"
           :aria-label="labels.close"
           @click="$emit('close')"
           @keydown.enter.prevent="$emit('close')">×</div>
    </div>

    <div v-if="loading && !report" class="cb-loading" aria-live="polite">
      <div class="cb-loading-row"></div>
      <div class="cb-loading-row"></div>
      <div class="cb-loading-row"></div>
    </div>

    <div v-else-if="loadFailed && !report" class="cb-empty">
      <span class="cb-empty-text">{{ labels.loadFailed }}</span>
      <span class="cb-retry" role="button" tabindex="0"
            @click="$emit('retry')"
            @keydown.enter.prevent="$emit('retry')">{{ labels.retry }}</span>
    </div>

    <div v-else-if="!report" class="cb-empty">
      <span class="cb-empty-text">{{ labels.notReady }}</span>
    </div>

    <!-- 模型／策略不支援統計：明確空狀態，不畫全 0 的圓環讓人以為壞了 -->
    <div v-else-if="report.supported === false" class="cb-empty">
      <span class="cb-empty-text">{{ labels.unsupportedModel }}</span>
    </div>

    <template v-else>
      <!-- 一行總數＋一條用量條：有容量可比時是「用了多少／容量」，條上那條線是較早劇情開始濃縮的位置 -->
      <div v-if="view" class="cb-summary">
        <span class="cb-summary-used">{{ formatTokens(view.usedTokens) }}<template v-if="view.hasWindow"> / {{ formatTokens(view.limitTokens) }}</template></span>
        <span v-if="view.hasWindow" class="cb-summary-percent">{{ view.percent }}%</span>
        <span v-else class="cb-summary-percent">{{ labels.totalTokens }}</span>
      </div>
      <!-- 用量條用 SVG 畫：有些手機的 WebView 吃不到 color-mix 與空的彈性元素，用 div 拼的條整條看不見
           （owner 2026-10-10 手機截圖）。座標是 0–100，寬度跟著容器拉伸。 -->
      <svg v-if="view" class="cb-bar" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <rect class="cb-bar-track" x="0" y="0" width="100" height="4" fill="currentColor" />
        <rect v-for="seg in barSegments" :key="seg.key" class="cb-bar-seg" :data-key="seg.key" :x="seg.x" y="0" :width="seg.width" height="4" :fill="seg.color" />
        <rect v-if="view.compactAt != null" class="cb-bar-line" :x="Math.max(0, view.compactAt - 0.4)" y="0" width="0.8" height="4" fill="currentColor" />
      </svg>
      <div v-if="view && view.hasWindow" class="cb-hint">{{ hintText }}</div>

      <div v-if="view" class="cb-list">
        <template v-for="row in view.rows" :key="row.key">
          <div
            class="cb-row"
            :class="{ 'is-expandable': row.key === 'mod' && canExpandMod, 'is-expanded': row.key === 'mod' && canExpandMod && modDetailsExpanded }"
            :data-key="row.key"
            :role="row.key === 'mod' && canExpandMod ? 'button' : undefined"
            :tabindex="row.key === 'mod' && canExpandMod ? 0 : undefined"
            :aria-expanded="row.key === 'mod' && canExpandMod ? (modDetailsExpanded ? 'true' : 'false') : undefined"
            :aria-label="row.key === 'mod' && canExpandMod ? (modDetailsExpanded ? labels.collapseModDetails : labels.expandModDetails) : undefined"
            @click="row.key === 'mod' && onToggleMod()"
            @keydown.enter.prevent="row.key === 'mod' && onToggleMod()"
            @keydown.space.prevent="row.key === 'mod' && onToggleMod()"
          >
            <span class="cb-dot" :style="{ background: row.color }"></span>
            <span class="cb-row-title">{{ itemLabel(row.key) }}<span v-if="row.key === 'mod'" class="cb-row-sub"> · {{ modStatusText }}</span></span>
            <span class="cb-row-tokens">{{ formatTokens(row.tokens) }}</span>
            <span class="cb-row-percent">{{ row.percent }}%</span>
            <span v-if="row.key === 'mod' && canExpandMod" class="cb-mod-chevron" aria-hidden="true"></span>
          </div>
          <div v-if="row.key === 'mod' && canExpandMod && modDetailsExpanded" class="cb-mod-details" aria-live="polite">
            <div v-for="detail in modItem.details" :key="detail.modId" class="cb-mod-detail-row">
              <span class="cb-mod-detail-name">{{ modDisplayName(detail) }}</span>
              <span class="cb-mod-detail-tokens">{{ formatNumber(detail.estimatedTokens) }} {{ labels.tokenUnit }}</span>
            </div>
          </div>
        </template>
        <div v-if="view.hasWindow" class="cb-row is-free" data-key="free">
          <span class="cb-dot"></span>
          <span class="cb-row-title">{{ labels.free }}</span>
          <span class="cb-row-tokens">{{ formatTokens(view.freeTokens) }}</span>
          <span class="cb-row-percent">{{ view.freePercent }}%</span>
        </div>
      </div>

      <!-- 模型自己回報的數字：實際讀入多少、快取省了多少、這一輪花了幾點 -->
      <div class="cb-foot">
        <span v-if="report.cache.available && labels.actualInputTokens" class="cb-foot-item">{{ labels.actualInputTokens }} {{ formatNumber(report.cache.inputTokens) }}</span>
        <span v-if="report.billing.available && report.billing.cacheHitRate != null" class="cb-foot-item">{{ labels.cacheHitRateFull }} {{ formatHitRate(report.billing.cacheHitRate) }}%</span>
        <span v-if="report.billing.available" class="cb-foot-item">{{ labels.billingTotal }} {{ formatNumber(report.billing.totalPoints) }} {{ labels.pointUnit }}</span>
      </div>
      <div class="cb-note">{{ labels.localEstimateNote }}</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  formatHitRate,
  formatPromptNumber,
  formatTokenCount,
  promptBreakdownModDisplayName,
  promptUsageView,
  type PromptBreakdownReport,
  type PromptModUsageDetail,
} from '../canvas-context-breakdown'

export interface ContextBreakdownLabels {
  title: string
  subtitle: string
  close: string
  retry: string
  loadFailed: string
  unsupportedModel: string
  notReady: string
  totalTokens: string
  actualInputTokens?: string
  tokenUnit: string
  pointUnit: string
  billingTotal: string
  cacheHitRateFull: string
  localEstimateNote: string
  free: string
  /** 帶 {n} 的字串樣板：較早的劇情大約再過幾輪開始濃縮 */
  hintTurns: string
  /** 還算不出剩幾輪時，說明那條線是什麼 */
  hintLine: string
  /** 已經到線上了：下一輪就會濃縮 */
  hintNow: string
  expandModDetails: string
  collapseModDetails: string
  modDetailsUnavailable: string
  modDetailsLegacy: string
  /** 每個桶的名字，key 對 PromptBreakdownKey */
  items: Record<string, string>
  /** 也可以是帶 {n} 的字串樣板：沙箱殼收到的是 JSON，函式帶不過去 */
  modsUsed: ((n: number) => string) | string
}

// 文案可以是函式（頁面直接餵）或帶 {n} 的字串樣板（沙箱殼收到的是 JSON）。
const fmtN = (label: ((n: number) => string) | string | undefined, n: number): string => (typeof label === 'function' ? label(n) : String(label ?? '').replace('{n}', String(n)))

const props = withDefaults(defineProps<{
  report?: PromptBreakdownReport | null
  loading?: boolean
  loadFailed?: boolean
  modDetailsExpanded?: boolean
  locale?: string
  labels?: ContextBreakdownLabels
}>(), {
  report: null,
  loading: false,
  loadFailed: false,
  modDetailsExpanded: false,
  locale: '',
  labels: () => ({
    title: '', subtitle: '', close: 'Close', retry: 'Retry',
    loadFailed: '', unsupportedModel: '', notReady: '',
    totalTokens: '', tokenUnit: '', pointUnit: '',
    billingTotal: '', cacheHitRateFull: '', localEstimateNote: '',
    free: '', hintTurns: '', hintLine: '', hintNow: '',
    expandModDetails: '', collapseModDetails: '', modDetailsUnavailable: '', modDetailsLegacy: '',
    items: {},
    modsUsed: (n: number) => String(n),
  }),
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'retry'): void
  (e: 'toggle-mod-details'): void
}>()

const statusText = computed(() => {
  const report = props.report
  if (report && (report.supported === false || report.status === 'unsupportedModel')) return props.labels.unsupportedModel
  if (report && report.status === 'notReady') return props.labels.notReady
  return props.labels.subtitle
})

const view = computed(() => promptUsageView(props.report))

const barSegments = computed(() => {
  let x = 0
  return (view.value ? view.value.rows : []).map((row) => {
    const seg = { key: row.key, color: row.color, x, width: Math.max(0, Math.min(row.width, 100 - x)) }
    x += seg.width
    return seg
  })
})

const hintText = computed(() => {
  const v = view.value
  if (!v || !v.hasWindow) return ''
  // 剩一輪以內就說「很快」：句子裡的輪數因此至少是 2，英文不必分單複數。
  if (v.condensing || (v.turnsLeft != null && v.turnsLeft <= 1)) return props.labels.hintNow
  if (v.turnsLeft != null) return fmtN(props.labels.hintTurns, v.turnsLeft)
  return props.labels.hintLine
})

const modItem = computed(() => (props.report ? props.report.items.find((item) => item.key === 'mod') : undefined) || { details: [] as PromptModUsageDetail[], detailsUnavailableReason: '' })

const canExpandMod = computed(() => {
  const item = modItem.value as any
  return !!(item && item.available && item.detailsAvailable && Array.isArray(item.details) && item.details.length > 0)
})

const modStatusText = computed(() => {
  const item = modItem.value
  if (canExpandMod.value) return fmtN(props.labels.modsUsed, item.details.length)
  if (item && item.detailsUnavailableReason === 'legacy_snapshot') return props.labels.modDetailsLegacy
  return props.labels.modDetailsUnavailable
})

function itemLabel(key: string) {
  return props.labels.items[key] || key
}

function formatNumber(value: unknown) {
  return formatPromptNumber(value)
}

function formatTokens(value: unknown) {
  return formatTokenCount(value)
}

function modDisplayName(detail: PromptModUsageDetail) {
  return promptBreakdownModDisplayName(detail, props.locale)
}

function onToggleMod() {
  if (!canExpandMod.value) return
  emit('toggle-mod-details')
}
</script>
