/**
 * 舞台背景的裁切與選圖。
 *
 * 之前照 MMD 用 `auto 100%` + `repeat`：寬螢幕上同一張圖橫向重複三次（owner 2026-09-15
 * 截圖），不是沉浸而是穿幫。改成 cover 貼滿裁邊，創作者照「安全區」慣例（重要元素放
 * 中央 75%×75%）構圖，9:21～21:9 的螢幕都只裁到邊緣。
 *
 * 背景分直、橫兩張（橫式選填）。哪張上場由螢幕方向決定：CSS media query 選
 * `--lt-bg-landscape`，沒有橫圖就退回 `--lt-bg-portrait`。元件只寫兩個變數，
 * 不再 inline 寫 background-image，作者的卡片 CSS 蓋 `.chat-scope-box` 就不必跟
 * inline 樣式比特異性。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import CanvasStage from '../components/canvas-stage.vue'

const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')
const rule = (() => {
  const i = css.indexOf('.chat-scope-box {')
  return i === -1 ? '' : css.slice(i, css.indexOf('}', i))
})()

describe('.chat-scope-box 背景裁切', () => {
  it('cover 貼滿裁邊，不再貼合高度', () => {
    expect(rule).toMatch(/background-size:\s*cover/)
    expect(rule).not.toMatch(/auto 100%/)
  })

  it('置中', () => {
    expect(rule).toMatch(/background-position:\s*center center/)
  })

  it('不重複：寬螢幕靠裁切填滿，不靠平鋪', () => {
    expect(rule).toMatch(/background-repeat:\s*no-repeat/)
  })

  it('直圖走 --lt-bg-portrait 變數', () => {
    expect(rule).toMatch(/background-image:\s*var\(--lt-bg-portrait\)/)
  })

  it('橫向螢幕改用 --lt-bg-landscape，沒有就退回直圖', () => {
    const i = css.indexOf('@media (orientation: landscape)')
    expect(i).toBeGreaterThan(-1)
    const block = css.slice(i, css.indexOf('}', css.indexOf('.chat-scope-box', i)))
    expect(block).toMatch(/background-image:\s*var\(--lt-bg-landscape,\s*var\(--lt-bg-portrait\)\)/)
  })
})

// 網址加引號並轉義（2026-10-18 起）：網址裡的引號或括號不會截斷 url()。
const card = (portrait: string, landscape = '') => ({ mode: 'card' as const, portrait, landscape, color: '' })

describe('CanvasStage 只寫變數', () => {
  it('兩張都給：兩個變數都寫，且不 inline 寫 background-image', () => {
    const w = mount(CanvasStage, { props: { background: card('https://cdn/p.jpg', 'https://cdn/l.jpg') } })
    const style = (w.find('.chat-scope-box').element as HTMLElement).style
    expect(style.getPropertyValue('--lt-bg-portrait')).toBe('url("https://cdn/p.jpg")')
    expect(style.getPropertyValue('--lt-bg-landscape')).toBe('url("https://cdn/l.jpg")')
    expect(style.backgroundImage).toBe('')
  })

  it('只有直圖：不寫橫圖變數，讓 CSS 退回直圖', () => {
    const w = mount(CanvasStage, { props: { background: card('https://cdn/p.jpg') } })
    const style = (w.find('.chat-scope-box').element as HTMLElement).style
    expect(style.getPropertyValue('--lt-bg-portrait')).toBe('url("https://cdn/p.jpg")')
    expect(style.getPropertyValue('--lt-bg-landscape')).toBe('')
  })

  it('沒有背景：什麼都不寫，作者 CSS 的預設值才有效', () => {
    const w = mount(CanvasStage, { props: { background: card('') } })
    expect((w.find('.chat-scope-box').element as HTMLElement).getAttribute('style')).toBeFalsy()
  })

  it('卡片原圖：沒有玩家背景層，也沒有覆蓋標記', () => {
    const w = mount(CanvasStage, { props: { background: card('https://cdn/p.jpg') } })
    expect(w.find('.lt-stage-bg').exists()).toBe(false)
    expect(w.find('.chat-scope-box').attributes('data-lt-player-bg')).toBeUndefined()
  })
})

describe('CanvasStage 玩家自選背景', () => {
  it('模糊：圖畫在獨立的一層，不畫在 #bg1（不然訊息會一起糊）', () => {
    const w = mount(CanvasStage, { props: { background: { mode: 'blur', portrait: 'https://cdn/p.jpg', landscape: '', color: '#16191E' } } })
    const root = w.find('.chat-scope-box')
    expect(root.attributes('data-lt-player-bg')).toBe('blur')
    expect((root.element as HTMLElement).getAttribute('style')).toBeFalsy()
    const layer = w.find('.lt-stage-bg')
    expect(layer.classes()).toContain('is-blur')
    expect((layer.element as HTMLElement).style.getPropertyValue('--lt-player-bg-portrait')).toBe('url("https://cdn/p.jpg")')
    // 訊息不在背景層裡
    expect(layer.find('#scrollview').exists()).toBe(false)
  })

  it('淺色色票才標淺色底；深色色票、模糊、自訂不標', () => {
    const tone = (bg: any) => mount(CanvasStage, { props: { background: bg } }).find('.chat-scope-box').attributes('data-lt-player-tone')
    expect(tone({ mode: 'color', portrait: '', landscape: '', color: '#F2F3F5' })).toBe('light')
    expect(tone({ mode: 'color', portrait: '', landscape: '', color: '#E8E2D9' })).toBe('light')
    expect(tone({ mode: 'color', portrait: '', landscape: '', color: '#16191E' })).toBeUndefined()
    expect(tone({ mode: 'blur', portrait: 'https://cdn/p.jpg', landscape: '', color: '#16191E' })).toBeUndefined()
  })

  it('偏好還沒回來：標成 pending，作者 CSS 的背景圖也先不畫，第一幀不露原圖', () => {
    const w = mount(CanvasStage, { props: { background: { mode: 'card', pending: true, portrait: '', landscape: '', color: '' } } })
    expect(w.find('.chat-scope-box').attributes('data-lt-player-bg')).toBe('pending')
  })

  it('純色：只有底色，沒有圖', () => {
    const w = mount(CanvasStage, { props: { background: { mode: 'color', portrait: '', landscape: '', color: '#2A1A1F' } } })
    const style = (w.find('.lt-stage-bg').element as HTMLElement).style
    expect(style.getPropertyValue('--lt-player-bg-color')).toBe('#2A1A1F')
    expect(style.getPropertyValue('--lt-player-bg-portrait')).toBe('')
  })
})

describe('玩家背景的覆蓋規則（canvas-player-background.css）', () => {
  const player = readFileSync(resolve(__dirname, '../canvas-player-background.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  it('整份在自己的 layer 裡：layer 內的 !important 才贏得過作者沒分層的 !important', () => {
    expect(player.trim().startsWith('@layer lt-player-bg')).toBe(true)
  })

  it('每一條關掉背景圖的規則都掛在玩家標記底下：卡片原圖時一條都不生效', () => {
    const selectors = player.slice(player.indexOf('{') + 1).split('{')[0]
    for (const sel of selectors.split(',')) expect(sel).toMatch(/data-lt-player-bg/)
  })

  it('模糊加在背景層容器上，以長邊算（橫式螢幕也夠糊）', () => {
    const rule = player.slice(player.indexOf('.lt-stage-bg.is-blur'))
    expect(rule).toMatch(/--lt-player-blur:\s*max\(40px,\s*5vmax\)/)
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/filter:\s*blur\(var\(--lt-player-blur\)\)/)
  })

  it('模糊與自訂：平台控制項加淡陰影、重新生成墊深底；純色不加', () => {
    // 重新生成、名字、⋯ 同一條規則：不透明淺字墊半透明深底
    const backed = player.slice(player.lastIndexOf(':is([data-lt-player-bg=blur], [data-lt-player-bg=custom]) .lt-msg-regen,'))
    expect(backed.slice(0, backed.indexOf('}'))).toMatch(/\.ch_name \.name_text[\s\S]*\.extraMesButtonsHint[\s\S]*background-color:\s*rgba\(15, 18, 23/)
    expect(player).toMatch(/text-shadow:\s*0 1px 2px rgba\(15, 18, 23, 0\.55\)/)
    expect(player).not.toMatch(/\[data-lt-player-bg=color\][^{]*\{[^}]*text-shadow/)
  })

  it('淺色色票：氣泡外的平台控制項改深色字', () => {
    expect(player).toMatch(/\[data-lt-player-tone=light\] \.lt-msg-regen/)
  })

  it('canvas.vue 與殼都載入這一份', () => {
    expect(readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')).toContain("import './canvas-player-background.css'")
    expect(readFileSync(resolve(__dirname, '../../../sandbox/shell.ts'), 'utf8')).toContain("import '@/pages/canvas/canvas-player-background.css'")
  })
})

// 橫圖曾經算好了卻沒交給舞台（2026-09-15 起，作者上傳的橫式背景在橫屏上從沒出現過）。
// canvas.vue 太大不好掛載，這裡看兩處交接點：一般卡的舞台、沙箱卡交給殼的設定。
describe('canvas.vue 把背景交出去', () => {
  const vue = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')

  it('一般卡：舞台拿到解析好的背景（含橫圖）', () => {
    const tag = vue.slice(vue.indexOf('<CanvasStage'), vue.indexOf('>', vue.indexOf('<CanvasStage')))
    expect(tag).toMatch(/:background="stageBackground"/)
  })

  it('沙箱卡：交給殼的設定帶背景，之後變了再推', () => {
    expect(vue).toMatch(/background:\s*\{ \.\.\.stageBackground\.value \}/)
    expect(vue).toMatch(/host\.postBackground\(/)
  })
})
