/**
 * 更新宿主產生的 HTML 投影，同時保留作者腳本管理的 live DOM。
 * 比對的是前後兩份來源；來源沒改的節點、屬性與文字不重設。
 * 來源節點用 reference 對回 live 節點，所以作者插入／搬動節點不會讓索引錯位。
 */
export function createLiveHtml(root: HTMLElement) {
  const doc = root.ownerDocument
  let source: Node
  let live = new WeakMap<Node, Node>()
  const bind = (template: Node, target: Node) => {
    live.set(template, target)
    Array.from(template.childNodes).forEach((child, i) => bind(child, target.childNodes[i]))
  }
  const trimBom = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 && child.textContent?.includes('\uFEFF') && !child.textContent.trim()) child.remove()
    }
  }
  const replace = (html: string) => {
    root.innerHTML = html
    trimBom(root)
    source = root.cloneNode(true)
    live = new WeakMap()
    bind(source, root)
  }
  const patch = (before: Node, after: Node) => {
    const target = live.get(before)
    if (!target) return
    if (before.nodeType !== after.nodeType || before.nodeName !== after.nodeName) {
      const replacement = after.cloneNode(true)
      target.parentNode?.replaceChild(replacement, target)
      bind(after, replacement)
      return
    }
    live.set(after, target)
    if (before.nodeType === 3) {
      if (before.nodeValue !== after.nodeValue && target.nodeValue === before.nodeValue) target.nodeValue = after.nodeValue
      return
    }
    if (before.nodeType === 1) {
      const old = before as Element, next = after as Element, el = target as Element
      const names = new Set([...Array.from(old.attributes), ...Array.from(next.attributes)].map(a => a.name))
      for (const name of names) {
        const prev = old.getAttribute(name), value = next.getAttribute(name)
        if (prev === value || el.getAttribute(name) !== prev) continue
        if (value === null) el.removeAttribute(name)
        else el.setAttribute(name, value)
      }
    }
    const previous = Array.from(before.childNodes), children = Array.from(after.childNodes)
    for (let i = 0; i < Math.max(previous.length, children.length); i++) {
      if (previous[i] && children[i]) patch(previous[i], children[i])
      else if (previous[i]) live.get(previous[i])?.parentNode?.removeChild(live.get(previous[i])!)
      else {
        const added = children[i].cloneNode(true)
        target.appendChild(added)
        bind(children[i], added)
      }
    }
  }
  replace(root.innerHTML)
  return {
    replace,
    update(html: string) {
      const next = source.cloneNode(false) as HTMLElement
      next.innerHTML = html
      trimBom(next)
      patch(source, next)
      source = next
    },
  }
}
