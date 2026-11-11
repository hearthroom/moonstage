/** 網頁外觀控制項管理的純變數區塊；沒有標記的作者 CSS 不作推測。 */
export const CARD_APPEARANCE_VARIABLES = [
  '--lt-canvas-bubble-ai-bg', '--lt-canvas-bubble-user-bg', '--lt-canvas-bubble-fg',
  '--lt-canvas-composer-field-bg', '--lt-canvas-send-bg', '--lt-canvas-accent',
  '--lt-canvas-font', '--lt-canvas-bg',
] as const

const START = '/* lt-card-appearance:start */'
const END = '/* lt-card-appearance:end */'
const allowed = new Set<string>(CARD_APPEARANCE_VARIABLES)

function declarations(body: string): string[] | null {
  const entries: string[] = []
  let quote = '', depth = 0, start = 0
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '\\') { i++; continue }
    if (quote) { if (ch === quote) quote = ''; continue }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === '{' || ch === '}') return null
    else if (ch === ';' && depth === 0) { entries.push(body.slice(start, i).trim()); start = i + 1 }
  }
  if (quote || depth) return null
  entries.push(body.slice(start).trim())
  return entries.filter(Boolean)
}

export function splitCardAppearanceCss(css: string): { css: string; appearance: string; variables: string[] } {
  const empty = { css, appearance: '', variables: [] as string[] }
  const start = css.indexOf(START), end = css.indexOf(END)
  if (start < 0 || end < start || css.indexOf(START, start + START.length) >= 0 || css.indexOf(END, end + END.length) >= 0) return empty
  const match = /^\s*\.canvas-root\s*\{([\s\S]*)\}\s*$/.exec(css.slice(start + START.length, end))
  const entries = match && declarations(match[1])
  if (!entries) return empty
  const variables: string[] = []
  for (const entry of entries) {
    const declaration = /^(--[a-z-]+)\s*:\s*([\s\S]+)$/.exec(entry)
    if (!declaration || !allowed.has(declaration[1])) return empty
    variables.push(declaration[1])
  }
  return { css: css.slice(0, start) + css.slice(end + END.length), appearance: css.slice(start, end + END.length), variables: [...new Set(variables)] }
}

export function managedCardVariables(root: HTMLElement): Set<string> {
  return new Set((root.getAttribute('data-lt-card-vars') || '').split(/\s+/).filter(name => allowed.has(name)))
}
