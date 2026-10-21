<template>
  <view class="sys-msg-wrap" :class="['sys-tone-' + tone]">
    <view class="sys-msg-card" :class="['sys-kind-' + kind]"
          :role="liveRegionRole" :aria-live="liveRegionPoliteness"
          aria-atomic="true">
      <view class="sys-icon-box">
        <!-- model-error: alert triangle -->
        <view v-if="kind === 'model-error'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><path d=&quot;M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z&quot;/><line x1=&quot;12&quot; y1=&quot;9&quot; x2=&quot;12&quot; y2=&quot;13&quot;/><line x1=&quot;12&quot; y1=&quot;17&quot; x2=&quot;12.01&quot; y2=&quot;17&quot;/></svg>`"></view>
        <!-- network-error: wifi-off -->
        <view v-else-if="kind === 'network-error'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><line x1=&quot;1&quot; y1=&quot;1&quot; x2=&quot;23&quot; y2=&quot;23&quot;/><path d=&quot;M16.72 11.06A10.94 10.94 0 0 1 19 12.55&quot;/><path d=&quot;M5 12.55a10.94 10.94 0 0 1 5.17-2.39&quot;/><path d=&quot;M10.71 5.05A16 16 0 0 1 22.58 9&quot;/><path d=&quot;M1.42 9a15.91 15.91 0 0 1 4.7-2.88&quot;/><path d=&quot;M8.53 16.11a6 6 0 0 1 6.95 0&quot;/><line x1=&quot;12&quot; y1=&quot;20&quot; x2=&quot;12.01&quot; y2=&quot;20&quot;/></svg>`"></view>
        <!-- server-error: server rack（設計稿 icons.jsx 精確版） -->
        <view v-else-if="kind === 'server-error'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><rect x=&quot;2&quot; y=&quot;3&quot; width=&quot;20&quot; height=&quot;7&quot; rx=&quot;1.5&quot;/><rect x=&quot;2&quot; y=&quot;14&quot; width=&quot;20&quot; height=&quot;7&quot; rx=&quot;1.5&quot;/><path d=&quot;M6 6.5h.01M6 17.5h.01&quot;/></svg>`"></view>
        <!-- rate-limit: hourglass（設計稿 zigzag 單路徑） -->
        <view v-else-if="kind === 'rate-limit'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><path d=&quot;M6 2h12v4l-4 4 4 4v4H6v-4l4-4-4-4V2z&quot;/></svg>`"></view>
        <!-- quota: credit card -->
        <view v-else-if="kind === 'quota'" class="sys-svg sys-quota-icon" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><rect x=&quot;2&quot; y=&quot;5&quot; width=&quot;20&quot; height=&quot;14&quot; rx=&quot;2&quot;/><path d=&quot;M2 10h20&quot;/><path d=&quot;M6 15h4&quot;/></svg>`"></view>
        <!-- filtered: shield -->
        <view v-else-if="kind === 'filtered'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><path d=&quot;M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z&quot;/></svg>`"></view>
        <!-- stopped: filled square（設計稿 rx=2, filled） -->
        <view v-else-if="kind === 'stopped'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;currentColor&quot; stroke=&quot;none&quot; style=&quot;width:100%;height:100%;display:block;&quot;><rect x=&quot;6&quot; y=&quot;6&quot; width=&quot;12&quot; height=&quot;12&quot; rx=&quot;2&quot;/></svg>`"></view>
        <!-- length-cap: zap（設計稿單路徑） -->
        <view v-else-if="kind === 'length-cap'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;currentColor&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><path d=&quot;M13 2L3 14h7l-1 8 10-12h-7l1-8z&quot;/></svg>`"></view>
        <!-- compact-retryable: 沿用 mobile 版同一顆 4 L-shapes compress 圖示（語意對應
             「記憶壓縮/整理」失敗），但走 failure 紅色（meta.color） -->
        <view v-else-if="kind === 'compact-retryable'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><path d=&quot;M4 9h6V3M20 9h-6V3M4 15h6v6M20 15h-6v6&quot;/></svg>`"></view>
        <!-- outcome-unconfirmed: clock（「還在確認」而非「已失敗」） -->
        <view v-else-if="kind === 'outcome-unconfirmed'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><circle cx=&quot;12&quot; cy=&quot;12&quot; r=&quot;9&quot;/><polyline points=&quot;12 7 12 12 15.5 14&quot;/></svg>`"></view>
        <!-- fallback（理論上不會命中：所有目前傳入的 kind 都有上面明確分支） -->
        <view v-else class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><path d=&quot;M4 9h6V3M20 9h-6V3M4 15h6v6M20 15h-6v6&quot;/></svg>`"></view>
      </view>

      <view class="sys-body">
        <text class="sys-label" >{{ label }}</text>
        <text v-if="sub" class="sys-sub">
          <text class="sys-sub-text">{{ sub }}</text>
        </text>
      </view>

      <view v-if="resolvedCtas.length" class="sys-ctas">
        <!-- data-lt="retry" 是作者樣式契約裡的穩定選擇器（見 author-theme-vars.css）：
             重試鍵在這一端就是系統訊息卡上的那顆 CTA，作者要改它得抓得到。 -->
        <view v-for="(entry, index) in resolvedCtas" :key="entry.action"
              class="sys-cta"
              :data-lt="isRetryAction(entry.action) ? 'retry' : null"
              role="button" tabindex="0" :aria-label="entry.label"
              :class="{ 'sys-cta-primary': index === resolvedCtas.length - 1 }"
              @click.stop="onCta(entry.action)"
              @keydown="onCtaKeydown($event, entry.action)">
          <view v-if="showsRetryIcon(entry.action)" class="sys-cta-svg" v-html="'<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.5&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><polyline points=&quot;23 4 23 10 17 10&quot;/><polyline points=&quot;1 20 1 14 7 14&quot;/><path d=&quot;M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15&quot;/></svg>'"></view>
          <view v-else-if="entry.action === 'open_vip'" class="sys-cta-svg" v-html="'<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.5&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><rect x=&quot;2&quot; y=&quot;5&quot; width=&quot;20&quot; height=&quot;14&quot; rx=&quot;2&quot;/><path d=&quot;M2 10h20&quot;/></svg>'"></view>
          <view v-else class="sys-cta-svg" v-html="'<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.5&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><polyline points=&quot;13 17 18 12 13 7&quot;/><polyline points=&quot;6 17 11 12 6 7&quot;/></svg>'"></view>
          <text class="sys-cta-text">{{ entry.label }}</text>
        </view>
      </view>
    </view>
    <!-- 宿主注入的去處（積分不夠時：今日任務、儲值）。畫布本身不賣點數也沒有每日報到，
         宿主沒給就什麼都不畫；新分頁開，不離開正在玩的對話（輸入框裡的字也不會丟）。 -->
    <view v-if="validLinks.length" class="sys-links">
      <a v-for="link in validLinks" :key="link.id" class="sys-link" :href="link.href" target="_blank" rel="noopener noreferrer">{{ link.label }}</a>
    </view>
  </view>
</template>

<script>
import { syncChromeTone } from '../../pages/canvas/canvas-chrome-tone'

/**
 * 系統訊息卡片（desktop port，from mobile
 * src/components/chat-system-message/chat-system-message.vue）
 *   - failure 紅卡：model-error / network-error / server-error / rate-limit / filtered / compact-retryable
 *   - notice pill：stopped / length-cap
 *
 * 跟 mobile 版分歧：mobile 版還多帶 compressing（脈衝）/ compressed（可展開，
 * 摘要預覽 + 編輯/查看/刪除 actions）兩個 kind，但 chat.vue 目前雙端都沒有
 * 任何 finishReason 會映射到這兩個 kind（那是給另一個尚未串接的摘要卡片
 * 功能預留的）。desktop 這次只 port「finishReason 驅動的失敗/中斷提示」這個
 * 子集（跟本施工單範圍一致：覆蓋 mobile 現有全部錯誤類 + compact_retryable），
 * 不帶入未使用的 expand/summaryPreview 分支，避免引入死代碼與缺翻譯 key
 * （chat.summaryEditShort / chat.summaryView 目前不存在於 desktop locale）。
 *
 * 單位換算：mobile 版全用 rpx（750rpx = 375px 基準，1px = 2rpx），desktop
 * 是純 H5 平台（無 app-plus rpx 縮放需求），依 DESIGN.md §5.2 desktop 慣例
 * 全部換算成 px（rpx 數值 ÷ 2），視覺比例跟 mobile 版一致。
 */
const KIND_META = {
  'model-error':        { tone: 'failure', color: '#F87171', action: 'retry' },
  'network-error':      { tone: 'failure', color: '#F87171', action: 'retry' },
  'server-error':       { tone: 'failure', color: '#F87171', action: 'retry' },
  'rate-limit':         { tone: 'failure', color: '#FB923C', action: 'retry' },
  'filtered':            { tone: 'failure', color: '#FB923C', action: 'retry' },
  'compact-retryable':  { tone: 'failure', color: '#F87171', action: 'retry' },
  'quota':              { tone: 'notice',  color: '#FBBF24', action: 'open_vip' },
  // neutral：這不是「出事了」，是「停在這裡」。顏色不寫死灰，跟著卡片的文字色走
  // （作者的美化才吃得到；owner 2026-09-05 截圖裡那條黑框就是寫死的灰底）。
  'stopped':            { tone: 'notice',  color: '#9CA3AF', action: 'continue', neutral: true },
  'length-cap':         { tone: 'notice',  color: '#FBBF24', action: 'continue' },
  // 中性語氣（不是失敗），但走卡片版面而非藥丸：本 kind 帶說明文字與 CTA，
  // notice 的 border-radius:9999px 只裝得下單行短標籤，多行會被包成一顆球。
  'outcome-unconfirmed': { tone: 'notice', color: '#9CA3AF', action: 'refresh_history', neutral: true },
};

export default {
  name: 'chat-system-message',
  props: {
    kind: { type: String, required: true },
    label: { type: String, default: '' },
    sub: { type: String, default: '' },
    cta: { type: String, default: '' },
    // Capable operation rows pass the server action through verbatim. Legacy
    // callers omit this prop and keep the frozen kind-derived fallback.
    ctaAction: { type: String, default: '' },
    ctas: { type: Array, default: () => [] },
    // 宿主給的連結：[{ id, label, href }]
    links: { type: Array, default: () => [] },
  },
  emits: ['cta'],
  mounted() {
    this.$nextTick(this.measurePanel);
    const Observer = this.$el?.ownerDocument?.defaultView?.MutationObserver;
    if (Observer) {
      this.panelThemeObserver = new Observer(this.measurePanel);
      for (let node = this.$el; node; node = node.parentElement) {
        this.panelThemeObserver.observe(node, { attributes: true, attributeFilter: ['style', 'class', 'data-theme', 'data-mode'] });
      }
    }
  },
  updated() { this.measurePanel(); },
  beforeUnmount() { this.panelThemeObserver?.disconnect(); },
  computed: {
    meta() { return KIND_META[this.kind] || KIND_META['stopped']; },
    tone() { return this.meta.tone; },
    resolvedCtaAction() { return this.ctaAction || this.meta.action || 'retry'; },
    resolvedCtas() {
      const capable = Array.isArray(this.ctas)
        ? this.ctas
          .filter(entry => entry && entry.label && entry.action)
          .map(entry => ({
            label: String(entry.label),
            action: String(entry.action),
          }))
        : [];
      if (capable.length) return capable;
      if (!this.cta) return [];
      return [{ label: this.cta, action: this.resolvedCtaAction }];
    },
    validLinks() {
      return (Array.isArray(this.links) ? this.links : [])
        .filter(link => link && link.label && typeof link.href === 'string' && /^(https:\/\/|\/)/.test(link.href))
        .map(link => ({ id: String(link.id || link.href), label: String(link.label), href: link.href }));
    },
    isFailure() { return this.tone === 'failure'; },
    isTerminal() { return this.tone === 'failure' || this.tone === 'notice'; },
    liveRegionRole() { return this.isTerminal ? 'alert' : 'status'; },
    liveRegionPoliteness() { return this.isTerminal ? 'assertive' : 'polite'; },
  },
  methods: {
    measurePanel() { syncChromeTone(this.$el); },
    showsRetryIcon(action) {
      return action === 'rewrite' || String(action || '').startsWith('retry');
    },
    isRetryAction(action) {
      return String(action || '').startsWith('retry');
    },
    onCta(action) {
      this.$emit('cta', action);
    },
    onCtaKeydown(event, action) {
      const key = event && event.key;
      const keyCode = Number(event && event.keyCode);
      if (
        key !== 'Enter'
        && key !== ' '
        && key !== 'Space'
        && key !== 'Spacebar'
        && keyCode !== 13
        && keyCode !== 32
      ) {
        return;
      }
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
      this.onCta(action);
    },
  },
};
</script>

<style scoped lang="scss">
/* Platform panels own their background/foreground pair; author rules still win over lt-base. */
@layer lt-base {
.sys-msg-wrap, .sys-msg-wrap * { box-sizing: border-box; }
.sys-msg-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding: 10px 16px;
}
.sys-msg-card {
  --sys-tone: currentColor;
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  max-width: 560px;
  padding: 12px;
  border-radius: var(--lt-canvas-block-radius, 14px);
  border: 1px solid color-mix(in srgb, var(--sys-tone) 40%, transparent);
  /* The opaque base also backs translucent author panel tokens. */
  background: linear-gradient(color-mix(in srgb, var(--sys-tone) 8%, transparent), color-mix(in srgb, var(--sys-tone) 8%, transparent)),
    linear-gradient(var(--lt-canvas-panel-bg, rgba(24,27,33,.98)), var(--lt-canvas-panel-bg, rgba(24,27,33,.98)))
    var(--lt-canvas-bg, #0f1217);
  color: var(--lt-canvas-panel-fg, #e8eaed);
  box-shadow: 0 1px 3px rgba(0,0,0,.22);
}
.sys-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: var(--sys-tone);
  background: color-mix(in srgb, var(--sys-tone) 14%, transparent);
}
.sys-svg { width: 14px; height: 14px; }
.sys-body {
  flex: 1 1 180px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  overflow-wrap: anywhere;
}
.sys-label { color: inherit; font-size: 14px; font-weight: 600; line-height: 1.4; }
.sys-sub { white-space: pre-line; color: inherit; opacity: .78; font-size: 12px; line-height: 1.5; }
.sys-sub-text { color: inherit; font-size: inherit; }
.sys-ctas {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  max-width: 100%;
  margin-left: auto;
}
.sys-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 32px;
  padding: 4px 12px;
  max-width: 100%;
  border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
  border-radius: var(--lt-canvas-pill-radius, 9999px);
  background: transparent;
  color: inherit;
  font-weight: 600;
  font-size: 12px;
  flex: 0 0 auto;
  cursor: pointer;
  transition: transform .12s, opacity .15s;
}
.sys-cta-primary { background: var(--lt-canvas-accent); color: var(--lt-canvas-accent-fg); border-color: transparent; }
.sys-cta:focus-visible, .sys-link:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.sys-cta:active { transform: scale(.94); opacity: .85; }
.sys-cta-svg { width: 12px; height: 12px; flex-shrink: 0; }
.sys-cta-text { color: inherit; font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
.sys-links { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding-top: 8px; width: 100%; max-width: 560px; }
.sys-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 16px;
  border-radius: var(--lt-canvas-pill-radius, 9999px);
  background: linear-gradient(var(--lt-canvas-panel-bg), var(--lt-canvas-panel-bg)) var(--lt-canvas-bg);
  color: var(--lt-canvas-panel-fg);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  max-width: 100%;
  overflow-wrap: anywhere;
}
@media (pointer: coarse) { .sys-cta { min-height: 44px; } }
}
</style>
<style>
/* Zero specificity outside the layer matches the stage chrome's existing author override contract.
   Kept with the shared component so sandbox documents receive the same measured pairing. */
:where(.sys-msg-card[data-lt-tone="light"]) { color: #17171c; --sys-tone: #4b4b50; }
:where(.sys-msg-card[data-lt-tone="dark"]) { color: #e8eaed; --sys-tone: #a3a3ad; }
:where(.sys-msg-card[data-lt-tone="light"].sys-kind-model-error, .sys-msg-card[data-lt-tone="light"].sys-kind-network-error, .sys-msg-card[data-lt-tone="light"].sys-kind-server-error, .sys-msg-card[data-lt-tone="light"].sys-kind-compact-retryable) { --sys-tone: #b91c1c; }
:where(.sys-msg-card[data-lt-tone="dark"].sys-kind-model-error, .sys-msg-card[data-lt-tone="dark"].sys-kind-network-error, .sys-msg-card[data-lt-tone="dark"].sys-kind-server-error, .sys-msg-card[data-lt-tone="dark"].sys-kind-compact-retryable) { --sys-tone: #f87171; }
:where(.sys-msg-card[data-lt-tone="light"].sys-kind-rate-limit, .sys-msg-card[data-lt-tone="light"].sys-kind-filtered, .sys-msg-card[data-lt-tone="light"].sys-kind-quota, .sys-msg-card[data-lt-tone="light"].sys-kind-length-cap) { --sys-tone: #8a5a00; }
:where(.sys-msg-card[data-lt-tone="dark"].sys-kind-rate-limit, .sys-msg-card[data-lt-tone="dark"].sys-kind-filtered, .sys-msg-card[data-lt-tone="dark"].sys-kind-quota, .sys-msg-card[data-lt-tone="dark"].sys-kind-length-cap) { --sys-tone: #fbbf24; }
</style>
