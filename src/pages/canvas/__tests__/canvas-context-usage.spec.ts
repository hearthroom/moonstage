/**
 * 小圓環的等級：full 從伺服器回的濃縮線開始，跟較早劇情開始濃縮的那一刻同一刻。
 */
import { describe, it, expect } from 'vitest'
import { contextUsageLevel } from '../canvas-context-usage'

describe('上下文用量等級', () => {
  it('到了伺服器回的濃縮線就是 full，線以下按 45／75 分三級', () => {
    expect(contextUsageLevel(10, 92)).toBe('low')
    expect(contextUsageLevel(45, 92)).toBe('mid')
    expect(contextUsageLevel(75, 92)).toBe('high')
    expect(contextUsageLevel(91, 92)).toBe('high')
    expect(contextUsageLevel(92, 92)).toBe('full')
  })

  it('濃縮線跟著伺服器走，不寫死 92', () => {
    expect(contextUsageLevel(80, 80)).toBe('full')
  })
})
