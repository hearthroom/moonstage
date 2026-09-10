/**
 * 輸入區的軸向落差。
 *
 * MMD 的 `.chat-input-scope` 是橫的（輸入框與送出鍵並排），我們是直的（工具列／
 * 輸入框／底列疊三層）。同一個節點名、不同的軸——卡片寫 `align-items:center`
 * 在對方是「垂直置中」，落到我們的縱向容器上變成「水平置中」，於是貼上／清空
 * 那排跟底下的點數與送出鍵被縮成內容寬度、擠在正中間（owner 2026-09-10 截圖；
 * 靜態複現量到那兩排從 782px 縮成 95px）。
 *
 * 不改軸向（那是整個輸入區的重寫），改成讓那兩排自己宣告要撐滿：子元素的
 * align-self 贏得過父層的 align-items，兩者是不同元素上的不同屬性，layer 不介入。
 * 作者真想改，直接對這兩排寫 align-self 仍然蓋得掉。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')

/** 這個名字出現在哪幾條規則裡（同一個名字可能被分組寫、也可能在斷點裡另寫一條）。 */
function rulesMentioning(selector: string): string[] {
  const out: string[] = []
  const re = new RegExp(`\\${selector}(?![\\w-])[^{}]*\\{([^}]*)\\}`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) out.push(m[1])
  return out
}

function ruleOf(selector: string): string {
  const i = css.indexOf(selector + ' {')
  if (i === -1) return ''
  return css.slice(i, css.indexOf('}', i))
}

describe('疊起來的三層不受卡片的 align-items 影響', () => {
  for (const sel of ['.chat-input-toolbar', '.chat-input-bottom-row', '.chat-input-collapsed-row']) {
    it(`${sel} 自己宣告撐滿`, () => {
      expect(rulesMentioning(sel).some((b) => /align-self:\s*stretch/.test(b))).toBe(true)
    })
  }
})

/**
 * 快捷鍵的高度。MMD 給 `.shortcut-btn` 釘死 height:1.75rem 且 box-sizing:border-box，
 * 所以卡片寫的 padding 被吸收進那個高度。我們沒有高度，同一份 padding 就把鍵撐大
 * （實測 27px → 38px）。
 */
describe('快捷鍵的高度照 MMD 釘死', () => {
  const rule = ruleOf('.shortcut-btn')

  it('有固定高度 28px', () => {
    expect(rule).toMatch(/height:\s*28px/)
  })

  it('border-box，卡片的 padding 才會被吸收而不是往外撐', () => {
    expect(rule).toMatch(/box-sizing:\s*border-box/)
  })
})

/**
 * 快捷鍵的圖示。MMD 每顆鍵是「圖示 + 文字」，圖示 .8125rem、opacity .9。
 * 我們的 .sb-icon 一直是個空 span，於是同一排在對方有圖、在我們只有字。
 * 節點形狀跟面板圖示同一套（uni-image 裡一個帶 background-image 的 div），
 * 卡片那條 filter 換色才打得中。
 */
describe('快捷鍵有圖示', () => {
  const vue = readFileSync(resolve(__dirname, '../components/canvas-composer.vue'), 'utf8')

  it('.sb-icon 不再是空 span', () => {
    expect(vue).not.toMatch(/<span class="sb-icon" aria-hidden="true"><\/span>/)
  })

  it('圖示走跟面板同一個產生器', () => {
    expect(vue).toMatch(/class="sb-icon"[^>]*>[\s\S]{0,200}?panelIconMarkup\(/)
  })

  it('尺寸照 MMD 的 .8125rem', () => {
    expect(css).toMatch(/\.shortcut-btn \.sb-icon \{[^}]*width:\s*13px/)
  })
})
