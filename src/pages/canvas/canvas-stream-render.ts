/*
  串流中那一則訊息的重畫節流。

  串流期間每個 chunk 都會把整則回覆的 markdown、作者規則、訊息腳本重跑一次；回覆越長
  每次越貴，總量是平方成長。手機上主執行緒被佔滿之後，後面的 chunk 只能排隊，畫面就
  遠遠落在伺服器後面——伺服器早就生成完，畫面還要再「打字」好幾分鐘。

  記錄要掛在訊息身分上，不能掛在物件上：upsertPendingAIBubble 每個 chunk 都換一個新物件，
  掛在物件上的節流一次都不會命中（先前的版本就是這樣失效的）。

  間隔會變速：上一次排版花多久，下一次就等它的四倍。便宜的時候維持 150ms 的連續感；
  長回覆、重裝飾的卡片排版變貴時自動拉長，讓主執行緒有空把排隊的 chunk 收完，
  每次換畫面時一口氣帶上累積的所有字。
*/

export const STREAM_RENDER_MIN_INTERVAL_MS = 150
export const STREAM_RENDER_MAX_INTERVAL_MS = 1000
const STREAM_RENDER_COST_FACTOR = 4

export function nextStreamRenderInterval(costMs: number): number {
  const cost = Number(costMs)
  if (!Number.isFinite(cost) || cost <= 0) return STREAM_RENDER_MIN_INTERVAL_MS
  return Math.min(
    STREAM_RENDER_MAX_INTERVAL_MS,
    Math.max(STREAM_RENDER_MIN_INTERVAL_MS, Math.round(cost * STREAM_RENDER_COST_FACTOR)),
  )
}

/** 串流中那一則的穩定身分：同一輪的每個新物件都拿到同一把鍵。拿不到就不節流。 */
export function streamRenderKey(item: { operationBubbleId?: unknown; id?: unknown } | null | undefined): string {
  if (!item) return ''
  return String(item.operationBubbleId || item.id || '')
}

export interface StreamRenderThrottle {
  /** 還沒到下一次換畫面的時間：回上一版畫面與還要等多久；到了就回 null。 */
  cached(key: string, now: number): { html: string; waitMs: number } | null
  record(key: string, html: string, costMs: number, now: number): void
  forget(key: string): void
}

export function createStreamRenderThrottle(): StreamRenderThrottle {
  const entries = new Map<string, { html: string; at: number; interval: number }>()
  return {
    cached(key, now) {
      const entry = key ? entries.get(key) : undefined
      if (!entry) return null
      const elapsed = now - entry.at
      if (elapsed < 0 || elapsed >= entry.interval) return null
      return { html: entry.html, waitMs: entry.interval - elapsed }
    },
    record(key, html, costMs, now) {
      if (!key) return
      // 同時在串流的只會有一兩則；留一小份上限，異常路徑沒收尾也不會一直長。
      if (!entries.has(key) && entries.size >= 8) entries.clear()
      entries.set(key, { html, at: now, interval: nextStreamRenderInterval(costMs) })
    },
    forget(key) {
      if (key) entries.delete(key)
    },
  }
}
