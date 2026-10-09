/**
 * 簡繁字形轉換的獨立出口：社群站的榜單、卡片頁用它把卡片標題轉成玩家的介面字形。
 * 知道卡片語言就用 directionFor（同字形不轉），不知道才用 directionForLocale。
 *
 * 跟對話頁同一套規則（canvas-display-script）：看得出來是來源字形才轉、單字多義不動。
 * 單獨成一個入口，是為了讓宿主不必為了幾個標題載入整個舞台；字典仍是 chinese-dictionary
 * 那一塊，跟對話頁共用同一個檔，玩家下載一次就兩邊都用。
 */
export { directionForLocale, directionFor, createDisplayScriptConverter, convertPlainText } from '@/pages/canvas/canvas-display-script'
export type { ScriptDirection } from '@/pages/canvas/canvas-display-script'
