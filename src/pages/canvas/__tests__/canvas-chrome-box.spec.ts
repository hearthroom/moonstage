// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import { render, generate, OUTPUT, MESSAGE_LAYER } from '../../../../scripts/gen-canvas-chrome-box.mjs'

/**
 * 殼的 margin／padding 在 @layer 外要有一份副本。
 *
 * 症狀（2026-09-16，一張「精致美化」MMD 卡）：卡片開頭 `* { margin: 0; padding: 0 }`，
 * 在 MMD 只清作者自己的內容，到我們這裡把殼裡 142 條內距全清掉——快捷鍵的圖示擠到邊框上、
 * 輸入區貼邊、模型面板每一列黏死。根因：整份 canvas.css 在 @layer 裡，不分層的 `*` 永遠贏。
 */
const generated = fs.readFileSync(OUTPUT, 'utf8')

describe('canvas-chrome-box.css', () => {
  it('跟產生器的輸出一致（改了 canvas.css 的殼內距要重跑 node scripts/gen-canvas-chrome-box.mjs）', () => {
    expect(generated).toBe(render())
  })

  it('全部在 @layer 外：快捷鍵、輸入區、＋面板、彈層的內距都在，數值跟層內一樣', () => {
    const root = postcss.parse(generated)
    root.walkAtRules('layer', () => { throw new Error('副本裡不該有 @layer') })
    const find = (sel: string, prop: string) => {
      const hits: string[] = []
      root.walkRules((r) => { if (r.selectors.includes(sel)) r.walkDecls(prop, (d) => hits.push(d.value)) })
      return hits
    }
    expect(find('.shortcut-btn', 'padding')).toContain('4px 12px')
    expect(find('.shortcut-bar', 'padding')).toContain('8px 12px 0')
    expect(find('.send-msg', 'padding')).toContain('8px 12px 12px')
    expect(find('.more-scope', 'margin')).toContain('0 auto')
    expect(find('.more-scope .item', 'padding')).toContain('8px 4px')
    expect(find('.u-popup__content', 'padding')).toContain('16px')
    expect(find('.ai-assistant .beta-badge', 'padding')).toContain('0 4px')
  })

  it('訊息層不搬：作者對氣泡裡 p／img 的重置本來就該贏', () => {
    const root = postcss.parse(generated)
    root.walkRules((r) => {
      for (const s of r.selectors) {
        if (s === '#chat') continue // 對話欄本身的內距是平台的欄邊距與側欄讓位，見下一條
        expect(s, s).not.toMatch(MESSAGE_LAYER)
        expect(s).not.toMatch(/\.mes_text|\.mes\b|#chat\b/)
      }
    })
  })

  /*
    症狀（2026-11-03，卡 100479，Android 手機）：卡的圖鑑規則開頭一條 `*{margin:0;padding:0}`，
    把 #chat 的左右內距清成 0——正文貼螢幕邊，平台已經算好的側欄讓位（--lt-canvas-dock-*）也套不上，
    作者畫在兩側的浮動鈕整排壓在字上。#chat 的內距是欄邊距加側欄讓位，屬於平台的保護，不是作者內容；
    它底下的訊息仍是訊息層，不搬。只搬單獨的 `#chat`：ID 特異性贏過 `*`，作者自己寫 `#chat{…}`
    插得比我們晚，照樣贏。
  */
  it('對話欄 #chat 本身的內距在層外：桌機與手機斷點都帶側欄讓位，後代選擇器不搬', () => {
    const root = postcss.parse(generated)
    const desktop: string[] = []
    const phone: string[] = []
    root.walkRules((r) => {
      if (!r.selectors.includes('#chat')) {
        for (const s of r.selectors) expect(s, s).not.toMatch(/#chat\b/)
        return
      }
      expect(r.selectors, '#chat 不跟別的選擇器並列出層').toEqual(['#chat'])
      const inPhone = r.parent?.type === 'atrule' && /max-width:\s*768px/.test((r.parent as postcss.AtRule).params)
      r.walkDecls('padding', (d) => (inPhone ? phone : desktop).push(d.value))
    })
    expect(desktop).toEqual(['12px max(12px, var(--lt-canvas-dock-right, 0px)) var(--lt-chat-pad-bottom) max(12px, var(--lt-canvas-dock-left, 0px))'])
    expect(phone).toEqual(['10px max(10px, var(--lt-canvas-dock-right, 0px)) var(--lt-chat-pad-bottom) max(10px, var(--lt-canvas-dock-left, 0px))'])
  })

  it('只搬 margin／padding，別的屬性不跟著出層（#chat 另帶 box-sizing）', () => {
    const root = postcss.parse(generated)
    root.walkDecls((d) => {
      if ((d.parent as postcss.Rule).selector === '#chat' && d.prop === 'box-sizing') return
      expect(d.prop, d.prop).toMatch(/^(margin|padding)/)
    })
  })

  it('產生器只放行單獨的 #chat：後代、偽類、並列訊息層的選擇器都留在層內', () => {
    const out = generate(`@layer x {
      #chat { padding: 1px; box-sizing: border-box; color: red }
      #chat .mes { padding: 2px; box-sizing: border-box }
      #chat, .mes { padding: 3px }
      #chat:hover { padding: 4px }
      #chat-input-scope { padding: 5px }
      .shortcut-btn { padding: 6px; box-sizing: border-box }
    }`)
    const root = postcss.parse(out)
    const rules: string[] = []
    root.walkRules((r) => { rules.push(`${r.selector} { ${r.nodes.map((d) => (d as postcss.Declaration).prop + ':' + (d as postcss.Declaration).value).join('; ')} }`) })
    expect(rules).toEqual(['#chat { padding:1px; box-sizing:border-box }', '.shortcut-btn { padding:6px }'])
  })

  it('保留 @media 包裹：手機版的內距差異照舊', () => {
    expect(generated).toMatch(/@media[^{]*\{\s*\n\s*\.send-msg \{/)
  })

  it('canvas.vue 在 canvas.css 之後載入副本（後宣告才蓋得住層內的同名規則以外的東西）', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')
    expect(src.indexOf("import './canvas-chrome-box.css'")).toBeGreaterThan(src.indexOf("import './canvas.css'"))
  })
})
