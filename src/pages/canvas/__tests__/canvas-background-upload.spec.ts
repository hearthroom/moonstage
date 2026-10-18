import { describe, it, expect } from 'vitest'
import { checkBackgroundFile, fitWithin } from '../canvas-background-upload'
import { CUSTOM_BACKGROUND_LIMIT } from '../canvas-player-background'

describe('checkBackgroundFile', () => {
  it('收 JPG、PNG、WebP', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(checkBackgroundFile({ type, size: 1000 }, CUSTOM_BACKGROUND_LIMIT)).toBeNull()
  })

  it('GIF、SVG 與其他格式不收', () => {
    for (const type of ['image/gif', 'image/svg+xml', 'image/heic', '', 'text/html']) expect(checkBackgroundFile({ type, size: 1000 }, CUSTOM_BACKGROUND_LIMIT)).toBe('format')
  })

  it('超過 20 MB 不收，剛好 20 MB 收', () => {
    expect(checkBackgroundFile({ type: 'image/png', size: 20 * 1024 * 1024 }, CUSTOM_BACKGROUND_LIMIT)).toBeNull()
    expect(checkBackgroundFile({ type: 'image/png', size: 20 * 1024 * 1024 + 1 }, CUSTOM_BACKGROUND_LIMIT)).toBe('size')
  })

  it('空檔案當大小不對', () => {
    expect(checkBackgroundFile({ type: 'image/png', size: 0 }, CUSTOM_BACKGROUND_LIMIT)).toBe('size')
  })
})

describe('fitWithin', () => {
  it('長邊縮到上限、等比', () => {
    expect(fitWithin(4032, 3024, 2560)).toEqual({ width: 2560, height: 1920 })
    expect(fitWithin(1080, 5000, 2560)).toEqual({ width: 553, height: 2560 })
  })

  it('小圖不放大', () => {
    expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 })
  })
})
