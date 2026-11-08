/**
 * 送出前就放不下的一輪：玩家在「調到建議的容量」與「用目前容量玩」之間選一個。
 *
 * 伺服器每一輪送出前都會檢查放不放得下（不只第一輪）。整理記憶也拿不掉的部分是：卡片內容、
 * 常駐世界書、人設與筆記本、開場白、最近兩輪的原文和這一則訊息。所以第一輪放不下是卡太大；
 * 聊到後面放不下，多半是最近幾輪很長，不是角色設定變大（2026-11-08 玩家回報：DeepSeek
 * 聊到中途跳「角色設定超出容量」，owner 指出那不是角色設定的問題）。標題依這兩種情況分開說，
 * 見 capacitySituation。
 *
 * 真實案例：一張卡有六十幾條常駐設定、十幾萬字，預設的 64K 連第一輪都裝不下。
 * 原本的錯誤卡叫玩家縮短訊息或換模型，兩個都沒用——卡太大跟訊息長短、模型是哪顆
 * 都無關。伺服器現在會在錯誤裡說哪種玩法裝得下（見 utils/chat-error-message 的
 * resolveContextCapacityAdvice），這裡只給它說裝得下的選項。
 *
 * 「用目前容量玩」在伺服器那邊是常駐世界書依作者的順序只帶入到容量的八分之一，角色卡內容不動。
 * 字面上只講結果（費用不變），不講刪、精簡、遺漏（owner 2026-11-08）。
 *
 * 選了之後先存設定、存好才重送同一則訊息：先送再存的話，這一輪讀到的還是舊設定，
 * 會再撞一次同樣的錯。存失敗就不重送，選項留著讓玩家再選一次。
 *
 * 這一支不碰 Vue 與請求層：存檔與重送由畫布傳進來，所以可以用假函式完整測試。
 */

export interface CapacityAdvice {
  /** 裝得下整張卡的最小上下文檔位（1–5）；沒有任何一檔裝得下時為 null。 */
  requiredTier: number | null
  /** 那一檔的大小；伺服器沒給時為 null。 */
  requiredTokens: number | null
  /** 用目前檔位、只帶最重要的常駐設定時裝得下。 */
  trimFits: boolean
}

export type CapacityChoiceKey = 'raise' | 'trim'

export interface CapacityChoiceOption {
  key: CapacityChoiceKey
  label: string
  desc: string
}

export type CapacityPatch = { context: number; trimConstantLore: false } | { trimConstantLore: true }

type Translate = (key: string, params?: Record<string, unknown>) => string

/** start：這張卡第一輪就放不下；later：這段對話聊到後面放不下。 */
export type CapacitySituation = 'start' | 'later'

/**
 * 從畫面上的訊息判斷是哪一種：已經有 AI 回過玩家、有摘要，或還有沒載進來的更舊紀錄，
 * 就是聊到後面。開場白（玩家開口前的 AI 訊息）、錯誤泡泡、沒有內容的失敗列與載入中的空白列都不算。
 */
export function capacitySituation(messages: any[] | null | undefined, hasOlderPages: boolean): CapacitySituation {
  if (hasOlderPages) return 'later'
  let playerSpoke = false
  for (const item of Array.isArray(messages) ? messages : []) {
    if (!item || item.systemOnly === true) continue
    if (item.isSummary === true) return 'later'
    if (item.type !== 0) {
      playerSpoke = true
      continue
    }
    // 還在載入的空白列、斷線或逾時留下的失敗列（重新整理後從歷史載回來也一樣）都不是回覆：
    // 第一輪失敗後重送被擋，放不下的仍然是這張卡。
    if (item.isApplicationError === true) continue
    if (!item.content && !item.thinkingContent) continue
    if (playerSpoke) return 'later'
  }
  return 'start'
}

export function capacityTitleKey(situation?: CapacitySituation | null): string {
  return situation === 'later' ? 'canvas.capacity.titleLater' : 'canvas.capacity.titleStart'
}

/** 128000 → '128K'：跟模型選單上那一檔的寫法一樣。 */
export function capacitySizeLabel(tokens: number | null | undefined): string {
  const n = Number(tokens)
  if (!Number.isFinite(n) || n <= 0) return ''
  return `${Math.round(n / 1000)}K`
}

/**
 * 伺服器說裝得下的選項，建議的檔位在前（完整保留設定，是這張卡原本的樣子）。
 * fallbackTokens：錯誤沒帶大小時，模型選單上那一檔的大小。
 */
export function capacityChoiceOptions(
  advice: CapacityAdvice | null | undefined,
  t: Translate,
  fallbackTokens?: number | null,
): CapacityChoiceOption[] {
  if (!advice) return []
  const options: CapacityChoiceOption[] = []
  if (advice.requiredTier) {
    const size = capacitySizeLabel(advice.requiredTokens ?? fallbackTokens)
    options.push({
      key: 'raise',
      label: size ? t('canvas.capacity.raise', { size }) : t('canvas.capacity.raiseNoSize'),
      desc: t('canvas.capacity.raiseSub'),
    })
  }
  if (advice.trimFits) {
    options.push({ key: 'trim', label: t('canvas.capacity.trim'), desc: t('canvas.capacity.trimSub') })
  }
  return options
}

/** 選了之後要存的那一個欄位；伺服器沒說裝得下的選項回 null。 */
export function capacityChoicePatch(key: CapacityChoiceKey, advice: CapacityAdvice | null | undefined): CapacityPatch | null {
  if (!advice) return null
  // 調高就是要完整的設定：之前選過精簡的話一起關掉，不然調高了設定還是被截掉。
  if (key === 'raise' && advice.requiredTier) return { context: advice.requiredTier, trimConstantLore: false }
  if (key === 'trim' && advice.trimFits) return { trimConstantLore: true }
  return null
}

export async function applyCapacityChoice(input: {
  key: CapacityChoiceKey
  advice: CapacityAdvice | null | undefined
  draft: string
  save: (patch: CapacityPatch) => Promise<boolean>
  resend: (draft: string) => void
}): Promise<boolean> {
  const patch = capacityChoicePatch(input.key, input.advice)
  if (!patch) return false
  let saved = false
  try {
    saved = (await input.save(patch)) === true
  } catch {
    saved = false
  }
  if (!saved) return false
  input.resend(input.draft)
  return true
}
