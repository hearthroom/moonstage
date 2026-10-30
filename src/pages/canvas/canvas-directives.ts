/**
 * 長期指令的清單狀態。
 *
 * 「這段對話一直有效的要求」——每一輪都會帶上去，所以它跟一次性的訊息不同：
 * 加、改、刪都是立刻生效的動作，玩家按下去之後畫面上要看得出來發生了什麼。
 *
 * 抽成純函式的理由是這幾條規則都只在邊界上出錯，而邊界很難在瀏覽器裡踩到：
 * 上限到了還讓人按新增（送出去被伺服器擋，玩家只看到一句失敗）、對話還沒建立
 * 就送出（400，看起來像壞了）、編輯中又點另一條（兩條同時進編輯態）。
 */

export interface DirectiveItem {
  sourceId: string
  text: string
  /** 'manual'＝玩家自己寫的；其餘是系統從對話裡整理出來的 */
  origin?: string
  status?: string
}

export interface DirectiveState {
  loading: boolean
  loadFailed: boolean
  list: DirectiveItem[]
  maxCount: number
  maxLength: number
  /** 正在編輯哪一條；'' ＝沒有 */
  editingSourceId: string
  editingText: string
  /** 底下那格還沒送出的字 */
  draft: string
  /** 留在面板裡的錯誤訊息。彈層蓋在提示之上，提示會被藏在後面。 */
  error: string
}

/**
 * 上限的預設值只是「還不知道」時的佔位。真正的數字由伺服器每次回傳——
 * 寫死在客戶端的話，伺服器放寬之後玩家會被一個已經不存在的限制擋住。
 */
export const DIRECTIVE_FALLBACK_MAX_COUNT = 10
export const DIRECTIVE_FALLBACK_MAX_LENGTH = 200

export function createDirectiveState(): DirectiveState {
  return {
    loading: false,
    loadFailed: false,
    list: [],
    maxCount: DIRECTIVE_FALLBACK_MAX_COUNT,
    maxLength: DIRECTIVE_FALLBACK_MAX_LENGTH,
    editingSourceId: '',
    editingText: '',
    draft: '',
    error: '',
  }
}

/** 伺服器回的清單在 `list` 這個鍵底下，不是 `directives`。 */
export function readDirectiveResponse(raw: any): Pick<DirectiveState, 'list' | 'maxCount' | 'maxLength'> {
  const src = raw && typeof raw === 'object' ? raw : {}
  const list = Array.isArray(src.list) ? src.list : []
  const maxCount = Number(src.maxCount)
  const maxLength = Number(src.maxLength)
  return {
    list: list
      .filter((row: any) => row && row.sourceId)
      .map((row: any) => ({
        sourceId: String(row.sourceId),
        text: String(row.text || ''),
        origin: String(row.origin || ''),
        status: String(row.status || ''),
      })),
    maxCount: Number.isFinite(maxCount) && maxCount > 0 ? maxCount : DIRECTIVE_FALLBACK_MAX_COUNT,
    maxLength: Number.isFinite(maxLength) && maxLength > 0 ? maxLength : DIRECTIVE_FALLBACK_MAX_LENGTH,
  }
}

/** 「(3/10)」那個數字。 */
export function directiveCountText(state: DirectiveState): string {
  return `(${state.list.length}/${state.maxCount})`
}

export type DirectiveBlockReason = '' | 'no-conversation' | 'limit' | 'empty' | 'too-long'

/**
 * 現在按得下新增嗎？按不下時回一個原因，讓畫面把原因寫出來。
 *
 * 對話還沒建立是最容易被漏掉的一種：選開場白的玩家還沒開始對話，指令沒有地方
 * 掛。這時候不能只是把鍵變灰——玩家不知道要等什麼。
 */
export function addBlockReason(state: DirectiveState, hasConversation: boolean): DirectiveBlockReason {
  if (!hasConversation) return 'no-conversation'
  if (state.list.length >= state.maxCount) return 'limit'
  if (!String(state.draft || '').trim()) return 'empty'
  if (String(state.draft).length > state.maxLength) return 'too-long'
  return ''
}

export function canAddDirective(state: DirectiveState, hasConversation: boolean): boolean {
  return addBlockReason(state, hasConversation) === ''
}

/** 一次只有一條在編輯態：兩條同時可編輯時，玩家分不出剛剛改的是哪一條。 */
export function startEditDirective(state: DirectiveState, item: DirectiveItem): DirectiveState {
  return { ...state, editingSourceId: item.sourceId, editingText: item.text, error: '' }
}

export function cancelEditDirective(state: DirectiveState): DirectiveState {
  return { ...state, editingSourceId: '', editingText: '', error: '' }
}

/** 改成空白等於刪掉，但玩家按的是「儲存」——不要替他做刪除這個決定。 */
export function canSaveEdit(state: DirectiveState): boolean {
  const text = String(state.editingText || '').trim()
  return Boolean(state.editingSourceId) && Boolean(text) && text.length <= state.maxLength
}

/*
 * ── 指令組 ────────────────────────────────────────────────────────────
 *
 * 玩家在帳號底下存好幾組長期指令，給一張卡選一組，這張卡的新存檔一開就帶著；
 * 單一存檔也能整組換掉。套用是抄一份進存檔，不是連結：之後改那一組，已經開好的
 * 存檔不會跟著變——所以存檔裡不顯示「來自哪一組」，免得玩家以為改組會連動。
 *
 * 面板在沙盒卡裡由殼用同一個元件畫，屬性要能跨 postMessage，所以所有字（含
 * 單複數與帶變數的句子）都在這裡先算好，元件只負責畫。
 */

export interface DirectivePresetRow {
  presetId: string
  title: string
  items: string[]
  cardCount: number
}

export type DirectiveSetsView = 'list' | 'sets' | 'save-as'
export type DirectiveSetsScope = 'save' | 'card'

export interface DirectiveSetsState {
  loading: boolean
  loadFailed: boolean
  loaded: boolean
  list: DirectivePresetRow[]
  maxCount: number
  maxTitle: number
  /** 這張卡的新存檔自動帶上哪一組；'' ＝不自動帶上（或還沒選過，看 cardChosen） */
  cardPresetId: string
  /** 玩家給這張卡選過沒有（選「不自動帶上」也算） */
  cardChosen: boolean
  view: DirectiveSetsView
  scope: DirectiveSetsScope
  /** 子視圖裡選中的那一組；'' ＝不自動帶上（只有卡片範圍有這一列）或還沒選 */
  picked: string
  name: string
  bindCard: boolean
  busy: boolean
  error: string
  /** 面板裡一行成功狀態（不只 toast：面板蓋在提示之上） */
  status: string
  upgradeBusy: boolean
  upgradeError: string
  /** 「不再提示」：只記在這台裝置 */
  upgradeDismissed: boolean
}

export const DIRECTIVE_SETS_FALLBACK_MAX_COUNT = 20
export const DIRECTIVE_SETS_FALLBACK_MAX_TITLE = 40

export function createDirectiveSetsState(): DirectiveSetsState {
  return {
    loading: false, loadFailed: false, loaded: false,
    list: [], maxCount: DIRECTIVE_SETS_FALLBACK_MAX_COUNT, maxTitle: DIRECTIVE_SETS_FALLBACK_MAX_TITLE,
    cardPresetId: '', cardChosen: false,
    view: 'list', scope: 'save', picked: '', name: '', bindCard: false,
    busy: false, error: '', status: '',
    upgradeBusy: false, upgradeError: '', upgradeDismissed: false,
  }
}

/** GET /player/directive-presets 的回應。 */
export function readDirectivePresetsResponse(raw: any): Pick<DirectiveSetsState, 'list' | 'maxCount' | 'maxTitle'> {
  const src = raw && typeof raw === 'object' ? raw : {}
  const list = Array.isArray(src.list) ? src.list : []
  const maxCount = Number(src.maxCount)
  const maxTitle = Number(src.maxTitle)
  return {
    list: list
      .filter((row: any) => row && row.presetId)
      .map((row: any) => ({
        presetId: String(row.presetId),
        title: String(row.title || ''),
        items: Array.isArray(row.items) ? row.items.map((x: any) => String(x)) : [],
        cardCount: Number(row.cardCount) || 0,
      })),
    maxCount: Number.isFinite(maxCount) && maxCount > 0 ? maxCount : DIRECTIVE_SETS_FALLBACK_MAX_COUNT,
    maxTitle: Number.isFinite(maxTitle) && maxTitle > 0 ? maxTitle : DIRECTIVE_SETS_FALLBACK_MAX_TITLE,
  }
}

/**
 * GET /conversation/directives 另外帶的卡片選擇。新增／編輯的回應沒有這兩欄，
 * 沒帶就回 null，呼叫端不要拿預設值蓋掉手上的。
 */
export function readCardDirectiveChoice(raw: any): { cardPresetId: string; cardChosen: boolean } | null {
  if (!raw || typeof raw !== 'object' || !('cardPresetChosen' in raw)) return null
  return { cardPresetId: String(raw.cardPresetId || ''), cardChosen: Boolean(raw.cardPresetChosen) }
}

/** 打開子視圖：從「更換」進來是卡片範圍並選中目前那一組；從「換一組」進來是這個存檔、什麼都沒選。 */
export function openDirectiveSets(state: DirectiveSetsState, scope: DirectiveSetsScope): DirectiveSetsState {
  return { ...state, view: 'sets', scope, picked: scope === 'card' ? state.cardPresetId : '', error: '', status: '' }
}

export function pickDirectiveScope(state: DirectiveSetsState, scope: DirectiveSetsScope): DirectiveSetsState {
  return openDirectiveSets(state, scope)
}

/** 存成指令組：名稱預設留空，「同時自動帶上」預設不勾。 */
export function openDirectiveSaveAs(state: DirectiveSetsState): DirectiveSetsState {
  return { ...state, view: 'save-as', name: '', bindCard: false, error: '', status: '' }
}

export function backToDirectiveList(state: DirectiveSetsState): DirectiveSetsState {
  return { ...state, view: 'list', error: '', busy: false }
}

/** 名稱超過上限就截；伺服器也會截，但先截才不會讓玩家看到存出來的跟填的不一樣。 */
export function clampSetTitle(title: string, max: number): string {
  const chars = Array.from(String(title || '').trim())
  return chars.length > max ? chars.slice(0, max).join('') : chars.join('')
}

/** 「已經是這一組」：只有卡片範圍知道目前是哪一組（存檔裡的條目是抄進去的，不記來源）。 */
export function directiveSetAlready(state: DirectiveSetsState): boolean {
  return state.scope === 'card' && state.cardChosen && state.picked === state.cardPresetId
}

export function canApplyDirectiveSet(state: DirectiveSetsState, hasConversation: boolean): boolean {
  if (state.busy) return false
  if (state.scope === 'save') return hasConversation && Boolean(state.picked)
  return !directiveSetAlready(state)
}

export function canSaveDirectiveSet(state: DirectiveSetsState, directiveCount: number): boolean {
  return !state.busy && Boolean(String(state.name || '').trim()) && directiveCount > 0 && state.list.length < state.maxCount
}

/** 升級提示：這張卡還沒選過、這個存檔有指令、這台裝置沒說過不再提示。指令組讀到之前不出現，免得一閃。 */
export function showDirectiveUpgrade(sets: DirectiveSetsState, directiveCount: number): boolean {
  return sets.loaded && !sets.cardChosen && directiveCount > 0 && !sets.upgradeDismissed && sets.view === 'list'
}

/** vue-i18n 的 t(key, named, plural) */
export type DirectiveT = (key: string, named?: Record<string, unknown>, plural?: number) => string

export interface DirectiveSetsViewModel {
  view: DirectiveSetsView
  source: {
    loading: boolean
    loadFailed: boolean
    hasSets: boolean
    cardValue: string
    canSwitch: boolean
    canSaveAs: boolean
    canManage: boolean
  }
  upgrade: { show: boolean; body: string; busy: boolean; error: string }
  status: string
  sets: {
    scope: DirectiveSetsScope
    saveScopeDisabled: boolean
    rows: Array<{ id: string; title: string; countText: string; preview: string[] }>
    picked: string
    summary: string
    keepHint: string
    note: string
    applyLabel: string
    canApply: boolean
    busy: boolean
    error: string
  }
  saveAs: { name: string; maxTitle: number; summary: string; bindCard: boolean; full: string; canSave: boolean; busy: boolean; error: string }
}

/** 主畫布與沙盒殼共用的畫面資料。 */
export function buildDirectiveSetsView(
  dir: Pick<DirectiveState, 'list'>,
  sets: DirectiveSetsState,
  ctx: { t: DirectiveT; hasConversation: boolean; streaming: boolean; canManage: boolean },
): DirectiveSetsViewModel {
  const { t } = ctx
  const n = dir.list.length
  const m = dir.list.filter((row) => (row.origin || 'manual') !== 'manual').length
  const byId = new Map(sets.list.map((row) => [row.presetId, row]))
  const cardSet = sets.cardChosen && sets.cardPresetId ? byId.get(sets.cardPresetId) : undefined
  const picked = sets.picked ? byId.get(sets.picked) : undefined

  let summary = ''
  let keepHint = ''
  if (sets.scope === 'card') {
    summary = picked
      ? t('directive.set.card.sum', { name: picked.title, n: picked.items.length }, picked.items.length)
      : t('directive.set.card.sumNone')
    if (directiveSetAlready(sets)) summary = `${summary} ${t('directive.set.already')}`
  } else if (!ctx.hasConversation) {
    summary = t('directive.set.noConversation')
  } else if (picked) {
    const k = picked.items.length
    if (n === 0) summary = t('directive.set.save.sumEmpty', { name: picked.title, k })
    else if (m > 0) summary = t('directive.set.save.sumAi', { name: picked.title, n, m, k }, n)
    else summary = t('directive.set.save.sum', { name: picked.title, n, k }, n)
    if (n > 0) keepHint = t('directive.set.save.keepHint', { n }, n)
  }

  const rows = sets.list.map((row) => ({
    id: row.presetId,
    title: row.title,
    countText: t('directive.set.count', { n: row.items.length }, row.items.length),
    preview: row.items.slice(0, 2),
  }))
  if (sets.scope === 'card') rows.unshift({ id: '', title: t('directive.set.none'), countText: '', preview: [] })

  const full = sets.list.length >= sets.maxCount
  return {
    view: sets.view,
    source: {
      loading: sets.loading,
      loadFailed: sets.loadFailed,
      hasSets: sets.list.length > 0,
      cardValue: cardSet ? cardSet.title : t('directive.set.none'),
      canSwitch: sets.list.length > 0,
      canSaveAs: n > 0,
      canManage: ctx.canManage,
    },
    upgrade: {
      show: showDirectiveUpgrade(sets, n),
      body: t('directive.set.upgrade.body', { n }, n),
      busy: sets.upgradeBusy,
      error: sets.upgradeError,
    },
    status: sets.status,
    sets: {
      scope: sets.scope,
      saveScopeDisabled: !ctx.hasConversation,
      rows,
      picked: sets.picked,
      summary,
      keepHint,
      note: ctx.streaming ? t('directive.set.streamingNote') : '',
      applyLabel: t(sets.scope === 'card' ? 'directive.set.card.apply' : 'directive.set.save.apply'),
      canApply: canApplyDirectiveSet(sets, ctx.hasConversation),
      busy: sets.busy,
      error: sets.error,
    },
    saveAs: {
      name: sets.name,
      maxTitle: sets.maxTitle,
      summary: t('directive.set.saveAs.sum', { n }, n),
      bindCard: sets.bindCard,
      full: full ? t('directive.set.error.full', { max: sets.maxCount }) : '',
      canSave: canSaveDirectiveSet(sets, n),
      busy: sets.busy,
      error: sets.error,
    },
  }
}

/**
 * 讀指令組的結果怎麼處理。舊供應商沒有這條路徑（404 而且不是我們的錯誤信封）→ 整區不畫；
 * 卡片玩不到時伺服器也回 404，但帶 `{ error: 'not_found' }`——那只是這次讀不到，
 * 當成舊供應商的話整區會消失、而且之後不再試。
 */
export function directiveSetsLoadOutcome(statusCode: number, data: any): 'ok' | 'unsupported' | 'failed' {
  if (statusCode === 200) return 'ok'
  if (statusCode === 404 && !(data && typeof data === 'object' && data.error)) return 'unsupported'
  return 'failed'
}

/** 寫入失敗的種類：沒連上、指令組滿了、那一組已經不在（別處刪掉）、其他。 */
export function directiveSetsErrorKind(e: any): 'network' | 'full' | 'gone' | 'other' {
  if (!e || !e.statusCode) return 'network'
  const code = e.data && e.data.error
  if (code === 'DIRECTIVE_PRESET_LIMIT_REACHED') return 'full'
  if (code === 'DIRECTIVE_PRESET_NOT_FOUND') return 'gone'
  return 'other'
}
