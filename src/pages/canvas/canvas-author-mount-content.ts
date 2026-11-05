import { convertTextNodes, HAS_CJK } from '@/common/display-script-walk'

/** 作者的事件處理器也可能回讀 HUD 文字，與 script 一起保留原文。 */
export function hasAuthorMountCode(html: string): boolean {
  if (/<script\b/i.test(html)) return true
  if (typeof DOMParser === 'undefined') return false
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html')
  return Array.from(doc.body.querySelectorAll('*')).some((node) => Array.from(node.attributes).some((attr) => (
    /^on[a-z]+$/i.test(attr.name) || /^javascript:/i.test(attr.value.replace(/[\u0000-\u0020]/g, ''))
  )))
}

/**
 * 常駐 HUD 的顯示字形。腳本卡保留原始 HTML：作者可能讀取可見文字作為資料，
 * 與訊息的 scripted HTML 保護相同。一般 HUD 只轉可見文字，不動機讀資料或屬性。
 */
export function convertAuthorMountHtml(html: string, convert: (text: string) => string, scripted: boolean): string {
  if (!html || scripted || hasAuthorMountCode(html) || !HAS_CJK.test(html) || typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html')
  const protectedNodes: Array<{ node: Element; translate: string | null }> = []
  for (const node of doc.body.querySelectorAll('[hidden], [aria-hidden="true"], [style]')) {
    const style = (node as HTMLElement).style
    if (!node.hasAttribute('hidden') && node.getAttribute('aria-hidden') !== 'true'
      && style?.display !== 'none' && style?.visibility !== 'hidden' && style?.visibility !== 'collapse') continue
    protectedNodes.push({ node, translate: node.getAttribute('translate') })
    node.setAttribute('translate', 'no')
  }
  convertTextNodes(doc.body, convert)
  for (const { node, translate } of protectedNodes) {
    if (translate === null) node.removeAttribute('translate')
    else node.setAttribute('translate', translate)
  }
  return doc.body.innerHTML
}
