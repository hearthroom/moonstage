/**
 * Scripted cards use authored HTML as both UI and machine-readable input. Preserve
 * those text subtrees before scripts read them; Markdown prose still converts.
 * Mark the original tags without parsing/serializing: HTML blocks can open and close
 * across separate Markdown tokens. Author-built UI uses sdk.text.convert/ready.
 */
function markHtml(source: string, state: { rawTextTag: string }): string {
  if (state.rawTextTag) {
    const close = new RegExp('</' + state.rawTextTag + '(?=[\\s>])', 'i').exec(source)
    if (!close) return source
    const before = source.slice(0, close.index)
    state.rawTextTag = ''
    return before + markHtml(source.slice(close.index), state)
  }
  let out = '', i = 0
  while (i < source.length) {
    const start = source.indexOf('<', i)
    if (start < 0) return out + source.slice(i)
    out += source.slice(i, start)
    if (source.startsWith('<![CDATA[', start)) {
      const end = source.indexOf(']]>', start + 9)
      const stop = end < 0 ? source.length : end + 3
      out += source.slice(start, stop); i = stop; continue
    }
    if (source.startsWith('<!--', start)) {
      const end = source.indexOf('-->', start + 4)
      const stop = end < 0 ? source.length : end + 3
      out += source.slice(start, stop); i = stop; continue
    }
    const tag = /^<([A-Za-z][\w-]*)(?=[\s/>])/.exec(source.slice(start))
    if (!tag) { out += '<'; i = start + 1; continue }
    let end = start + tag[0].length, quote = ''
    for (; end < source.length; end++) {
      const ch = source[end]
      if (quote) { if (ch === quote) quote = '' }
      else if (ch === '"' || ch === "'") quote = ch
      else if (ch === '>') break
    }
    // Leave malformed/incomplete opening tags untouched.
    if (end >= source.length) return out + source.slice(start)
    out += tag[0] + ' translate="no"' + source.slice(start + tag[0].length, end + 1)
    i = end + 1
    // Do not treat HTML-looking text inside raw-text elements as actual tags.
    if (/^(script|style|textarea|title|xmp)$/i.test(tag[1])) {
      const close = new RegExp('</' + tag[1] + '(?=[\\s>])', 'ig')
      close.lastIndex = i
      const hit = close.exec(source)
      const stop = hit ? hit.index : source.length
      if (!hit) state.rawTextTag = tag[1]
      out += source.slice(i, stop); i = stop
    }
  }
  return out
}

export function renderAuthorMarkdown(md: any, source: string, preserveAuthorHtml = false): string {
  if (!preserveAuthorHtml) return md.render(source)
  const env = {}
  const tokens = md.parse(source, env)
  const state = { rawTextTag: '' }
  const walk = (list: any[]) => {
    for (const token of list) {
      if (token.type === 'html_block' || token.type === 'html_inline') token.content = markHtml(token.content, state)
      if (token.children) walk(token.children)
    }
  }
  walk(tokens)
  return md.renderer.render(tokens, md.options, env)
}
