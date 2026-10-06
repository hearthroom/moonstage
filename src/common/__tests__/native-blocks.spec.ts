import { describe, it, expect } from 'vitest'
import { drawNativeBlocks, drawValue } from '../native-blocks'

describe('原生區塊：狀態與選項', () => {
  it('沒有區塊就原樣回傳', () => {
    expect(drawNativeBlocks('plain prose, no block')).toBe('plain prose, no block')
    expect(drawNativeBlocks('')).toBe('')
  })

  it('值的階梯：數字、百分比、a/b、等級、列表、屬性、實體、標籤、路徑、文字', () => {
    expect(drawValue('380')).toBe('<span class="lt-num">380</span>')
    expect(drawValue('72%')).toContain('width:72.0%')
    expect(drawValue('84/100')).toContain('width:84.0%')
    expect(drawValue('Adept|120/300')).toContain('<b class="lt-level">Adept</b>')
    expect(drawValue('head:hood|body:cloak:+2 armour')).toContain('lt-kvlist')
    expect(drawValue('head:hood|body:cloak:+2 armour')).toContain('<span class="lt-note">+2 armour</span>')
    expect(drawValue('atk:12 def:8 agi:15')).toContain('lt-stats')
    expect(drawValue('Mara=61, Tove=25')).toContain('lt-chip--kv')
    expect(drawValue('poisoned, tired')).toBe('<span class="lt-chips"><span class="lt-chip">poisoned</span><span class="lt-chip">tired</span></span>')
    expect(drawValue('Inner city > East market')).toContain('lt-path__sep')
    expect(drawValue('north gate/east street/west market')).toBe('<span class="lt-text">north gate/east street/west market</span>')
    expect(drawValue('2026-08-26')).toBe('<span class="lt-text">2026-08-26</span>')
  })

  it('一行一鍵；全形標點折半形；;; 也當換行；沒冒號的行留文字；閉合可缺', () => {
    const out = drawNativeBlocks('Rain.\n[status]\n- **hp**：７２／１００\nmood: wary;;tags: cold, watched\nno colon here\n')
    expect(out.startsWith('Rain.\n<div class="lt-status">')).toBe(true)
    expect(out).toContain('<span class="lt-status__k">hp</span>')
    expect(out).toContain('width:72.0%')
    expect(out).toContain('<span class="lt-status__k">mood</span>')
    expect(out).toContain('<span class="lt-chip">cold</span>')
    expect(out).toContain('lt-status__row--text">no colon here</div>')
    expect(out).not.toContain('[status]')
  })

  it('缺閉合的狀態塊停在接下來的選項塊前，反之亦然', () => {
    const out = drawNativeBlocks('[status]\nhp: 1\n[choices]\n- Go\n2. Stay\n[/choices]')
    expect(out).toBe('<div class="lt-status"><div class="lt-status__row"><span class="lt-status__k">hp</span><span class="lt-status__v"><span class="lt-num">1</span></span></div></div>'
      + '<div class="lt-choices"><button type="button" class="lt-choice">Go</button><button type="button" class="lt-choice">Stay</button><button type="button" class="lt-choice lt-choice--own">✎</button></div>')
    const out2 = drawNativeBlocks('[choices]\n- Go\n[status]\nhp: 2\n[/status]')
    expect(out2).toContain('<button type="button" class="lt-choice">Go</button>')
    expect(out2).toContain('<span class="lt-status__k">hp</span>')
    expect(out2).not.toContain('[status]')
  })

  it('全部跳脫；只有標準標籤與 class，沒有 inline handler 也沒有 data-*', () => {
    const out = drawNativeBlocks('[status]\nnote: <b onclick="x()">hi</b> & "q"\n[/status]\n[choices]\n- <img src=x onerror=1>\n[/choices]')
    expect(out).not.toMatch(/<b |<img|<[^>]*\son[a-z]+=|data-/)
    expect(out).toContain('&lt;b onclick=&quot;x()&quot;')
    expect(out).toContain('&lt;img src=x onerror=1&gt;')
  })

  it('選項最多八個', () => {
    const body = Array.from({ length: 12 }, (_, i) => `- option ${i}`).join('\n')
    const out = drawNativeBlocks(`[choices]\n${body}\n[/choices]`)
    expect((out.match(/class="lt-choice"/g) || []).length).toBe(8)
  })
})
