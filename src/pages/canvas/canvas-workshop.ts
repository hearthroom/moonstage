/**
 * 擴充（卡片工坊）在畫布上的資料：開場候選、這場對話的擴充、顯示資產的 hash。
 *
 * 契約：docs studio/tasks/2026-11-13-card-workshop/interface-stage.md。伺服器把擴充的規則與介面
 * 合成進同一份作者資產（形狀不變，多一個 workshopHash），所以規則引擎不知道擴充存在；畫布只負責
 *   一、把擴充的開場併在原卡開場後面（原卡在前，擴充照清單順序），選到時改走「帶開場新開」；
 *   二、讀這場對話的擴充：開場來源 chip、資訊入口的小圓點、交給宿主畫面板的「擴充」分頁；
 *   三、hash 變了就重建整個規則安裝（樣式、腳本、事件都要收乾淨，不是只換規則陣列）。
 * 沒有「DLC 模式」：選了擴充的開場只換第一則內容與它帶的開場網頁／開場選項，其他照舊。
 */

export type OpeningMode = 'greeting' | 'page'

export interface WorkshopOpening {
  workshopId: string
  workshopName: string
  openingId: string
  mode: OpeningMode
  greeting: string
  openingPage: string
  prologue: string[]
}

export type OpeningSource =
  | { kind: 'base' }
  | ({ kind: 'workshop' } & WorkshopOpening)

export type OpeningStartTarget =
  | { kind: 'workshop'; workshopId: string; openingId: string }
  /** 原卡開場（第幾條）：只有作者試玩擴充時才走帶開場新開的入口，其他時候照舊帶開場序號。 */
  | { kind: 'base'; index: number }

export type WorkshopKind = 'lore' | 'display' | 'opening'
export type WorkshopStatus = 'resident' | 'triggered' | 'disabled' | 'removed'

export interface WorkshopViewItem {
  workshopId: string
  name: string
  coverUrl: string
  kinds: WorkshopKind[]
  residentChars: number
  status: WorkshopStatus
}

export interface WorkshopConversationView {
  selectionRevision: number
  manifestHash: string
  /** 這段對話容量選擇的 revision（照樣開始寫入時帶回）；沒有記錄是 0。 */
  capacityRevision: number
  openingSource: {
    kind: 'base' | 'workshop'; workshopId?: string; workshopName?: string; openingId?: string
    /** 擴充開場當時的開場網頁與開場選項（開局後還沒說第一句就重新整理，要照它畫回來）。 */
    mode?: OpeningMode; openingPage?: string; prologue?: string[]
  }
  items: WorkshopViewItem[]
  triggeredCount: number
}

const KINDS: WorkshopKind[] = ['lore', 'display', 'opening']
const STATUSES: WorkshopStatus[] = ['resident', 'triggered', 'disabled', 'removed']

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/** 伺服器回的開場候選；壞的一筆丟掉，不讓一筆壞資料拖垮整個開場選擇。遊客、舊伺服器都是空陣列。 */
export function normalizeWorkshopOpenings(data: any): WorkshopOpening[] {
  const items = Array.isArray(data?.items) ? data.items : []
  const out: WorkshopOpening[] = []
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue
    const workshopId = str(raw.workshopId)
    const openingId = str(raw.openingId)
    if (!workshopId || !openingId) continue
    const mode: OpeningMode = raw.mode === 'page' ? 'page' : 'greeting'
    const greeting = str(raw.greeting)
    const openingPage = str(raw.openingPage)
    // greeting 模式沒有開場白、page 模式沒有網頁：選到它畫面上什麼都沒有。
    if (mode === 'greeting' && !nonEmpty(greeting)) continue
    if (mode === 'page' && !nonEmpty(openingPage)) continue
    out.push({
      workshopId,
      workshopName: str(raw.workshopName),
      openingId,
      mode,
      greeting,
      openingPage,
      prologue: Array.isArray(raw.prologue) ? raw.prologue.filter(nonEmpty) : [],
    })
  }
  return out
}

/** 原卡開場（主＋備選）在前，擴充開場照清單順序接在後面；sources 與 list 一一對應。 */
export function composeOpenings(base: string[], workshop: WorkshopOpening[]): { list: string[]; sources: OpeningSource[] } {
  return {
    list: [...base, ...workshop.map((o) => o.greeting)],
    sources: [...base.map(() => ({ kind: 'base' as const })), ...workshop.map((o) => ({ kind: 'workshop' as const, ...o }))],
  }
}

/**
 * 選到第 index 條時要不要走「帶開場新開」。原卡開場回 null，照舊帶開場序號；
 * 作者試玩擴充（trial）時原卡開場也走這個入口，伺服器才知道這段對話只套那一份草稿。
 */
export function openingStartTarget(sources: OpeningSource[], index: number, trial = false): OpeningStartTarget | null {
  const source = sources[index]
  if (source && source.kind === 'workshop') return { kind: 'workshop', workshopId: source.workshopId, openingId: source.openingId }
  return trial ? { kind: 'base', index: source ? index : 0 } : null
}

/** 試玩網址指定的開場（base＝原卡主開場，其餘是 openingId）在清單第幾條；找不到停在原卡主開場。 */
export function preselectOpening(sources: OpeningSource[], pick: string): number {
  if (!pick || pick === 'base') return 0
  const at = sources.findIndex((s) => s.kind === 'workshop' && s.openingId === pick)
  return at >= 0 ? at : 0
}

export interface OpeningExtras {
  openingPage: string
  openingMode: string
  prologue: string[]
}

/** 選中的開場帶什麼開場網頁與開場選項：原卡開場用原卡的；擴充開場整組換成它自己的。 */
export function selectedOpeningExtras(source: OpeningSource | undefined, base: OpeningExtras): OpeningExtras {
  if (!source || source.kind !== 'workshop') return base
  return { openingPage: source.openingPage, openingMode: source.mode, prologue: source.prologue.slice() }
}

/** 伺服器回的這場對話的擴充；讀不到或形狀不對回 null（當作沒有擴充，不影響遊玩）。 */
export function normalizeWorkshopView(data: any): WorkshopConversationView | null {
  if (!data || typeof data !== 'object') return null
  const items: WorkshopViewItem[] = []
  for (const raw of Array.isArray(data.items) ? data.items : []) {
    if (!raw || typeof raw !== 'object' || !str(raw.workshopId)) continue
    const status = STATUSES.includes(raw.status) ? raw.status as WorkshopStatus : 'resident'
    items.push({
      workshopId: str(raw.workshopId),
      name: str(raw.name),
      coverUrl: str(raw.coverUrl),
      kinds: Array.isArray(raw.kinds) ? raw.kinds.filter((k: any) => KINDS.includes(k)) : [],
      residentChars: Number.isFinite(Number(raw.residentChars)) ? Math.max(0, Number(raw.residentChars)) : 0,
      status,
    })
  }
  const src = data.openingSource && typeof data.openingSource === 'object' ? data.openingSource : {}
  const fromWorkshop = src.kind === 'workshop' && !!str(src.workshopId)
  return {
    selectionRevision: Number(data.selectionRevision) || 0,
    manifestHash: str(data.manifestHash),
    capacityRevision: Number(data.capacityRevision) || 0,
    openingSource: fromWorkshop
      ? {
          kind: 'workshop', workshopId: str(src.workshopId), workshopName: str(src.workshopName), openingId: str(src.openingId),
          mode: src.mode === 'page' ? 'page' : 'greeting', openingPage: str(src.openingPage),
          prologue: Array.isArray(src.prologue) ? src.prologue.filter(nonEmpty) : [],
        }
      : { kind: 'base', openingId: str(src.openingId) },
    items,
    triggeredCount: items.filter((i) => i.status === 'triggered').length,
  }
}

/** 伺服器記下的開場來源，換成跟開場選擇同一種形狀（開場網頁、開場選項照它畫）。 */
export function viewOpeningSource(view: WorkshopConversationView): OpeningSource {
  const src = view.openingSource
  if (src.kind !== 'workshop') return { kind: 'base' }
  return {
    kind: 'workshop',
    workshopId: src.workshopId || '',
    workshopName: src.workshopName || '',
    openingId: src.openingId || '',
    mode: src.mode || 'greeting',
    greeting: '',
    openingPage: src.openingPage || '',
    prologue: (src.prologue || []).slice(),
  }
}

/** 資訊入口的小圓點：這場對話有擴充的常駐降為觸發載入（照樣開始進來的）才亮。 */
export function workshopAlert(view: WorkshopConversationView | null): boolean {
  return !!view && view.triggeredCount > 0
}

/** 作者資產上的擴充 hash；沒有欄位（舊伺服器、沒擴充）是空字串。 */
export function assetWorkshopHash(asset: any): string {
  return asset && typeof asset.workshopHash === 'string' ? asset.workshopHash : ''
}

/** 已裝的 hash（null＝還沒裝過）跟新讀到的不同才要重建整個規則安裝。 */
export function needsAssetRebuild(installed: string | null, next: string): boolean {
  if (installed === null) return false
  return installed !== next
}
