/**
 * 前置被擋卡上的「轉成繁體再送出」：被擋那則玩家訊息轉成繁體的字；不該出現時回 ''。
 *
 * 為什麼有這顆鍵（owner 2026-10-23）：服務商的前置檢查多半用簡體詞庫，同一句換成繁體常常就過了。
 * 檢查的其實是整份請求（卡的設定、歷史、這一則），所以只轉這一則不保證有效；
 * 伺服器記這種重送的結果（harbor_chat_resend_intent_total），沒效果就撤掉。
 *
 * 「含簡體」要兩個條件一起成立：
 *   - 有一個以上「只會是簡體」的字。只看轉換有沒有改字不行：台灣詞庫會把繁體句子裡的台北、
 *     了解、周末改成臺北、瞭解、週末，純繁體也會「有變」。簡體字表也不能照單全收：范、干、台、
 *     里這類字繁體也寫得出來，OpenCC 卻照樣改（繁體人名「范先生」會變成「範先生」），
 *     所以落在一簡對多繁字表裡的字不算數。整句都是這類字的短訊息會漏掉，可以接受。
 *   - 轉換後真的不一樣，否則送出去等於原樣重試。
 *
 * 整句一起轉（OpenCC cn→tw），不走顯示層那個逐文字節點、單字遇到一簡對多繁就不動的轉換器：
 * 那是為兩三個字的 HUD 標籤設計的，這裡有完整的上下文可以斷詞。
 */
import { convertChinese } from '@/common/chinese-converter'
import TradOrSimp from '@/common/TradOrSimp'
import { HAS_CJK } from '@/common/display-script-walk'
import { isAmbiguousChar } from '@/common/ambiguous-chars'

// 一簡對多繁字表沒收、繁體裡卻是常見姓氏的字（于先生 → 於先生）。
const TWO_WAY_NAMES = '于'

function hasPlainlySimplified(text: string): boolean {
  for (const char of text) {
    if (isAmbiguousChar(char) || TWO_WAY_NAMES.includes(char)) continue
    if (TradOrSimp.detect(char).simplifiedCharacters > 0) return true
  }
  return false
}

export function traditionalResendText(text: string): string {
  const source = String(text || '')
  if (!source.trim() || !HAS_CJK.test(source)) return ''
  if (!hasPlainlySimplified(source)) return ''
  const converted = convertChinese(source, 's2t')
  return converted !== source ? converted : ''
}
