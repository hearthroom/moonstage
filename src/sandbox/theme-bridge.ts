/** MMD author tokens must also reach the standard Canvas components. */
const TOKENS: Record<string, string[]> = {
  bg: ['bg', 'header-bg'],
  text: ['fg', 'header-fg'],
  'text-muted': ['muted', 'name-color'],
  border: ['line'],
  accent: ['accent'],
  'bubble-user-bg': ['bubble-user-bg'],
  'bubble-ai-bg': ['bubble-ai-bg'],
  'bubble-text': ['bubble-fg'],
  'composer-bg': ['composer-bg'],
  'composer-text': ['composer-fg'],
  'input-bg': ['composer-field-bg'],
  'input-text': ['composer-fg'],
  'input-placeholder': ['placeholder-color'],
  'input-border': ['composer-border'],
  'shortcut-bg': ['pill-bg'],
  'shortcut-text': ['pill-fg'],
  'more-item-bg': ['panel-icon-bg'],
}

export function createThemeBridge(root: HTMLElement, win: Window & typeof globalThis, authorCss?: HTMLStyleElement) {
  const doc = root.ownerDocument
  const view = (doc.defaultView || win) as Window & typeof globalThis
  // Platform defaults also declare --chat-*. Only declarations from author
  // styles/inline styles activate an alias; an untouched card keeps every host
  // value, including translucent header/bubble backgrounds.
  const platformSheets = new Set(Array.from(doc.styleSheets).filter(s => s.ownerNode !== authorCss))
  const host = new Map<string, string>()
  const targets = new Set(Object.values(TOKENS).flat().map(key => `--lt-canvas-${key}`))
  for (const key of targets) host.set(key, root.style.getPropertyValue(key))
  const written = new Map<string, string>()
  let disposed = false
  let scheduled = false

  function declarations() {
    const found = new Set<string>()
    const add = (style: CSSStyleDeclaration) => {
      for (const token of Object.keys(TOKENS)) if (style.getPropertyValue(`--chat-${token}`)) found.add(token)
    }
    add(root.style)
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule.type === 4 && !view.matchMedia((rule as CSSMediaRule).conditionText).matches) continue
        if (rule.type === 12 && !view.CSS.supports((rule as CSSSupportsRule).conditionText)) continue
        const style = rule as CSSStyleRule
        if (style.selectorText) {
          try { if (root.matches(style.selectorText)) add(style.style) } catch { /* Unsupported author selector. */ }
        }
        const nested = (rule as CSSGroupingRule).cssRules
        if (nested) walk(nested)
      }
    }
    for (const sheet of Array.from(doc.styleSheets)) {
      if (platformSheets.has(sheet) || sheet.disabled) continue
      if (sheet.media?.mediaText && !view.matchMedia(sheet.media.mediaText).matches) continue
      try { walk(sheet.cssRules) } catch { /* Cross-origin sheets are not readable. */ }
    }
    return found
  }

  function observe() {
    observer.observe(doc.head, { childList: true, subtree: true, characterData: true, attributes: true })
    observer.observe(root, { attributes: true })
    if (doc.body) observer.observe(doc.body, { attributes: true, childList: true, subtree: true, characterData: true })
    observer.observe(doc.documentElement, { attributes: true })
  }
  function refresh() {
    if (disposed) return
    const authored = declarations()
    const computed = view.getComputedStyle(root)
    const values = new Map(host)
    for (const [token, keys] of Object.entries(TOKENS)) {
      const name = `--chat-${token}`
      if (!authored.has(token) || !computed.getPropertyValue(name).trim()) continue
      for (const key of keys) {
        const target = `--lt-canvas-${key}`
        const fallback = host.get(target)
        values.set(target, `var(${name}${fallback ? `, ${fallback}` : ''})`)
      }
    }
    // Do not observe our own aliases: theme changes are infrequent, message
    // rendering must not cause a perpetual style/observer loop.
    observer.disconnect()
    // The standard composer renders its own placeholder elements. Only opt
    // them into an author color when that token is actually supplied, so cards
    // without an MMD input skin keep their existing placeholder appearance.
    root.toggleAttribute('data-author-placeholder', authored.has('input-placeholder') &&
      !!computed.getPropertyValue('--chat-input-placeholder').trim())
    root.toggleAttribute('data-author-shortcut-color', authored.has('shortcut-text') &&
      !!computed.getPropertyValue('--chat-shortcut-text').trim())
    for (const key of targets) {
      const value = values.get(key) || ''
      const current = root.style.getPropertyValue(key)
      // An author can still use the native --lt-canvas-* inline interface.
      // Relinquish an alias that the author has replaced; removing that override
      // allows the current MMD skin (or host fallback) to take over again.
      if (written.has(key) && current && current !== written.get(key)) continue
      written.set(key, value)
      if (current === value) continue
      if (value) root.style.setProperty(key, value)
      else root.style.removeProperty(key)
    }
    observe()
  }
  function schedule() {
    if (disposed || scheduled) return
    scheduled = true
    view.queueMicrotask(() => { scheduled = false; refresh() })
  }
  const isStylesheet = (node: Node) => node.nodeType === 1 &&
    ((node as Element).matches('style,link[rel="stylesheet"]') || !!(node as Element).querySelector('style,link[rel="stylesheet"]'))
  const observer = new view.MutationObserver(records => {
    // Messages change frequently. Only stylesheet changes and the root/ancestor
    // attributes that select author themes need a new CSSOM pass.
    if (records.some(record => {
      const target = record.target
      if (record.type === 'attributes' && [root, doc.body, doc.documentElement].includes(target as HTMLElement)) return true
      if (target.nodeName === 'STYLE' || target.nodeName === 'LINK' || target.parentElement?.tagName === 'STYLE') return true
      return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(isStylesheet)
    })) schedule()
  })
  observe()
  view.addEventListener('resize', schedule)
  return {
    update(vars?: Record<string, string>) {
      for (const [key, value] of Object.entries(vars || {})) {
        if (!/^--lt-canvas-[\w-]+$/.test(key)) continue
        if (targets.has(key)) host.set(key, value)
        else root.style.setProperty(key, value)
      }
      refresh()
    },
    refresh,
    dispose() {
      disposed = true
      observer.disconnect()
      view.removeEventListener('resize', schedule)
    },
  }
}
