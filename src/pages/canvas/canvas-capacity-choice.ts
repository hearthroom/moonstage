/**
 * 第一輪就裝不下的卡：玩家在「調到建議的容量」與「用目前容量玩」之間選一個。
 *
 * 真實案例：一張卡有六十幾條常駐設定、十幾萬字，預設的 64K 連第一輪都裝不下。
 * 原本的錯誤卡叫玩家縮短訊息或換模型，兩個都沒用——卡太大跟訊息長短、模型是哪顆
 * 都無關。伺服器現在會在錯誤裡說哪種玩法裝得下（見 utils/chat-error-message 的
 * resolveContextCapacityAdvice），這裡只給它說裝得下的選項。
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

export type CapacityPatch = { context: number } | { trimConstantLore: true }

type Translate = (key: string, params?: Record<string, unknown>) => string

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
  if (key === 'raise' && advice.requiredTier) return { context: advice.requiredTier }
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
