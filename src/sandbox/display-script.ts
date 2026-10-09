/**
 * 沙箱殼的顯示字形轉換（簡↔繁）：跟一般聊天頁同一套規則——卡片正則套完之後、只轉看得到的文字節點，
 * 屬性、<script>／<style>、translate="no" 的子樹不碰；儲存與傳輸永遠是原文。
 *
 * 字典另成一個檔（sandbox-zh.js）：只有卡片字形和玩家字形不同時才載入，其他語言的玩家一個位元組都不多下載。
 * 載入之前殼先照原文畫，載好了整個列表重畫一次；載不到（離線、逾時）就一直用原文，不擋任何東西。
 */
import { directionFor, type ScriptDirection } from '@/common/display-script-walk'

export type TextConverter = (text: string) => string
export type DisplayScriptLoader = (direction: ScriptDirection) => Promise<TextConverter | null>

type Factory = { create(direction: ScriptDirection): TextConverter }

export function scriptDirectionFor(cardLanguage: string | null | undefined, locale: string | null | undefined): ScriptDirection {
  return directionFor(cardLanguage, locale)
}

/** 預設載入器：在殼頁插一個傳統 <script src="./sandbox-zh.js">（不透明源下 module script 會被 CORS 擋）。 */
export function createScriptTagLoader(doc: Document, win: Window, src = './sandbox-zh.js', timeoutMs = 10_000): DisplayScriptLoader {
  return (direction) => new Promise((resolve) => {
    if (direction === 'none') { resolve(null); return }
    const take = () => {
      const factory = (win as unknown as { __msDisplayScript?: Factory }).__msDisplayScript
      resolve(factory ? factory.create(direction) : null)
    }
    if ((win as unknown as { __msDisplayScript?: Factory }).__msDisplayScript) { take(); return }
    const tag = doc.createElement('script')
    tag.src = src
    tag.defer = true
    const timer = win.setTimeout(() => resolve(null), timeoutMs)
    tag.onload = () => { win.clearTimeout(timer); take() }
    tag.onerror = () => { win.clearTimeout(timer); resolve(null) }
    ;(doc.head || doc.documentElement).appendChild(tag)
  })
}
