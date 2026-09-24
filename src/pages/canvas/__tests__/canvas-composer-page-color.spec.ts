/**
 * 作者只畫整頁時，快捷列與輸入區要跟頁面連成一片。
 *
 * 由來（owner 2026-09-25）：卡片在 .chat 上鋪了半透明紫色漸層、宣告了 --background-color，
 * 沒畫快捷列與輸入區。我們的深色蓋在兩塊上、中間 8px 露出作者的紫，底部成了深／紫／深三截。
 * 改讀 --background-color 再鋪一次仍對不上（半透明疊兩層、每塊漸層重新起算），只有透明才是同一片。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const vars = readFileSync(resolve(__dirname, '../../../common/canvas-theme-vars.css'), 'utf8')
const vue = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')

describe('宣告了頁面色的卡，快捷列與輸入區透出頁面', () => {
  it('沒宣告時仍是我們的深色底', () => {
    expect(vars).toMatch(/--lt-canvas-composer-bg:\s*rgba\(15, 18, 23, 0\.82\);/)
  })

  it('掛上 data-lt-page-color 時改成透明，鎖暗色的畫布根也一樣', () => {
    const block = vars.match(/\.canvas-root\[data-lt-page-color\],\s*\.canvas-root\.lt-theme-dark\[data-lt-page-color\]\s*\{([^}]*)\}/)
    expect(block).not.toBeNull()
    expect(block![1]).toMatch(/--lt-canvas-composer-bg:\s*transparent;/)
  })

  it('旗標寫在鎖暗色的預設區塊之後（同檔、layer 外，順序與特異性都贏）', () => {
    expect(vars.indexOf('[data-lt-page-color]')).toBeGreaterThan(vars.indexOf('.canvas-root.lt-theme-dark {'))
  })

  it('syncCardTheme 依 --background-color 掛上或拿掉旗標，用屬性而非 class', () => {
    const start = vue.indexOf('function syncCardTheme()')
    const body = vue.slice(start, vue.indexOf('\n}\n', start))
    expect(body).toMatch(/getPropertyValue\('--background-color'\)\.trim\(\)\)\s*root\.setAttribute\('data-lt-page-color', ''\)/)
    expect(body).toMatch(/else root\.removeAttribute\('data-lt-page-color'\)/)
  })
})

describe('畫布根換 class 時重量', () => {
  it('卡片主題的觀察者只聽畫布根的 class（不聽自己寫的 style／data-*）', () => {
    const start = vue.indexOf('function observeCardTheme()')
    const body = vue.slice(start, vue.indexOf('\n}\n', start))
    expect(body).toMatch(/querySelector\('\.canvas-root'\)[\s\S]*observe\(root, \{ attributes: true, attributeFilter: \['class'\] \}\)/)
  })
})
