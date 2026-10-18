import { readFileSync } from 'node:fs'
import path from 'node:path'
import postcss, { type AtRule } from 'postcss'
import { describe, expect, it } from 'vitest'

// The sandbox has no host/uni reset. Platform bubble padding must stay within
// its percentage cap, while MMD author descendants retain their own box model.
describe('platform bubble box model', () => {
  it('includes padding in its width cap within the overridable base layer', () => {
    const css = postcss.parse(readFileSync(path.resolve(process.cwd(), 'src/pages/canvas/canvas.css'), 'utf8'))
    const candidates: string[] = []
    css.walkRules(rule => {
      if (rule.selector !== '.mes_text') return
      rule.walkDecls('box-sizing', d => { candidates.push(d.value) })
      expect(rule.parent?.type).toBe('atrule')
      expect((rule.parent as AtRule).params).toBe('lt-base')
    })
    expect(candidates).toEqual(['border-box'])
  })
})
