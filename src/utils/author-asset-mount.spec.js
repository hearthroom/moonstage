// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'

import {
  createAuthorAssetRuntime,
  countAuthorContainers,
  CONTAINER_ATTR,
} from './author-asset-mount.js'
import {
  LAYER_Z_INDEX,
  VALID_EVENTS,
  INVALID_EVENTS,
  VALID_LAYERS,
  FALLBACK_LAYER_INPUTS,
} from './author-asset-mount.fixtures.js'

function makeRuntime(end) {
  return createAuthorAssetRuntime({
    doc: document,
    layerZIndex: LAYER_Z_INDEX[end || 'desktop'],
  })
}

describe('author asset mount', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.body.removeAttribute('style')
  })

  describe('容器', () => {
    VALID_LAYERS.forEach((layer) => {
      it(`${layer} 容器建立時帶 isolation 與該端的層級`, () => {
        const rt = makeRuntime('desktop')
        const el = rt.mount({ mountLayer: layer, html: '<div>x</div>' })
        expect(el.getAttribute(CONTAINER_ATTR)).toBe(layer)
        // isolation: isolate 建立 stacking context——作者在容器內寫任何 z-index 都逃不出去
        expect(el.style.isolation).toBe('isolate')
        expect(el.style.zIndex).toBe(String(LAYER_Z_INDEX.desktop[layer]))
      })
    })

    // 容器是錨點不是畫布：MMD 的容器停在畫面外，資產裡排版流內的元素天生看不見；
    // 我們原本貼滿視窗，一個 height:100vh 的示範區塊就從左上角鋪滿整頁蓋住介面。
    // 0×0 + overflow:hidden 裁掉流內與 absolute 的子孫；fixed 的子孫 containing block
    // 是視窗，不受影響。不得用 clip-path／transform（會把 fixed 一起弄壞）。
    VALID_LAYERS.forEach((layer) => {
      it(`${layer} 容器是 0×0 並裁切：流內內容不畫、fixed 的才畫`, () => {
        const el = makeRuntime('desktop').mount({ mountLayer: layer, html: '<div style="height:100vh">示範</div>' })
        expect(el.style.position).toBe('fixed')
        expect(el.style.width).toBe('0px')
        expect(el.style.height).toBe('0px')
        expect(el.style.overflow).toBe('hidden')
        expect(el.style.transform).toBe('')
        expect(el.style.clipPath || '').toBe('')
      })
    })

    it('cover 的層級兩端不同（兩端 chrome 實作不同）', () => {
      const d = makeRuntime('desktop').mount({ mountLayer: 'cover', html: '' })
      expect(d.style.zIndex).toBe('1000')
      document.body.innerHTML = ''
      const m = makeRuntime('mobile').mount({ mountLayer: 'cover', html: '' })
      expect(m.style.zIndex).toBe('997')
    })

    FALLBACK_LAYER_INPUTS.forEach((bad) => {
      it(`不認得的層級 ${JSON.stringify(bad)} 落到 under，不是拋錯或不掛`, () => {
        const el = makeRuntime().mount({ mountLayer: bad, html: '' })
        expect(el.getAttribute(CONTAINER_ATTR)).toBe('under')
      })
    })

    it('重複 mount 不產生第二個容器，也不重跑內容', () => {
      const rt = makeRuntime()
      rt.mount({ mountLayer: 'over', html: '<b>first</b>' })
      rt.mount({ mountLayer: 'over', html: '<b>second</b>' })
      expect(countAuthorContainers(document)).toBe(1)
      expect(rt.containerFor('over').innerHTML).toBe('<b>first</b>')
    })
  })

  describe('事件', () => {
    VALID_EVENTS.forEach((event) => {
      it(`${event} 可訂閱且送得到`, () => {
        const rt = makeRuntime()
        let seen = null
        expect(rt.subscribe(event, (p) => { seen = p })).toBe(true)
        rt.emit(event, { id: 'm1' })
        expect(seen).toEqual({ id: 'm1' })
      })
    })

    INVALID_EVENTS.forEach((event) => {
      it(`拼錯的事件名 ${JSON.stringify(event)} 訂閱失敗，不靜默成功`, () => {
        expect(makeRuntime().subscribe(event, () => {})).toBe(false)
      })
    })

    it('一個訂閱者拋錯不影響其他訂閱者', () => {
      const errors = []
      const rt = createAuthorAssetRuntime({
        doc: document,
        layerZIndex: LAYER_Z_INDEX.desktop,
        onError: (event, e) => errors.push([event, e.message]),
      })
      let second = false
      rt.subscribe('message:done', () => { throw new Error('boom') })
      rt.subscribe('message:done', () => { second = true })
      expect(rt.emit('message:done', {})).toBe(1)
      expect(second).toBe(true)
      expect(errors[0][0]).toBe('message:done')
    })
  })

  describe('作者程式碼的包裝', () => {
    it('掛載腳本與訂閱回呼都經過 runAuthorCode', () => {
      let wrapped = 0
      const rt = createAuthorAssetRuntime({
        doc: document,
        layerZIndex: LAYER_Z_INDEX.desktop,
        runAuthorCode: (fn) => { wrapped++; return fn() },
      })
      rt.mount({ mountLayer: 'over', html: '<script>window.__authorRan = (window.__authorRan || 0) + 1</script>' })
      expect(wrapped).toBe(1)
      let seen = false
      rt.subscribe('message:done', () => { seen = true })
      rt.emit('message:done', {})
      expect(wrapped).toBe(2)
      expect(seen).toBe(true)
    })

    it('沒給 runAuthorCode 時行為不變', () => {
      const rt = makeRuntime()
      let seen = false
      rt.subscribe('message:done', () => { seen = true })
      expect(rt.emit('message:done', {})).toBe(1)
      expect(seen).toBe(true)
    })
  })

  describe('離開即還原', () => {
    it('dispose 卸掉全部容器', () => {
      const rt = makeRuntime()
      rt.mount({ mountLayer: 'cover', html: '<div>x</div>' })
      expect(countAuthorContainers(document)).toBe(1)
      rt.dispose()
      expect(countAuthorContainers(document)).toBe(0)
    })

    it('dispose 把覆寫過的變數還原成原值', () => {
      document.body.style.setProperty('--lt-chat-bubble-bg', '#111')
      const rt = makeRuntime()
      rt.setThemeVar('--lt-chat-bubble-bg', '#f00')
      expect(document.body.style.getPropertyValue('--lt-chat-bubble-bg')).toBe('#f00')
      rt.dispose()
      expect(document.body.style.getPropertyValue('--lt-chat-bubble-bg')).toBe('#111')
    })

    it('原本沒有的變數在 dispose 後被移除，不留殘值', () => {
      const rt = makeRuntime()
      rt.setThemeVar('--lt-chat-accent', '#0f0')
      rt.dispose()
      expect(document.body.style.getPropertyValue('--lt-chat-accent')).toBe('')
    })

    it('dispose 事件在關閉前送出，讓作者有機會收尾', () => {
      const rt = makeRuntime()
      let sawContainer = null
      rt.subscribe('dispose', () => { sawContainer = countAuthorContainers(document) })
      rt.mount({ mountLayer: 'under', html: '' })
      rt.dispose()
      expect(sawContainer).toBe(1)
    })

    it('dispose 之後訂閱與事件都不再生效', () => {
      const rt = makeRuntime()
      rt.dispose()
      expect(rt.subscribe('message:done', () => {})).toBe(false)
      expect(rt.emit('message:done', {})).toBe(0)
      expect(rt.mount({ mountLayer: 'over', html: '' })).toBe(null)
    })

    it('重複 dispose 不拋錯', () => {
      const rt = makeRuntime()
      rt.mount({ mountLayer: 'under', html: '' })
      expect(() => { rt.dispose(); rt.dispose() }).not.toThrow()
    })
  })

  // 聊天頁被 navigateTo 疊上子頁時只會 onHide 不會 onUnload，聊天頁還活著。
  // 容器是掛在 body 上的 position:fixed，不藏起來的話作者的覆蓋層會蓋在子頁上面
  // ——使用者點進閱讀設定，看到的是上一張卡的全螢幕覆蓋層。
  describe('頁面被蓋住時收起容器', () => {
    it('setPageVisible(false) 藏起容器，true 還原', () => {
      const rt = makeRuntime()
      rt.mount({ mountLayer: 'cover', html: '<div>x</div>' })
      const el = rt.containerFor('cover')
      expect(el.style.display).toBe('')

      rt.setPageVisible(false)
      expect(el.style.display).toBe('none')

      rt.setPageVisible(true)
      expect(el.style.display).toBe('')
    })

    // 藏起來不是卸載：作者的節點與訂閱都要留著，否則返回時腳本會重跑一次。
    it('藏起來不卸載容器、不清訂閱', () => {
      const rt = makeRuntime()
      rt.mount({ mountLayer: 'over', html: '<b data-k="1">x</b>' })
      rt.subscribe('message:mount', () => {})
      rt.setPageVisible(false)
      expect(countAuthorContainers(document)).toBe(1)
      expect(rt.containerFor('over').querySelector('[data-k="1"]')).toBeTruthy()
      expect(rt.subscriberCount('message:mount')).toBe(1)
    })

    it('dispose 之後再呼叫不拋錯', () => {
      const rt = makeRuntime()
      rt.mount({ mountLayer: 'under', html: '' })
      rt.dispose()
      expect(() => rt.setPageVisible(false)).not.toThrow()
    })
  })

  // ── 作者按鈕要能驅動送出 ──
  // 競品的「遊玩助手」是點一下就把指令送出去。我們的 send() 要求手勢，而手勢原本
  // 只有平台自己的送出鍵會登記，作者按鈕點下去永遠是 not_a_gesture。
  //
  // 這裡放寬的是「手勢的來源」，不是送出本身：登記手勢只是讓作者**自己呼叫**的
  // send() 過得了關，作者沒呼叫就什麼都不會送。範圍嚴格限制在容器內的真實點擊。
  describe('容器內的真實點擊登記為使用者手勢', () => {
    it('容器內 isTrusted 的 click 會通知宿主', () => {
      const seen = []
      const rt = createAuthorAssetRuntime({
        doc: document,
        layerZIndex: LAYER_Z_INDEX.desktop,
        onUserGesture: () => seen.push('gesture'),
        // jsdom 的 isTrusted 是不可重新定義的唯讀屬性，注入判定才測得到「有登記」這一半。
        // 真實瀏覽器走預設值（讀 event.isTrusted），由 case 庫的瀏覽器步驟驗證。
        isTrustedEvent: () => true,
      })
      rt.mount({ mountLayer: 'over', html: '<button data-k="go">go</button>' })
      rt.containerFor('over').querySelector('[data-k="go"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))

      expect(seen).toEqual(['gesture'])
    })

    // 程式派發的點擊不算手勢——否則作者用 setInterval 自己點自己就變成自問自答。
    it('非 isTrusted 的 click 不算手勢', () => {
      const seen = []
      const rt = createAuthorAssetRuntime({
        doc: document, layerZIndex: LAYER_Z_INDEX.desktop,
        onUserGesture: () => seen.push('gesture'),
      })
      rt.mount({ mountLayer: 'over', html: '<button data-k="go">go</button>' })
      rt.containerFor('over').querySelector('[data-k="go"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(seen).toEqual([])
    })

    // 這是 owner 的疑慮：不能變成「所有人點擊都自動送出」。容器外的點擊不得登記手勢。
    it('容器外的點擊不登記手勢', () => {
      const seen = []
      const rt = createAuthorAssetRuntime({
        doc: document, layerZIndex: LAYER_Z_INDEX.desktop,
        onUserGesture: () => seen.push('gesture'),
        isTrustedEvent: () => true,
      })
      rt.mount({ mountLayer: 'over', html: '<button data-k="go">go</button>' })
      const outside = document.createElement('button')
      document.body.appendChild(outside)
      outside.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      outside.remove()
      expect(seen).toEqual([])
    })

    it('dispose 之後容器內的點擊不再通知', () => {
      const seen = []
      const rt = createAuthorAssetRuntime({
        doc: document, layerZIndex: LAYER_Z_INDEX.desktop,
        onUserGesture: () => seen.push('gesture'),
        isTrustedEvent: () => true,
      })
      rt.mount({ mountLayer: 'over', html: '<button data-k="go">go</button>' })
      const btn = rt.containerFor('over').querySelector('[data-k="go"]')
      rt.dispose()
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(seen).toEqual([])
    })
  })

  // ── 作者的 script 要執行 ──
  // mount 走 innerHTML，而 innerHTML 依規範不執行 script：標籤留在 DOM 裡、什麼都沒跑、
  // 也沒有錯誤。競品那張卡在 window 上留了 35 個全域函式全靠 script，匯進來會整批靜默失效。
  // 註：這個 vitest/jsdom 環境不執行任何 script（實測動態建立的 script 也不跑），
  // 所以「真的執行了」只能在瀏覽器驗。這裡驗的是讓它在真瀏覽器會執行的那個機制：
  // innerHTML 塞進來的 script 節點被換成新建節點，並保留 text 與屬性。
  describe('作者資產內的 script', () => {
    it('innerHTML 進來的 script 會被換成新建節點並保留內容', () => {
      const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
      const el = rt.mount({
        mountLayer: 'over',
        html: '<i>x</i><script type="text/javascript" data-k="s1">window.__x = 1;</script>',
      })
      const script = el.querySelector('script')
      expect(script).toBeTruthy()
      expect(script.text).toBe('window.__x = 1;')
      expect(script.getAttribute('data-k')).toBe('s1')
      expect(script.getAttribute('type')).toBe('text/javascript')
    })

    // 重複 mount 不得再動一次 script 節點（既有的單例哨兵語意），否則作者腳本會重跑。
    it('重複 mount 不再替換一次', () => {
      const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
      const html = '<i>x</i><script>window.__y = 1;</script>'
      const el = rt.mount({ mountLayer: 'over', html: html })
      const first = el.querySelector('script')
      rt.mount({ mountLayer: 'over', html: html })
      expect(el.querySelector('script')).toBe(first)
    })

    it('有 script 時其餘掛載內容照常留著', () => {
      // 註：作者腳本自己拋錯走的是 window.onerror，不會傳回插入端（瀏覽器原生語意，
      // jsdom 亦同），所以這裡不去斷言「不拋錯」——那是在測一條不存在的傳遞路徑。
      const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
      rt.mount({
        mountLayer: 'over',
        html: '<b data-k="kept">kept</b><script>window.__kept = 1;</script>',
      })
      expect(rt.containerFor('over').querySelector('[data-k="kept"]')).toBeTruthy()
      delete window.__kept
    })
  })

  // ── 對話欄幾何 ──
  // 作者只能寫 position: fixed，而 fixed 是相對視窗的。mobile 上對話欄就是整個視窗，
  // 所以貼邊沒問題；desktop 的對話欄只佔中間一條（左右各有側欄），作者若貼視窗右緣，
  // 東西會落到頭像那一區去。作者沒有辦法自己知道對話欄在哪——這是平台該給的資訊。
  describe('對話欄幾何變數', () => {
    it('setColumnMetrics 把對話欄的位置寫成容器上的 CSS 變數', () => {
      const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
      const el = rt.mount({ mountLayer: 'over', html: '' })
      rt.setColumnMetrics({ left: 273, top: 77, width: 830, height: 684 }, 1440, 900)
      expect(el.style.getPropertyValue('--lt-chat-col-left')).toBe('273px')
      expect(el.style.getPropertyValue('--lt-chat-col-top')).toBe('77px')
      expect(el.style.getPropertyValue('--lt-chat-col-width')).toBe('830px')
      // right/bottom 給的是「距視窗右緣/下緣」，作者才寫得出 right: var(...)
      expect(el.style.getPropertyValue('--lt-chat-col-right')).toBe('337px')
      expect(el.style.getPropertyValue('--lt-chat-col-bottom')).toBe('139px')
    })

    // 尚未 mount 時也要能先寫，否則首次量測跟掛載的先後順序會決定變數在不在。
    it('mount 之前呼叫，掛上之後仍拿得到值', () => {
      const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
      rt.setColumnMetrics({ left: 10, top: 20, width: 300, height: 400 }, 1000, 800)
      const el = rt.mount({ mountLayer: 'cover', html: '' })
      expect(el.style.getPropertyValue('--lt-chat-col-left')).toBe('10px')
      expect(el.style.getPropertyValue('--lt-chat-col-width')).toBe('300px')
    })

    it('視窗改變後重新量測會覆蓋舊值', () => {
      const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
      const el = rt.mount({ mountLayer: 'over', html: '' })
      rt.setColumnMetrics({ left: 273, top: 0, width: 830, height: 900 }, 1440, 900)
      rt.setColumnMetrics({ left: 0, top: 0, width: 390, height: 844 }, 390, 844)
      expect(el.style.getPropertyValue('--lt-chat-col-left')).toBe('0px')
      expect(el.style.getPropertyValue('--lt-chat-col-width')).toBe('390px')
      expect(el.style.getPropertyValue('--lt-chat-col-right')).toBe('0px')
    })

    it('dispose 之後呼叫不拋錯', () => {
      const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
      rt.mount({ mountLayer: 'over', html: '' })
      rt.dispose()
      expect(() => rt.setColumnMetrics({ left: 1, top: 1, width: 1, height: 1 }, 10, 10)).not.toThrow()
    })
  })

  // ── under/over/cover 容器都相對視窗，不建立 containing block ──
  // 畫布沒有側欄：對話欄本來就等於整個內容區，容器縮進對話欄再加 transform，
  // 只會讓作者寫的 `position:fixed; right:0` 貼到內容欄邊而不是玩家看到的螢幕邊緣
  // （這是三欄式聊天頁留下的舊行為，畫布上是一個 bug——見 defect 1：功能鍵列與
  // 立繪貼在內容欄旁邊，不是視窗右緣）。
  //
  // 需要「只蓋對話欄那一塊」的作者改讀 --lt-chat-col-* 變數自己組座標（opt-in，
  // 見上面「對話欄幾何變數」），不影響沒讀這組變數的卡。
  describe('容器作為 fixed 的定位基準', () => {
    // 容器是 0×0 的錨點，不挪到對話欄、不帶 transform：作者的 fixed 直接解析到視窗。
    it('under / over 不因對話欄量測而挪動或帶 transform', () => {
      const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
      rt.setColumnMetrics({ left: 273, top: 77, width: 830, height: 684 }, 1440, 900)
      const el = rt.mount({ mountLayer: 'over', html: '' })
      expect(el.style.transform).toBe('')
      expect(el.style.left).toBe('0px')
      expect(el.style.top).toBe('0px')
      expect(el.style.right).toBe('')
      expect(el.style.bottom).toBe('')
    })

    it('cover 同樣不帶 transform（語意是作者的 fixed 蓋掉整個 App，不是容器本身）', () => {
      const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
      rt.setColumnMetrics({ left: 273, top: 77, width: 830, height: 684 }, 1440, 900)
      const el = rt.mount({ mountLayer: 'cover', html: '' })
      expect(el.style.transform).toBe('')
      expect(el.style.left).toBe('0px')
      expect(el.style.top).toBe('0px')
    })

    it('尚未量測時 under/over 一樣停在視窗左上角', () => {
      const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
      const el = rt.mount({ mountLayer: 'over', html: '' })
      expect(el.style.left).toBe('0px')
      expect(el.style.top).toBe('0px')
    })

    it('視窗改變後重新量測：容器幾何不動，只有 --lt-chat-col-* 變數更新', () => {
      const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
      const el = rt.mount({ mountLayer: 'over', html: '' })
      rt.setColumnMetrics({ left: 273, top: 0, width: 830, height: 900 }, 1440, 900)
      expect(el.style.left).toBe('0px')
      expect(el.style.getPropertyValue('--lt-chat-col-left')).toBe('273px')
      rt.setColumnMetrics({ left: 0, top: 0, width: 390, height: 844 }, 390, 844)
      expect(el.style.left).toBe('0px')
      expect(el.style.getPropertyValue('--lt-chat-col-width')).toBe('390px')
    })
  })

  // 進出對話頁三輪之後，容器與訂閱都不得累積——競品的卡就是這樣長出四份重複節點的。
  it('進出三輪不累積容器與訂閱', () => {
    for (let i = 0; i < 3; i++) {
      const rt = makeRuntime()
      rt.mount({ mountLayer: 'cover', html: '<div>x</div>' })
      rt.subscribe('message:mount', () => {})
      expect(countAuthorContainers(document)).toBe(1)
      expect(rt.subscriberCount('message:mount')).toBe(1)
      rt.dispose()
      expect(countAuthorContainers(document)).toBe(0)
      expect(rt.subscriberCount('message:mount')).toBe(0)
    }
  })
})

// 匯入的卡整片點不動。兩次都是同一個根因：平台替作者決定了 pointer-events。
//
// 第一次：容器是 pointer-events: none，這個屬性會繼承，作者掛進來的每個元素都不可點。
// 第二次：補了一條 [容器]>*{pointer-events:auto} 讓直接子元素恢復可點。它蓋得過作者的
// 一般 class 規則以外的一切——包括 Shadow DOM 宿主自己在 shadow root 裡寫的
// :host{pointer-events:none}。CSS 層疊先比封裝情境、再比特異性：一般宣告是外層文件
// 的規則贏。於是用 Shadow DOM 做「全螢幕透明殼、裡面的面板才可點」的卡（MMD 搬來的
// 柚子島，2026-10-17 社群回報），四層透明殼全被翻成可點，蓋住整頁。
//
// 容器早就是 0×0 並裁切（見 applyContainerBox），它自己不可能擋到點擊；那條 none
// 只是在製造一個要我們再用 auto 去補的洞。現在兩者都不寫：作者的元素跟在 MMD 上
// 一樣從頁面繼承 auto，要穿透就由作者自己的樣式決定，平台不插手。
describe('作者元素的 pointer-events 由作者決定', () => {
  it('容器本身不設 pointer-events', () => {
    const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
    const el = rt.mount({ mountLayer: 'over', html: '<div class="btn">點我</div>' })
    expect(el.style.pointerEvents).toBe('')
  })

  it('容器仍是 0×0 並裁切，所以不需要靠 pointer-events 讓開底下的 App', () => {
    const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
    const el = rt.mount({ mountLayer: 'cover', html: '<div>x</div>' })
    expect(el.style.width).toBe('0px')
    expect(el.style.height).toBe('0px')
    expect(el.style.overflow).toBe('hidden')
  })

  it('不在頁面上注入任何改寫作者元素 pointer-events 的樣式', () => {
    const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
    rt.mount({ mountLayer: 'over', html: '<div id="yzdirector-host"></div>' })
    // jsdom 不算 shadow 封裝情境的層疊，驗不到 :host 輸贏；能驗的是平台根本不寫那條外層規則。
    const pageCss = [...document.querySelectorAll('style')]
      .map(function (s) { return s.textContent || '' })
      .join('')
      .replace(/\s+/g, '')
    expect(pageCss).not.toContain('[' + CONTAINER_ATTR + ']')
  })

  it('容器內的真實點擊仍登記為使用者手勢', () => {
    let gestures = 0
    const rt = createAuthorAssetRuntime({
      doc: document,
      layerZIndex: LAYER_Z_INDEX.desktop,
      onUserGesture: function () { gestures++ },
      isTrustedEvent: function () { return true },
    })
    const el = rt.mount({ mountLayer: 'over', html: '<button id="b">送出</button>' })
    el.querySelector('#b').click()
    expect(gestures).toBe(1)
  })
})

describe('掛載內容最外層的裸文字不畫', () => {
  // 作者的東西靠 position: fixed 自己定位；沒有包在元素裡的文字本來就不該畫
  //（容器現在也會裁掉流內內容）。全站 42 份資產跑過一遍：會出現的裸文字全是
  // 沒被任何規則吃掉的觸發詞（《播1》、[圖片集02]、<全局美化>）或作者複製貼上
  // 留下的殘渣（="let m=…">），沒有一份是要給玩家看的。
  it('去掉最外層的文字節點，元素與元素裡的文字原樣保留', () => {
    const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
    const el = rt.mount({
      mountLayer: 'over',
      html: '[UIcss] <style>.a{}</style><p id="x" data-s="1"></p>="let m=1;"><div class="bar">狀態 <b>好感</b></div> 尾巴',
    })
    const bare = [...el.childNodes].filter((n) => n.nodeType === 3)
    expect(bare.length).toBe(0)
    expect(el.querySelector('#x').getAttribute('data-s')).toBe('1')
    expect(el.querySelector('.bar').textContent).toBe('狀態 好感')
    expect(el.querySelectorAll('style').length).toBe(1)
    expect(el.textContent).not.toContain('UIcss')
    expect(el.textContent).not.toContain('let m=')
  })

  it('整份都是沒被規則吃掉的觸發詞時，容器留空', () => {
    const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
    const el = rt.mount({ mountLayer: 'under', html: '<全局美化>' })
    expect(el.childNodes.length).toBe(0)
  })
})

