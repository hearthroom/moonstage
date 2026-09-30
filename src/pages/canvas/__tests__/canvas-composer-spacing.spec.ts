/**
 * 輸入區兩個小細節（owner 2026-09-05）：
 * 1. 快捷列與輸入框之間的 8px 是輸入區的上內距，不是 margin：容器透明，margin 會露出
 *    卡片背景，在兩塊底色中間切出一條縫（owner 2026-09-30）。
 * 2. 收起（單行）時幫答鍵跟那一行字垂直置中，不是貼底。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')

describe('輸入區的間距與對齊', () => {
  it('快捷列與輸入區之間沒有透明的 margin，間距是輸入區的上內距', () => {
    expect(css).not.toMatch(/\.shortcut-bar-wrapper \{[^}]*margin-bottom/)
    expect(css).not.toMatch(/\.chat-bottom-wapper \{[^}]*margin-top/)
    expect(css).toMatch(/\.chat-bottom-wapper \{\s*padding-top: 8px;\s*\}/)
    // 殼的內距也要在 layer 外再宣告一次，卡片的 `* { padding: 0 }` 才清不掉。
    const box = readFileSync(resolve(__dirname, '../canvas-chrome-box.css'), 'utf8')
    expect(box).toMatch(/\.chat-bottom-wapper \{\s*padding-top: 8px\s*\}/)
  })

  it('沙箱殼跟一般卡載入同一份 layer 外內距，而且排在 canvas.css 之後', () => {
    const shell = readFileSync(resolve(__dirname, '../../../sandbox/shell.ts'), 'utf8')
    const base = shell.indexOf("import '@/pages/canvas/canvas.css'")
    const box = shell.indexOf("import '@/pages/canvas/canvas-chrome-box.css'")
    expect(base).toBeGreaterThan(-1)
    expect(box).toBeGreaterThan(base)
  })

  it('收起時 .send-msg 置中對齊，展開才貼底', () => {
    expect(css).toMatch(/\.send-msg:not\(:has\(\.uni-textarea\.is-expanded\)\) \{\s*align-items: center;/)
    const start = css.indexOf('  .ai-assistant {')
    const body = css.slice(start, css.indexOf('}', start))
    expect(body).not.toMatch(/margin-bottom/)
  })
})

describe('手機收起態一列的對齊', () => {
  it('文字列置中，只有留著多行草稿時才貼底', () => {
    expect(css).toMatch(/\.chat-input-collapsed-row \{\s*align-items: center;\s*\}\s*\n\s*\.chat-input-scope:has\(\.chat-input-collapsed-text\) \.chat-input-collapsed-row \{\s*align-items: flex-end;/)
  })
})
