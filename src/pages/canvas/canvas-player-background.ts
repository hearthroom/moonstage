/**
 * 玩家自選背景：卡片原圖、模糊原圖、純色、自訂圖片（2026-10-18，任務書
 * docs/studio/tasks/2026-10-18-player-background.md）。
 *
 * ── 為什麼另開幾個偏好鍵，不動 backgroundUrl ──
 * backgroundUrl 是卡片的場景圖：作者的 setBackground 寫的就是它，玩家換回「卡片原圖」時
 * 要的也是作者最後切到的那一張。玩家的選擇放 backgroundMode／backgroundColor／
 * backgroundCustomUrl，作者換場景不會洗掉玩家的選擇，玩家換選項也不會弄丟作者的場景。
 *
 * ── 舊資料 ──
 * 沒有 backgroundMode 的舊偏好：backgroundOff=true（舊選單的「重置背景圖」，畫面是空的）
 * 對應到純色的墨色；其餘都是卡片原圖，照舊走 backgroundUrl → 卡片背景 → 形象圖。
 * 新的選擇一律把 backgroundOff 寫回 false：偏好是合併寫入，刪不掉鍵，只能蓋掉。
 *
 * ── 只作用於這張卡（用戶 2026-10-18 改判）──
 * 全部存在帶 roleId 的那一筆偏好，沒有帳號層級的背景設定。
 */
import { resolveStageBackground, resolveStageLandscapeBackground, type StageBackgroundInput } from './canvas-background'

export type BackgroundMode = 'card' | 'blur' | 'color' | 'custom'

/** 純色色票（美術總監 2026-10-18）：順序就是顯示順序，第一個是中性深色。key 對應讀屏名稱的文案鍵。 */
export const BACKGROUND_COLORS = [
  { key: 'ink', value: '#16191E' },
  { key: 'navy', value: '#18202E' },
  { key: 'green', value: '#1C2621' },
  { key: 'wine', value: '#2A1A1F' },
  { key: 'beige', value: '#E8E2D9' },
  { key: 'light', value: '#F2F3F5' },
] as const

export const INK = BACKGROUND_COLORS[0].value

/** 淺色色票。選了它們，氣泡外由平台畫的控制項（名字、重新生成、⋯）要改深色字才看得見。 */
const LIGHT_COLORS = new Set<string>(['#E8E2D9', '#F2F3F5'])

/** 自訂圖片的限制。上傳前在本機縮到這個長邊再傳，伺服器另有自己的上限。 */
export const CUSTOM_BACKGROUND_LIMIT = {
  maxBytes: 20 * 1024 * 1024,
  types: ['image/jpeg', 'image/png', 'image/webp'],
  maxEdge: 2560,
} as const

export interface BackgroundChoice {
  mode: BackgroundMode
  color: string
  customUrl: string
}

const MODES: BackgroundMode[] = ['card', 'blur', 'color', 'custom']
const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** 只認色票裡的顏色：偏好是自由欄位，存進怪值就退回墨色，不拿來直接畫。 */
export function paletteColor(value: unknown): string {
  const v = clean(value).toUpperCase()
  const hit = BACKGROUND_COLORS.find((c) => c.value === v)
  return hit ? hit.value : INK
}

/** 從偏好（或本機紀錄）讀出玩家的選擇，含舊資料對應。 */
export function backgroundChoiceFrom(prefs: Record<string, unknown> | null | undefined): BackgroundChoice {
  const p = prefs || {}
  const raw = clean(p.backgroundMode) as BackgroundMode
  const customUrl = clean(p.backgroundCustomUrl)
  if (MODES.includes(raw)) return { mode: raw, color: paletteColor(p.backgroundColor), customUrl }
  if (p.backgroundOff === true) return { mode: 'color', color: INK, customUrl }
  return { mode: 'card', color: paletteColor(p.backgroundColor), customUrl }
}

/** 選一個選項要寫進偏好的欄位。自訂圖片的網址由上傳端點寫，這裡不碰。 */
export function backgroundPrefsPatch(choice: Pick<BackgroundChoice, 'mode' | 'color'>): Record<string, unknown> {
  return { backgroundMode: choice.mode, backgroundColor: paletteColor(choice.color), backgroundOff: false }
}

export interface StageBackground {
  mode: BackgroundMode
  /** 這張卡的偏好還沒回來：什麼圖都先不畫，連作者 CSS 畫的也一樣 */
  pending?: boolean
  /** 直式要畫的圖；空＝不畫圖 */
  portrait: string
  /** 橫式要畫的圖；空＝退回直式 */
  landscape: string
  /** 圖底下的底色；空＝照頁面原本的底色 */
  color: string
}

/**
 * 舞台實際要畫什麼。choice 為 null＝這張卡的偏好還沒回來、本機也沒紀錄：
 * 先不畫圖，等偏好決定（第一幀不能露出原圖，見任務書「美術方向 → 第一幀」）。
 *
 * 模糊與原圖畫的是同一串（場景圖 → 卡片背景 → 形象圖），只差糊不糊，所以作者換場景時
 * 模糊照樣跟著換。純色與自訂圖片不看卡片的任何圖。自訂圖片沒有網址時退成墨色。
 */
export function resolvePlayerBackground(input: StageBackgroundInput, choice: BackgroundChoice | null): StageBackground {
  if (!choice) return { mode: 'card', pending: true, portrait: '', landscape: '', color: '' }
  const chain = { ...input, backgroundOff: false }
  switch (choice.mode) {
    case 'blur':
      return { mode: 'blur', portrait: resolveStageBackground(chain), landscape: resolveStageLandscapeBackground(chain), color: INK }
    case 'color':
      return { mode: 'color', portrait: '', landscape: '', color: paletteColor(choice.color) }
    case 'custom': {
      const url = clean(choice.customUrl)
      return url ? { mode: 'custom', portrait: url, landscape: url, color: INK } : { mode: 'color', portrait: '', landscape: '', color: INK }
    }
    default:
      return { mode: 'card', portrait: resolveStageBackground(chain), landscape: resolveStageLandscapeBackground(chain), color: '' }
  }
}

/** 這個背景是不是淺色底（只看我們給的色票；自訂圖片與卡片的圖不判斷）。 */
export function isLightBackground(bg: Pick<StageBackground, 'mode' | 'color'> | null | undefined): boolean {
  return !!bg && bg.mode === 'color' && LIGHT_COLORS.has(paletteColor(bg.color))
}

/** 本機紀錄：每張改過背景的卡記完整選擇，重開時第一幀照它畫。 */
const LOCAL_KEY = 'lt.playerBackground.'

export interface ChoiceStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export function readLocalChoice(storage: ChoiceStorage, roleId: string): BackgroundChoice | null {
  if (!roleId) return null
  try {
    const raw = storage.get(LOCAL_KEY + roleId)
    if (!raw) return null
    return backgroundChoiceFrom(JSON.parse(raw))
  } catch (e) {
    return null
  }
}

/** 卡片原圖就是沒改過：清掉紀錄，下次開卡跟從沒改過的卡一樣。 */
export function writeLocalChoice(storage: ChoiceStorage, roleId: string, choice: BackgroundChoice): void {
  if (!roleId) return
  try {
    if (choice.mode === 'card') storage.remove(LOCAL_KEY + roleId)
    else storage.set(LOCAL_KEY + roleId, JSON.stringify({ backgroundMode: choice.mode, backgroundColor: choice.color, backgroundCustomUrl: choice.customUrl }))
  } catch (e) { /* 存不進本機只影響第一幀 */ }
}

/** CSS url() 的值：加引號並轉義，網址裡的引號與反斜線不會截斷宣告。 */
export function cssUrl(url: string): string {
  return 'url("' + String(url).replace(/[\\"]/g, (c) => '\\' + c).replace(/[\n\r]/g, '') + '")'
}
