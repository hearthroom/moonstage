function transparent(color: string): boolean {
  return color === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color)
    || /\/\s*0(?:\.0+)?%?\s*\)$/.test(color)
}

/**
 * Chromium can scroll a textarea without moving its background-clip:text mask.
 * For solid-color clipped text, normal glyphs have the same appearance and paint
 * correctly during native scrolling. Gradients and visible text fills stay authored.
 * Only the focused composer uses this compatibility override; restore it on collapse.
 */
export function fixSolidClippedText(el: HTMLTextAreaElement): () => void {
  const style = el.ownerDocument.defaultView?.getComputedStyle(el)
  if (!style) return () => {}
  const read = (name: string) => style.getPropertyValue(name).trim()
  const clip = read('background-clip') || read('-webkit-background-clip')
  const color = read('background-color')
  if (clip !== 'text' || read('background-image') !== 'none' || !color || transparent(color)
    || !transparent(read('-webkit-text-fill-color'))) return () => {}

  const patches = [
    ['background-color', 'transparent'],
    ['-webkit-text-fill-color', color],
    ['color', color],
  ].map(([property, value]) => {
    const previous = el.style.getPropertyValue(property)
    const priority = el.style.getPropertyPriority(property)
    // Author rules may use !important. Preserve their resolved color while the
    // native editable control is active, rather than replacing it with our theme.
    el.style.setProperty(property, value, 'important')
    return { property, previous, priority, applied: el.style.getPropertyValue(property) }
  })
  return () => {
    for (const { property, previous, priority, applied } of patches) {
      // A later author script owns any declaration it changed while focused.
      if (el.style.getPropertyValue(property) !== applied || el.style.getPropertyPriority(property) !== 'important') continue
      if (previous) el.style.setProperty(property, previous, priority)
      else el.style.removeProperty(property)
    }
  }
}
