/**
 * {{random}} 的種子跟著「這一則訊息」走。
 *
 * 新對話的開場白在畫布上的 id 一律是 0，以前直接拿 id 當種子：每一段新對話的開場白都抽到
 * 同一張隨機圖（2026-11-04 卡 100256，開場白裡的隨機 CG 每次都一樣）。沙箱卡的訊息也是這一頁算好
 * 送進殼的，同一個問題。宿主的 HTML 快取同樣按 id 記，換新對話時會直接拿上一段的開場白畫面。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRandomSeeds, renderCacheKey } from '../canvas-random-seed'

describe('createRandomSeeds', () => {
  it('兩段新對話的開場白（id 0）：種子不同；同一則重畫時不變', () => {
    let n = 0
    const seedFor = createRandomSeeds(() => `salt${++n}`)
    const openingA = { id: 0 }
    const openingB = { id: 0 }
    expect(seedFor(openingA)).not.toBe(seedFor(openingB))
    expect(seedFor(openingA)).toBe(seedFor(openingA))
  })

  it('有自己 id 的訊息用它的 id：重整後（新物件、同 id）種子相同', () => {
    const seedFor = createRandomSeeds()
    expect(seedFor({ id: 9001 })).toBe('9001')
    expect(createRandomSeeds()({ id: 9001 })).toBe('9001')
  })

  it('種子第一次決定後記在那個物件上：之後物件上的欄位怎麼變都不重抽', () => {
    const seedFor = createRandomSeeds()
    const live: { id: number | string } = { id: 1793700000001 }
    const first = seedFor(live)
    live.id = '9002'
    expect(seedFor(live)).toBe(first)
  })
})

describe('renderCacheKey', () => {
  it('開場白按種子記（兩段新對話不共用畫面）；有 id 的照 id', () => {
    const seedFor = createRandomSeeds()
    expect(renderCacheKey({ id: 0 }, seedFor)).not.toBe(renderCacheKey({ id: 0 }, seedFor))
    expect(renderCacheKey({ id: 9001 }, seedFor)).toBe('9001')
  })
})

describe('畫布接線', () => {
  const source = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')

  it('renderMessage 用 randomSeedFor 當 {{random}} 的種子，不是 item.id', () => {
    expect(source).toMatch(/authorRules\.seed = randomSeedFor\(item\);/)
    expect(source).not.toMatch(/authorRules\.seed = item\.id != null \? String\(item\.id\)/)
  })

  it('沙箱卡的 HTML 快取：開場白按這一則的種子記，不是按 id 0', () => {
    const start = source.indexOf('function hudMessageHtml(item: any): string {')
    const body = source.slice(start, source.indexOf('\n}\n', start))
    expect(body).toMatch(/const key = hudCacheKey\(item\);/)
  })
})
