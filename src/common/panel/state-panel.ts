/**
 * 數值面板的皮膚怎麼畫：一般頁與沙箱殼都經過這一支，同一份模板＋數值得到逐字相同的 HTML。
 *
 * 皮膚的 <style> 用畫布既有的前綴法收在面板裡（common/author-style-scope 的 scopeCss，酒館訊息的
 * `.mes_text` 也是這一套）：每條選擇器前面接上面板容器的 class，作者寫的 `.panel{}`、`b{}` 只碰得到
 * 面板裡的東西，漏不到對話與頁面上。不用 shadow root：一般卡的作者 CSS 也是前綴法，兩種頁面都已經
 * 載著這支掃描器；而一鍵複製的事件委派在 shadow root 外會被重新指向宿主節點，要另外處理。
 */
import { renderPanel, type PanelRenderResult } from './handlebars-lite'
import { applyStylePolicyToHtml } from '../author-style-policy'

/** 皮膚容器的 class；皮膚 CSS 的每條規則都接在它後面。 */
export const STATE_PANEL_SKIN_CLASS = 'lt-state-skin'

export type StatePanelAudience = 'author' | 'player'

export function renderStatePanelSkin(template: string, data: unknown, changes: unknown[], audience: StatePanelAudience): PanelRenderResult {
  const result = renderPanel(template, data ?? {}, { changes, audience })
  if (result.error) return result
  return { html: applyStylePolicyToHtml(result.html, { scope: `.${STATE_PANEL_SKIN_CLASS}`, fencedDocument: 'inline', theme: 'host' }) }
}

/** 面板外框的字（呼叫端給已經是玩家語系的樣板；{n}、{line}、{message}、{helper} 由面板代入）。 */
export interface StatePanelLabels {
  /** 開面板那顆鍵的名字（aria-label 與 title）。 */
  open: string
  title: string
  close: string
  updatedLatest: string
  updatedOneAgo: string
  /** 含 {n} */
  updatedAgo: string
  updatedOpening: string
  showRaw: string
  showPanel: string
  /** 作者看到的、模型提了但沒採用的變更那一段的標題。 */
  rejected: string
  /** 玩家看到的皮膚出錯提示。 */
  unavailable: string
  unavailableSub: string
  /** 作者看到的皮膚錯誤：含 {line}、{message} */
  errorAt: string
  /** 作者看到的未知 helper：含 {line}、{helper} */
  errorHelper: string
  copied: string
}
