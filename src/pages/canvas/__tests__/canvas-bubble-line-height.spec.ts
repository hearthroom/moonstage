/**
 * 作者沒替正文寫行高時，預設行高要撐得起中文長段落。
 *
 * 由來（owner 2026-09-27）：一張只美化了部分輸出的卡，其餘回覆落回預設排版，
 * 手機上讀起來很吃力。預設行高是 normal，中文系統字體下約 1.2–1.35 倍，
 * 行距跟字距差不多寬，眼睛跟不住一行。有美化的卡正文行高多落在 1.7–1.8。
 *
 * 行高只加在氣泡上：頁首、輸入區、面板仍用頁面的行高。
 * 沙箱卡的殼只帶 canvas.css、不帶變數檔，所以 var() 必須自帶同一個值。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const vars = strip(readFileSync(resolve(__dirname, '../../../common/canvas-theme-vars.css'), 'utf8'))
const css = strip(readFileSync(resolve(__dirname, '../canvas.css'), 'utf8'))

describe('預設氣泡正文行高', () => {
  it('變數有明確的數值，且不低於 1.6', () => {
    const m = vars.match(/--lt-canvas-bubble-line-height:\s*([^;]+);/)
    expect(m, '--lt-canvas-bubble-line-height 必須宣告').toBeTruthy()
    expect(Number(m![1].trim())).toBeGreaterThanOrEqual(1.6)
  })

  it('氣泡用這個變數，並自帶同一個值給沙箱殼', () => {
    const declared = vars.match(/--lt-canvas-bubble-line-height:\s*([^;]+);/)![1].trim()
    const rule = css.match(/\n\s*\.mes_text\s*\{([^}]*)\}/)
    expect(rule, '.mes_text 規則必須存在').toBeTruthy()
    expect(rule![1]).toContain(`line-height: var(--lt-canvas-bubble-line-height, ${declared})`)
  })

  it('頁面本身的行高不跟著放大', () => {
    expect(vars).toMatch(/--lt-canvas-line-height:\s*normal;/)
  })
})
