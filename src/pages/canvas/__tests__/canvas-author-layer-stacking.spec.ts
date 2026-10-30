// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createAuthorAssetRuntime, CONTAINER_ATTR } from '../../../utils/author-asset-mount.js'
import { LAYER_Z_INDEX } from '../../../utils/author-asset-mount.fixtures.js'

/**
 * 作者層要跟輸入區在同一個 stacking context 裡，「降低層級」才真的在輸入框之下。
 *
 * 2026-09-11 社群站用戶：功能欄勾了「降低層級」，手機上打開工具抽屜、輸入區上移之後，
 * 作者的側邊欄分頁照樣蓋在輸入框上、吃掉點擊。量到的原因：容器掛在 body，畫布根
 * （position: fixed，z auto）自己是一個 stacking context，輸入區的 z20 只在裡面算數；
 * body 上的 under 層 z12 跟整個畫布比，永遠在上面。
 */
describe('作者層掛進畫布根節點', () => {
  it('canvas.vue 建 runtime 時把 .canvas-root 當容器掛載點', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')
    const at = src.indexOf('authorAssetRuntime = createAuthorAssetRuntime({')
    expect(at).toBeGreaterThan(0)
    const block = src.slice(at, src.indexOf('});', at))
    expect(block).toMatch(/root:\s*\(document\.querySelector\('\.canvas-root'\)/)
  })

  it('runtime 照 root 選項掛容器，三層都在畫布根之下、不在 body 直屬', () => {
    document.body.innerHTML = '<div class="canvas-root"><div class="composer-scope"></div></div>'
    const root = document.querySelector('.canvas-root') as HTMLElement
    const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.mobile, root })
    for (const layer of ['under', 'over', 'cover'] as const) {
      const el = rt.mount({ mountLayer: layer, html: '<div class="x"></div>' })
      const container = el.closest(`[${CONTAINER_ATTR}]`) as HTMLElement
      expect(container.parentElement).toBe(root)
      expect(Number(container.style.zIndex)).toBe(LAYER_Z_INDEX.mobile[layer])
    }
    // under 的 z 低於輸入區的 20、over 高於它：同一把尺才比得出來
    expect(LAYER_Z_INDEX.mobile.under).toBeLessThan(20)
    expect(LAYER_Z_INDEX.mobile.over).toBeGreaterThan(20)
    rt.dispose()
    expect(document.querySelectorAll(`[${CONTAINER_ATTR}]`).length).toBe(0)
  })
})

/**
 * over 層要嚴格高於宿主頂欄。
 *
 * 作者容器和頂欄（.page-header-scope）是畫布根節點裡的兄弟。數字相同時由 DOM 順序決定：
 * 容器原本 append 在最後、同分時贏；2026-10-27 為了讓常駐美化的 :root 變數先於訊息主題
 * 落地，改成插到最前面，同分就輸了——作者畫在頁面頂端的導覽列整條被頂欄蓋住
 * （2026-10-30 作者回報「上面的側邊欄沒出來」，手機與桌機都一樣）。
 */
describe('作者 over 層與宿主頂欄', () => {
  const vue = fs.readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')
  const css = fs.readFileSync(path.resolve(__dirname, '../canvas.css'), 'utf8')
  const ruleZ = (selector: string): number => {
    const idx = css.indexOf(`\n  ${selector} {`)
    expect(idx, `canvas.css 缺 ${selector}`).toBeGreaterThan(-1)
    const m = css.slice(idx, css.indexOf('}', idx)).match(/z-index:\s*(\d+)/)
    expect(m, `${selector} 沒有 z-index`).toBeTruthy()
    return Number(m![1])
  }

  it('canvas.vue 的 over 高於頂欄、under 低於輸入區', () => {
    const m = vue.match(/const AUTHOR_LAYER_Z_INDEX = \{ under: (\d+), over: (\d+), cover: (\d+) \}/)
    expect(m, 'canvas.vue 缺 AUTHOR_LAYER_Z_INDEX').toBeTruthy()
    expect(Number(m![2])).toBeGreaterThan(ruleZ('.page-header-scope'))
    expect(Number(m![1])).toBeLessThan(ruleZ('.composer-scope'))
  })
})
