/**
 * 預設氣泡底要撐得住複雜的背景圖。
 *
 * 由來（owner 2026-09-24）：一張鎖暗色的卡鋪滿了多角色插圖，玩家沒美化氣泡時，
 * 預設的白色 5%／9% 半透明底等於沒有底——淺色字直接壓在插圖的白色羽毛、亮面上，
 * 整段看不清。白色半透明不管調到多少都救不了亮區，只能換成深色的底。
 *
 * 量法：最糟的情形是氣泡正好蓋在純白的圖上。把預設底色疊在白底上，
 * 預設字色對它的對比要到正文可讀的 4.5:1。作者自己設了氣泡底，走的是他的值，不在此列。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../../common/canvas-theme-vars.css'), 'utf8')
const FG = [0xe8, 0xea, 0xed]

function declValue(name: string): string {
  const m = css.match(new RegExp(`\\${name}:\\s*([^;]+);`))
  if (!m) throw new Error(`${name} not declared`)
  return m[1].trim()
}

function parseRgba(value: string): [number, number, number, number] {
  const m = value.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/)
  if (!m) throw new Error(`expected a plain rgba() default, got ${value}`)
  return [+m[1], +m[2], +m[3], +m[4]]
}

function luminance([r, g, b]: number[]): number {
  const f = (x: number) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrastOnWhite(bg: [number, number, number, number]): number {
  const a = bg[3]
  const composed = [0, 1, 2].map((i) => bg[i] * a + 255 * (1 - a))
  const hi = Math.max(luminance(FG), luminance(composed))
  const lo = Math.min(luminance(FG), luminance(composed))
  return (hi + 0.05) / (lo + 0.05)
}

describe('預設氣泡底在亮色插圖上仍可讀', () => {
  for (const name of ['--lt-canvas-bubble-ai-bg', '--lt-canvas-bubble-user-bg']) {
    it(`${name} 疊在純白上，預設字色對比 ≥ 4.5`, () => {
      expect(contrastOnWhite(parseRgba(declValue(name)))).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('兩種氣泡仍分得出來', () => {
    expect(declValue('--lt-canvas-bubble-ai-bg')).not.toBe(declValue('--lt-canvas-bubble-user-bg'))
  })
})
