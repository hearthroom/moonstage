import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  bindAuthorSideDock,
  collectFixedRoots,
  paintedBox,
  sideDockClearance,
  SIDE_DOCK_LEFT_VAR,
  SIDE_DOCK_RIGHT_VAR,
  type Box,
  type DockCandidate,
} from '../canvas-author-side-dock'

// 實測 #100076（MMD 匯入卡，430×932 手機）：對話欄 #chat 0–430，捲動區 53–824；
// 左側欄 #integrated-sidebar 本身 0×0，按鈕畫在 0–28 × 233–649；
// 右側「圖庫」401–430 × 155–217，「劇本指令終端」401–430 × 317–429。
const phoneLane: Box = { left: 0, right: 430, top: 53, bottom: 824 }
const leftRail: Box = { left: 0, right: 28, top: 233, bottom: 649 }
const galleryTab: Box = { left: 401, right: 430, top: 155, bottom: 217 }
const scriptTab: Box = { left: 401, right: 430, top: 317, bottom: 429 }
const rail = (box: Box | null, declared: DockCandidate['declared'] = ''): DockCandidate => ({ box, declared })

describe('貼邊的窄側欄：對話欄讓出空間', () => {
  it('#100076 手機：左右各讓到側欄外緣再多 6px', () => {
    expect(sideDockClearance({ lane: phoneLane, candidates: [rail(leftRail), rail(galleryTab), rail(scriptTab)] }))
      .toEqual({ left: 34, right: 35 })
  })

  it('只有一側有側欄就只讓那一側', () => {
    expect(sideDockClearance({ lane: phoneLane, candidates: [rail(galleryTab)] })).toEqual({ left: 0, right: 35 })
  })

  it('#100076 桌機：對話欄從 24 開始，側欄只到 28——讓出量小於原本內距，CSS 的 max() 會留原值', () => {
    const lane: Box = { left: 24, right: 1256, top: 53, bottom: 690 }
    const out = sideDockClearance({
      lane,
      candidates: [rail(leftRail), rail({ left: 1251, right: 1280, top: 130, bottom: 190 })],
    })
    expect(out.left).toBeLessThanOrEqual(12)
    expect(out.right).toBeLessThanOrEqual(12)
  })

  it('沒有任何作者浮層就是 0，排版跟現在一模一樣', () => {
    expect(sideDockClearance({ lane: phoneLane, candidates: [] })).toEqual({ left: 0, right: 0 })
  })
})

describe('不是側欄的東西不讓', () => {
  it('全螢幕彈窗（點開「圖片管理」：430×932）', () => {
    expect(sideDockClearance({ lane: phoneLane, candidates: [rail({ left: 0, right: 430, top: 0, bottom: 932 })] }))
      .toEqual({ left: 0, right: 0 })
  })

  it('彈窗開著時側欄照常計算，對話欄不跟著彈窗跳', () => {
    const modal = rail({ left: 0, right: 430, top: 0, bottom: 932 })
    expect(sideDockClearance({ lane: phoneLane, candidates: [rail(leftRail), modal, rail(galleryTab)] }))
      .toEqual({ left: 34, right: 35 })
  })

  it('浮在中間、沒貼邊的面板', () => {
    expect(sideDockClearance({ lane: phoneLane, candidates: [rail({ left: 120, right: 150, top: 300, bottom: 500 })] }))
      .toEqual({ left: 0, right: 0 })
  })

  it('只在頁首那一段的東西（沒壓到訊息區）', () => {
    expect(sideDockClearance({ lane: phoneLane, candidates: [rail({ left: 0, right: 28, top: 0, bottom: 50 })] }))
      .toEqual({ left: 0, right: 0 })
  })

  it('太寬的側欄不讓——讓一半還是擋，只會讓氣泡平白變窄', () => {
    expect(sideDockClearance({ lane: phoneLane, candidates: [rail({ left: 0, right: 80, top: 200, bottom: 700 })] }))
      .toEqual({ left: 0, right: 0 })
  })

  it('貼邊但太寬的橫條（底部工具列）', () => {
    expect(sideDockClearance({ lane: phoneLane, candidates: [rail({ left: 0, right: 300, top: 700, bottom: 760 })] }))
      .toEqual({ left: 0, right: 0 })
  })

  it('量不到畫面（隱藏、在畫面外）', () => {
    expect(sideDockClearance({ lane: phoneLane, candidates: [rail(null)] })).toEqual({ left: 0, right: 0 })
  })
})

describe('小螢幕保底欄寬', () => {
  it('兩側都讓完欄寬不到四分之三就整個不讓', () => {
    const lane: Box = { left: 0, right: 200, top: 50, bottom: 600 }
    const out = sideDockClearance({
      lane,
      candidates: [rail({ left: 0, right: 19, top: 100, bottom: 400 }), rail({ left: 181, right: 200, top: 100, bottom: 400 })],
    })
    expect(out).toEqual({ left: 0, right: 0 })
  })

  it('320 寬的手機，側欄跟 #100076 一樣寬，照樣讓', () => {
    const lane: Box = { left: 0, right: 320, top: 53, bottom: 560 }
    const out = sideDockClearance({
      lane,
      candidates: [rail(leftRail), rail({ left: 291, right: 320, top: 155, bottom: 217 })],
    })
    expect(out).toEqual({ left: 34, right: 35 })
  })
})

describe('作者宣告（CSS 變數 --lt-dock）', () => {
  it('none：再像側欄也不讓', () => {
    expect(sideDockClearance({ lane: phoneLane, candidates: [rail(leftRail, 'none')] })).toEqual({ left: 0, right: 0 })
  })

  it('宣告 left：不用貼邊、可以比猜測上限寬，照宣告的一側讓', () => {
    // 離邊 8px、寬 56px 的側欄：猜測會因為太寬跳過，宣告了就照讓
    expect(sideDockClearance({ lane: phoneLane, candidates: [rail({ left: 8, right: 64, top: 200, bottom: 600 }, 'left')] }))
      .toEqual({ left: 70, right: 0 })
  })

  it('宣告也有上限：超過對話欄三成寬就不讓', () => {
    expect(sideDockClearance({ lane: phoneLane, candidates: [rail({ left: 0, right: 200, top: 200, bottom: 600 }, 'right')] }))
      .toEqual({ left: 0, right: 0 })
  })

  it('宣告的一側跟畫的位置不符（多半是從外層繼承來的）：當沒宣告，照形狀猜', () => {
    // 作者把 --lt-dock: left 寫在包住左右兩條欄的外層，右邊那條繼承到 left
    expect(sideDockClearance({ lane: phoneLane, candidates: [rail(leftRail, 'left'), rail(galleryTab, 'left')] }))
      .toEqual({ left: 34, right: 35 })
  })

  it('宣告的一側不符、形狀也不像側欄：不讓', () => {
    expect(sideDockClearance({ lane: phoneLane, candidates: [rail({ left: 350, right: 430, top: 200, bottom: 600 }, 'left')] }))
      .toEqual({ left: 0, right: 0 })
  })
})

describe('畫出來的範圍取整棵子樹', () => {
  const vp = { width: 430, height: 932 }

  it('外層 0×0、按鈕畫在子節點上（#integrated-sidebar 的真實結構）', () => {
    expect(paintedBox([
      { left: 0, top: 233, right: 0, bottom: 233 },
      { left: 0, top: 233, right: 26, bottom: 649 },
      { left: 0, top: 233, right: 28, bottom: 311 },
    ], vp)).toEqual({ left: 0, top: 233, right: 28, bottom: 649 })
  })

  it('整個在畫面外的（收起來的抽屜）不算', () => {
    expect(paintedBox([{ left: -300, top: 100, right: 0, bottom: 700 }], vp)).toBeNull()
    expect(paintedBox([
      { left: 0, top: 233, right: 28, bottom: 649 },
      { left: -300, top: 100, right: -2, bottom: 700 },
    ], vp)).toEqual({ left: 0, top: 233, right: 28, bottom: 649 })
  })
})

describe('DOM：候選節點與綁定', () => {
  it('收 fixed 的根；fixed 底下不再往下找；隱藏的不算', () => {
    document.body.innerHTML = `
      <div id="wrap">
        <div id="rail" style="position:fixed"><div id="inner" style="position:fixed"></div></div>
        <div id="hidden" style="position:fixed;display:none"></div>
        <p id="plain"></p>
      </div>`
    const roots = collectFixedRoots([document.getElementById('wrap')!], window)
    expect(roots.map((el) => el.id)).toEqual(['rail'])
  })

  it('量到就寫變數，量不到就清掉；解綁時清掉', () => {
    document.body.innerHTML = '<div id="lane"></div><div id="layer"><div id="r"></div></div>'
    const lane = document.getElementById('lane')!
    const r = document.getElementById('r')!
    lane.getBoundingClientRect = () => ({ left: 0, right: 430, top: 53, bottom: 824, width: 430, height: 771 }) as DOMRect
    r.getBoundingClientRect = () => ({ left: 0, right: 28, top: 233, bottom: 649, width: 28, height: 416 }) as DOMRect
    const target = document.documentElement
    const raf = window.requestAnimationFrame
    ;(window as unknown as { requestAnimationFrame: (fn: () => void) => number }).requestAnimationFrame = (fn) => { fn(); return 1 }
    try {
      const dispose = bindAuthorSideDock({ doc: document, win: window, lane, scroll: lane, candidates: () => [r], observe: [], target })
      expect(target.style.getPropertyValue(SIDE_DOCK_LEFT_VAR)).toBe('34px')
      expect(target.style.getPropertyValue(SIDE_DOCK_RIGHT_VAR)).toBe('')
      dispose()
      expect(target.style.getPropertyValue(SIDE_DOCK_LEFT_VAR)).toBe('')
    } finally {
      window.requestAnimationFrame = raf
    }
  })

  it('殼的左右插槽：插槽本身 0 寬，裡面放的東西不必是 fixed，放進左插槽就當宣告了 left', () => {
    document.body.innerHTML = '<div id="lane"></div><div id="slot"><div id="btn"></div></div>'
    const lane = document.getElementById('lane')!
    const slot = document.getElementById('slot')!
    const btn = document.getElementById('btn')!
    lane.getBoundingClientRect = () => ({ left: 0, right: 430, top: 53, bottom: 824, width: 430, height: 771 }) as DOMRect
    slot.getBoundingClientRect = () => ({ left: 0, right: 0, top: 45, bottom: 932, width: 0, height: 887 }) as DOMRect
    // 離邊 8px、寬 56px：猜測會跳過，插槽等於宣告，照讓
    btn.getBoundingClientRect = () => ({ left: 8, right: 64, top: 200, bottom: 600, width: 56, height: 400 }) as DOMRect
    const target = document.documentElement
    const raf = window.requestAnimationFrame
    ;(window as unknown as { requestAnimationFrame: (fn: () => void) => number }).requestAnimationFrame = (fn) => { fn(); return 1 }
    try {
      const dispose = bindAuthorSideDock({ doc: document, win: window, lane, scroll: lane, candidates: () => [{ el: slot, side: 'left' }], observe: [], target })
      expect(target.style.getPropertyValue(SIDE_DOCK_LEFT_VAR)).toBe('70px')
      dispose()
    } finally {
      window.requestAnimationFrame = raf
    }
  })

  it('作者在元素 style 上寫 --lt-dock: none，就算形狀像側欄也不讓（寫卡指南的寫法）', () => {
    document.body.innerHTML = '<div id="lane"></div><div id="r" style="position:fixed;--lt-dock: none"></div>'
    const lane = document.getElementById('lane')!
    const r = document.getElementById('r')!
    lane.getBoundingClientRect = () => ({ left: 0, right: 430, top: 53, bottom: 824, width: 430, height: 771 }) as DOMRect
    r.getBoundingClientRect = () => ({ left: 0, right: 28, top: 233, bottom: 649, width: 28, height: 416 }) as DOMRect
    const target = document.documentElement
    const raf = window.requestAnimationFrame
    ;(window as unknown as { requestAnimationFrame: (fn: () => void) => number }).requestAnimationFrame = (fn) => { fn(); return 1 }
    try {
      const dispose = bindAuthorSideDock({ doc: document, win: window, lane, scroll: lane, candidates: () => [r], observe: [], target })
      expect(target.style.getPropertyValue(SIDE_DOCK_LEFT_VAR)).toBe('')
      dispose()
    } finally {
      window.requestAnimationFrame = raf
    }
  })
})

describe('接線', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.css'), 'utf8')
  const vue = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
  const shell = readFileSync(resolve(process.cwd(), 'src/sandbox/shell.ts'), 'utf8')

  it('桌機與手機兩條 #chat 的左右內距都吃讓出量，而且只增不減（max）', () => {
    const hits = css.match(/#chat \{[^}]*max\(\d+px, var\(--lt-canvas-dock-right, 0px\)\)[^}]*max\(\d+px, var\(--lt-canvas-dock-left, 0px\)\)/g) || []
    expect(hits.length).toBe(2)
  })

  it('一般畫布與沙箱殼都綁上', () => {
    expect(vue).toMatch(/bindAuthorSideDock\(\{/)
    expect(shell).toMatch(/bindAuthorSideDock\(\{/)
  })
})
