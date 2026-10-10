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
      <!-- 標題與總數同一行（照 Claude Code 的上下文面板）；副標只在有話要說時才出現：
           不支援、還沒聊過、或看的是某一則回覆而不是最新一輪。 -->
      <div class="cb-heading">
        <div class="cb-title-row">
          <div class="cb-title">{{ labels.title }}</div>
          <div v-if="view" class="cb-usage">{{ usageText }}</div>
        </div>
        <div v-if="statusNote" class="cb-subtitle">{{ statusNote }}</div>
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
      <div v-if="view" class="cb-bar" aria-hidden="true">
        <span v-for="row in view.rows" :key="row.key" class="cb-bar-seg" :data-key="row.key" :style="{ width: row.width + '%', background: row.color }"></span>
        <span v-if="view.compactAt != null" class="cb-bar-line" :style="{ left: view.compactAt + '%' }"></span>
      </div>
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

const usageText = computed(() => {
  const v = view.value
  if (!v) return ''
  return v.hasWindow
    ? `${formatTokenCount(v.usedTokens)} / ${formatTokenCount(v.limitTokens)} (${v.percent}%)`
    : `${formatTokenCount(v.usedTokens)} ${props.labels.totalTokens}`
})

const statusNote = computed(() => {
  const report = props.report
  if (!report || report.status !== 'ok' || report.supported === false || report.chatId) return statusText.value
  return ''
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
