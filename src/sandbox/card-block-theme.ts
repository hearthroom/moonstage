/**
 * 沙箱殼裡的「塊」（思考過程、準備軌跡）跟著作者漆好的 AI 氣泡走。
 *
 * 一般畫布由 canvas.vue 的 syncCardTheme 量 AI 氣泡、把底色／邊框／字色寫回 --lt-canvas-block-*；
 * 殼先前沒有這一步，作者在沙箱卡裡漆了氣泡（直接寫 [data-chat=message-body]／.mes_text，或設
 * --chat-bubble-*），上下兩顆氣泡都換了色，夾在中間的思考過程仍是透明的淡框（owner 2026-11-06）。
 *
 * 只寫 block 這一組：主色與藥丸在殼裡由 theme-bridge 從 --chat-* 對映，兩邊都寫會互相搶。
 * 不聽根節點的 style：那是這裡與 theme-bridge 自己寫的，聽了會自己觸發自己。
 */
import { CARD_BLOCK_VAR_NAMES, computeCardThemeVars, readCardThemeSample, writeCardThemeVars } from '@/pages/canvas/canvas-card-theme'

export function bindCardBlockTheme(root: HTMLElement, list: HTMLElement): () => void {
  const doc = root.ownerDocument
  const view = doc.defaultView
  if (!view) return () => {}
  let frame = 0
  let disposed = false
  const sync = () => {
    frame = 0
    if (disposed) return
    writeCardThemeVars(root, computeCardThemeVars(readCardThemeSample(doc)), CARD_BLOCK_VAR_NAMES)
  }
  // 一小段時間內的變動併成一次量測（串流時每個字塊都會觸發）。用計時器不用 rAF：
  // 殼在 iframe 裡，被遮住或在背景時 rAF 不跑，主題就停在舊的。
  const schedule = () => {
    if (disposed || frame) return
    frame = view.setTimeout(sync, 32)
  }
  // 串流時每個字塊都會改到氣泡裡的節點，但取樣的是第一則 AI 氣泡，它不會因此換樣子。
  // 只在換了訊息、換了樣式表、日夜切換時才量：多一則訊息（.mes／訊息框）、<style>／<link> 進出或改字、屬性變了。
  const SAMPLE_INPUTS = '.mes, [data-chat="message-frame"], style, link[rel="stylesheet"]'
  const touchesSample = (node: Node) => node.nodeType === 1 &&
    ((node as Element).matches(SAMPLE_INPUTS) || !!(node as Element).querySelector(SAMPLE_INPUTS))
  const observer = new view.MutationObserver((records) => {
    if (records.some((r) => r.type === 'attributes' ||
      r.target.nodeName === 'STYLE' || r.target.parentElement?.nodeName === 'STYLE' ||
      Array.from(r.addedNodes).some(touchesSample) || Array.from(r.removedNodes).some(touchesSample))) schedule()
  })
  // 氣泡長出來（訊息框裡的元件晚一拍才掛上，所以要聽子樹）、作者換樣式、日夜切換。
  observer.observe(list, { childList: true, subtree: true })
  if (doc.head) observer.observe(doc.head, { childList: true, subtree: true, characterData: true })
  observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  if (doc.body) observer.observe(doc.body, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  schedule()
  return () => {
    disposed = true
    observer.disconnect()
    if (frame) view.clearTimeout(frame)
    frame = 0
  }
}
