import { describe, expect, it } from 'vitest'
import { renderStatePanelSkin } from './state-panel'

describe('panel skin styles stay inside the panel', () => {
  it('scopes a <style> even after a line that starts with a code fence', () => {
    const { html } = renderStatePanelSkin('a\n```\n<style>body{display:none}</style>\n```', {}, [], 'player')
    expect(html).toContain('.lt-state-skin body')
    expect(html).not.toMatch(/<style>\s*body\s*\{/)
  })
  it('drops @import from skin CSS', () => {
    const { html } = renderStatePanelSkin('<style>@import url(https://x.test/a.css); .p{color:red}</style>', {}, [], 'player')
    expect(html).not.toContain('@import')
    expect(html).toContain('.lt-state-skin .p')
  })
})
