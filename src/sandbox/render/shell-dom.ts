/**
 * 殼的 DOM 骨架：固定的 `data-chat` 節點與 `data-slot` 插槽。作者的樣式與腳本只認這些名字，
 * 所以這裡的結構是契約（docs/sandbox-chat-page.md §4），改了要一起改文件與測試。
 *
 * 平台節點一律 z-index auto；功能欄是脫離流的作者掛載點，其餘是 root 的 flex 項目；
 * 舞台 content 2000／full 3000；殼自己的彈層 9000 起。
 */
import type { SandboxTheme, StageState } from '../protocol'
import type { ShellStrings } from '../strings'

export interface ShellRefs {
  root: HTMLElement
  authorCss: HTMLStyleElement
  header: HTMLElement
  headerBack: HTMLButtonElement
  headerTitle: HTMLElement
  headerActions: HTMLElement
  headerExtra: HTMLElement
  statusbar: HTMLElement | null
  messages: HTMLElement
  list: HTMLElement
  listSpacer: HTMLElement
  left: HTMLElement
  right: HTMLElement
  stage: HTMLElement
  composer: HTMLElement
  toolbar: HTMLElement
  input: HTMLTextAreaElement
  send: HTMLButtonElement
  more: HTMLButtonElement
}

export interface BuildShellOptions {
  theme: SandboxTheme
  strings: ShellStrings
  roleName: string
  roleAvatar: string
  /** 功能欄原文非空才建 `[data-slot="statusbar"]`；空就整塊不存在。 */
  hasStatusbar: boolean
  composerVisible: boolean
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  if (text != null) node.textContent = text
  return node
}

export function buildShell(doc: Document, mount: HTMLElement, options: BuildShellOptions): ShellRefs {
  const authorCss = el(doc, 'style', { 'data-chat': 'author-css' })
  doc.head.appendChild(authorCss)

  const root = el(doc, 'div', { 'data-chat': 'root', 'data-theme': options.theme, 'data-composer': options.composerVisible ? 'visible' : 'hidden' })

  const header = el(doc, 'header', { 'data-chat': 'header' })
  const headerBack = el(doc, 'button', { 'data-chat': 'header-back', type: 'button', title: options.strings.back }, '‹')
  const headerTitle = el(doc, 'div', { 'data-chat': 'header-title' })
  if (options.roleAvatar) headerTitle.appendChild(el(doc, 'img', { src: options.roleAvatar, alt: '' }))
  headerTitle.appendChild(el(doc, 'span', {}, options.roleName))
  const headerActions = el(doc, 'div', { 'data-chat': 'header-actions' })
  const headerExtra = el(doc, 'div', { 'data-slot': 'header-extra' })
  header.append(headerBack, headerTitle, headerActions, headerExtra)

  const statusbar = options.hasStatusbar ? el(doc, 'div', { 'data-slot': 'statusbar' }) : null

  const messages = el(doc, 'main', { 'data-chat': 'messages' })
  const list = el(doc, 'div', { 'data-chat': 'list' })
  const listSpacer = el(doc, 'div', { 'data-chat': 'list-spacer' })
  messages.append(list, listSpacer)

  const left = el(doc, 'div', { 'data-slot': 'left' })
  const right = el(doc, 'div', { 'data-slot': 'right' })
  const stage = el(doc, 'div', { 'data-chat': 'author-stage', 'data-stage': 'closed' })

  const composer = el(doc, 'footer', { 'data-chat': 'composer' })
  const toolbar = el(doc, 'div', { 'data-slot': 'toolbar' })
  const row = el(doc, 'div', { 'data-chat': 'composer-row' })
  const more = el(doc, 'button', { 'data-chat': 'more', type: 'button', title: options.strings.more }, '＋')
  const input = el(doc, 'textarea', { 'data-chat': 'input', rows: '1', placeholder: options.strings.placeholder })
  const send = el(doc, 'button', { 'data-chat': 'send', type: 'button' }, options.strings.send)
  row.append(more, input, send)
  composer.append(toolbar, row)
  composer.hidden = !options.composerVisible

  root.append(header)
  if (statusbar) root.append(statusbar)
  root.append(messages, left, right, stage, composer)
  mount.appendChild(root)

  return { root, authorCss, header, headerBack, headerTitle, headerActions, headerExtra, statusbar, messages, list, listSpacer, left, right, stage, composer, toolbar, input, send, more }
}

export function setStage(refs: ShellRefs, state: StageState) {
  refs.stage.setAttribute('data-stage', state)
}

export function setComposerVisible(refs: ShellRefs, visible: boolean) {
  refs.composer.hidden = !visible
  refs.root.setAttribute('data-composer', visible ? 'visible' : 'hidden')
}

export function setTheme(refs: ShellRefs, theme: SandboxTheme) {
  refs.root.setAttribute('data-theme', theme)
}

export function setViewportHeight(refs: ShellRefs, height: number) {
  if (Number.isFinite(height) && height > 0) refs.root.style.setProperty('--chat-viewport-height', `${Math.round(height)}px`)
}

const NON_VISUAL_TAGS = new Set(['STYLE', 'SCRIPT', 'LINK', 'META', 'TITLE', 'TEMPLATE', 'NOSCRIPT', 'IFRAME'])
const CAPTURE_RESIDUE_RE = /\(\[\\s\\S\][*+?]+\)/

function inlinePxHeight(node: Element): number {
  const style = node.getAttribute('style') || ''
  const m = /(?:^|;)\s*(?:min-)?height\s*:\s*(\d+(?:\.\d+)?)px\b/i.exec(style)
  return m ? Number(m[1]) : 0
}

function isOutOfFlowPosition(node: Element, win: Window | null): boolean {
  const inlinePos = (node as HTMLElement).style?.position?.trim().toLowerCase()
  if (inlinePos === 'fixed' || inlinePos === 'absolute') return true
  const csPos = win?.getComputedStyle?.(node)?.position?.trim().toLowerCase()
  return csPos === 'fixed' || csPos === 'absolute'
}

function hasFixedDescendant(node: Element, win: Window | null): boolean {
  for (const child of Array.from(node.querySelectorAll('*'))) {
    const inlinePos = (child as HTMLElement).style?.position?.trim().toLowerCase()
    if (inlinePos === 'fixed') return true
    if (win?.getComputedStyle?.(child)?.position?.trim().toLowerCase() === 'fixed') return true
  }
  return false
}

function classSignature(node: Element): string {
  return Array.from(node.classList).filter(Boolean).sort().join('.')
}

function isLargeOrFormBlock(node: Element): boolean {
  if (inlinePxHeight(node) >= 120) return true
  const h = (node as HTMLElement).offsetHeight || (node as HTMLElement).scrollHeight || 0
  if (h >= 120) return true
  if (node.querySelector('input, select, textarea') !== null) return true
  if (node.querySelectorAll('button, h1, h2, h3, details').length >= 2) return true
  return node.outerHTML.length >= 400 || (node.textContent || '').trim().length >= 100
}

function matchesListBlock(node: Element, list: HTMLElement): boolean {
  if (!isLargeOrFormBlock(node)) return false
  if (node.id) {
    const byId = Array.from(list.querySelectorAll('[id]')).find((n) => n !== node && n.id === node.id)
    if (byId && isLargeOrFormBlock(byId)) return true
  }
  const cls = classSignature(node)
  if (cls) {
    const candidates = Array.from(list.getElementsByTagName(node.tagName))
    if (candidates.some((n) => n !== node && classSignature(n) === cls && isLargeOrFormBlock(n))) return true
  }
  const norm = (node.textContent || '').replace(/[\s\uFEFF]+/g, '')
  if (norm.length >= 20) {
    const all = Array.from(list.querySelectorAll(node.tagName))
    if (all.some((n) => n !== node && (n.textContent || '').replace(/[\s\uFEFF]+/g, '') === norm)) return true
  }
  if (inlinePxHeight(node) >= 120) {
    const all = Array.from(list.querySelectorAll('*'))
    if (all.some((n) => n !== node && inlinePxHeight(n) >= 120)) return true
  }
  return false
}

/**
 * 沙箱功能欄（`[data-slot="statusbar"]`）掛載時，將與開場白／訊息列表重複的大型流內表單副本
 * 及誤貼入功能欄的正則捕獲式殘字設為不可見（視覺高度 0），同時保留 `position: fixed` 懸浮控件與
 * 緊湊型頂部流內狀態列（如卡 100377）。
 */
export function hideDuplicateStatusbarFlow(statusbar: HTMLElement | null, list: HTMLElement | null) {
  if (!statusbar) return
  const win = statusbar.ownerDocument?.defaultView ?? null
  let hidAny = false
  const children = Array.from(statusbar.children) as HTMLElement[]
  for (const child of children) {
    if (NON_VISUAL_TAGS.has(child.tagName)) continue
    if (isOutOfFlowPosition(child, win) || hasFixedDescendant(child, win)) continue
    const isCaptureResidue = CAPTURE_RESIDUE_RE.test(child.textContent || '')
    const isDup = list ? matchesListBlock(child, list) : false
    if (isCaptureResidue || isDup) {
      child.hidden = true
      child.setAttribute('data-lt-dup-hidden', '1')
      child.style.setProperty('display', 'none', 'important')
      hidAny = true
    }
  }
  if (hidAny) {
    for (const child of children) {
      if (NON_VISUAL_TAGS.has(child.tagName) || child.hasAttribute('data-lt-dup-hidden')) continue
      if (isOutOfFlowPosition(child, win) || hasFixedDescendant(child, win)) continue
      const hasText = (child.textContent || '').replace(/[\s\uFEFF]+/g, '').length > 0
      const hasMediaOrControl = child.querySelector('img, svg, canvas, video, audio, iframe, input, select, textarea, button') !== null
      if (!hasText && !hasMediaOrControl && inlinePxHeight(child) === 0) {
        child.hidden = true
        child.setAttribute('data-lt-dup-hidden', '1')
        child.style.setProperty('display', 'none', 'important')
      }
    }
  }
}

/** 殼內的確認框（授權送出用）。回傳使用者按了哪個。 */
export function confirmDialog(doc: Document, mount: HTMLElement, opts: { title: string; body: string; ok: string; cancel: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const mask = el(doc, 'div', { 'data-chat': 'alert' })
    const box = el(doc, 'div', { 'data-chat': 'alert-box' })
    box.append(el(doc, 'div', { 'data-chat': 'alert-title' }, opts.title), el(doc, 'div', { 'data-chat': 'alert-body' }, opts.body))
    const buttons = el(doc, 'div', { 'data-chat': 'alert-buttons' })
    const cancel = el(doc, 'button', { type: 'button', 'data-chat': 'alert-cancel' }, opts.cancel)
    const ok = el(doc, 'button', { type: 'button', 'data-chat': 'alert-ok' }, opts.ok)
    buttons.append(cancel, ok)
    box.appendChild(buttons)
    mask.appendChild(box)
    const finish = (value: boolean) => { mask.remove(); resolve(value) }
    cancel.addEventListener('click', () => finish(false))
    // 「允許」只認瀏覽器真的派送的點擊：確認框跟作者腳本同一份文件，合成的 click 不算玩家同意。
    ok.addEventListener('click', (e) => { if (e.isTrusted) finish(true) })
    mount.appendChild(mask)
    ok.focus()
  })
}
