/**
 * 彈層的字色與底色要認 MMD 卡片的兩個變數。
 *
 * MMD 的卡片把彈層底色寫成 `--background-color`、字色寫成 `--primary-font-color`（常見寫法：
 * `.chat, .u-popup__content, body { --background-color: var(--l-bg); --primary-font-color: var(--l-text) }`，
 * 底色再用 !important 蓋上）。舞台原本只認自己的 sheet token：卡片把彈層塗成深色、字卻仍是站台亮色模式的
 * 深色字（owner 2026-09-08 截圖：模型設定整片字幾乎看不見）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')

describe('彈層認 MMD 的顏色變數', () => {
  it('字色 token 先看卡片的 --primary-font-color，沒有才用 currentColor', () => {
    expect(css).toMatch(/--lt-canvas-sheet-fg:\s*var\(--primary-font-color,\s*currentColor\);/)
  })

  it('底色先看卡片的 --background-color，沒有才用站台的 sheet 底色', () => {
    expect(css).toMatch(/\.u-popup__content \{[^}]*background:\s*var\(--background-color,\s*var\(--lt-canvas-sheet-bg\)\);/)
  })
})
