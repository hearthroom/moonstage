/**
 * 舞台背景的裁切方式照 MMD。
 *
 * MMD 的背景層綁的是
 *   background: url(…) center center / auto 100%
 * 簡寫沒有指定 repeat，所以 repeat 回到初始值 `repeat`——寬螢幕上那張圖會橫向鋪滿
 * （owner 的 MMD 截圖裡角色圖重複了三次，就是這個）。
 *
 * 我們原本是 `cover` + `no-repeat`：貼滿並裁掉兩側，同一張卡在兩邊看到的構圖不同。
 * 卡片的美化是照對方那個構圖調的，所以這裡跟著對齊。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')
const rule = (() => {
  const i = css.indexOf('.chat-scope-box {')
  return i === -1 ? '' : css.slice(i, css.indexOf('}', i))
})()

describe('.chat-scope-box 的背景取值與 MMD 一致', () => {
  it('貼合高度而不是裁切填滿', () => {
    expect(rule).toMatch(/background-size:\s*auto 100%/)
    expect(rule).not.toMatch(/background-size:\s*cover/)
  })

  it('置中', () => {
    expect(rule).toMatch(/background-position:\s*center center/)
  })

  it('橫向鋪滿：MMD 的簡寫把 repeat 留在初始值，寬螢幕靠它填滿兩側', () => {
    expect(rule).toMatch(/background-repeat:\s*repeat/)
    expect(rule).not.toMatch(/background-repeat:\s*no-repeat/)
  })
})
