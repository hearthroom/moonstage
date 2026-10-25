/**
 * 作者資產的掛載與生命週期。
 *
 * 零 import 的純 DOM 模組，desktop（Vite/vitest）與 mobile（webpack/jest）共用同一份，
 * 由雙端等價檢查擋著逐位元組一致。
 * 每端的層級取值不同（兩端 chrome 實作不同），所以取值由呼叫端注入，
 * 邏輯本身不分端。
 *
 * ── 為什麼容器邊界而不是層級競賽 ──
 * 競品的做法是讓作者的東西直接掛 document.body、z-index 開到 21 億，於是誰晚寫誰贏，
 * 平台自己的介面被蓋掉也管不了。這裡改成平台提供三個具名容器，各自
 * isolation: isolate 建立 stacking context——作者在容器內寫任何 z-index 都逃不出容器，
 * 也就不需要跟他比大小。
 *
 * ── 為什麼離開時由平台收拾 ──
 * 競品要求作者自己實作一整套 route supervisor + property delta 才能在離開頁面時還原，
 * 而且他們自己的文檔承認還原不完全。這裡把資產放進平台擁有的容器、外觀覆寫走具名
 * 變數，於是離開頁面只要卸容器 + 還原變數，是單一還原點，作者不必寫 destroy，
 * 也不會忘記寫。
 *
 * ── 沒有 once / off ──
 * 訂閱的生命週期綁在「進出對話頁」上：進來時重建、離開時整批釋放。競品的退訂會清掉
 * 所有腳本的訂閱、跨卡互相干擾，作者只好各自寫哨兵。這裡作者只需要寫冪等初始化。
 */

/** 三個掛載容器。作者選的是容器，不是 z-index。 */
const AUTHOR_LAYERS = ['under', 'over', 'cover']

/** 平台發給新軌的事件。不提供 once / off，見檔頭。 */
const AUTHOR_EVENTS = [
  'message:mount',
  'message:done',
  'conversation:switch',
  'theme:change',
  'dispose',
  // 分享情境變了（推薦碼晚到）：重讀 stage.share，跟沙箱卡的 share:change 一樣
  'share:change',
]

const CONTAINER_ATTR = 'data-stage-author-layer'
// 平台不替作者決定 pointer-events。
//
// 容器曾經是 pointer-events: none（讓沒畫東西的地方點得到底下的 App），再補一條
// [容器]>*{pointer-events:auto} 把作者的元素救回可點。後面那條是外層文件的規則，
// CSS 層疊上一律贏過 Shadow DOM 宿主自己寫在 shadow root 裡的 :host 規則——作者用
// :host{pointer-events:none} 做的全螢幕透明殼被翻成可點，蓋住整頁（2026-10-17，MMD
// 搬來的柚子島）。容器是 0×0 並裁切（見 applyContainerBox），本身擋不到任何點擊，
// 所以兩條都不需要：作者的元素跟在 MMD 上一樣從頁面繼承 auto，要穿透由他自己寫。

function isKnownLayer(layer) {
  return AUTHOR_LAYERS.indexOf(layer) >= 0
}

/**
 * 建立一個對話頁的作者資產執行期。
 *
 * @param {Object} options
 * @param {Document} options.doc          目標 document
 * @param {Object}   options.layerZIndex  { under, over, cover } — 由呼叫端依平台注入
 * @param {HTMLElement} [options.root]    容器掛載點，預設 doc.body
 * @param {Function} [options.onUserGesture] 容器內發生真實點擊時通知呼叫端
 * @param {Function} [options.isTrustedEvent] 判定是否為真實使用者事件；預設讀 isTrusted
 * @param {Function} [options.runAuthorCode] 執行作者程式碼時的包裝 `(fn) => fn()`；呼叫端用它把
 *   掛載腳本與訂閱回呼跑在作者範圍（author-asset-scope.js）裡，離場時才收得乾淨
 */
function createAuthorAssetRuntime(options) {
  const config = options || {}
  const doc = config.doc
  const layerZIndex = config.layerZIndex || {}
  const root = config.root || (doc && doc.body)
  const onUserGesture = typeof config.onUserGesture === 'function' ? config.onUserGesture : null
  const runAuthorCode = typeof config.runAuthorCode === 'function'
    ? config.runAuthorCode
    : function (fn) { return fn() }
  // 「這是不是真的使用者點的」判定。真實環境一律用瀏覽器的 isTrusted——那正是瀏覽器
  // 對這個問題的答案。開成可注入只為了測試：jsdom 的 isTrusted 是不可重新定義的
  // 唯讀屬性，不注入就測不到「有登記」那一半。
  const isTrustedEvent = typeof config.isTrustedEvent === 'function'
    ? config.isTrustedEvent
    : function (event) { return !!(event && event.isTrusted) }

  // 單例哨兵：重複 mount 不重建容器、不重複注入腳本。
  const containers = {}
  const subscribers = {}
  // 只還原本執行期自己寫過的變數。沒寫過的一律不碰——宣稱「還原到初始狀態」是做不到的。
  const touchedVars = new Map()
  let mounted = false
  let disposed = false
  // 對話欄幾何。容器可能還沒建立就先量到，所以先存著，建立時一併套上。
  // 只用來算 --lt-chat-col-* 變數（見 setColumnMetrics）——容器本身的位置不再
  // 依賴這份量測，見 applyContainerBox 的說明。
  let columnVars = null

  function ensureContainer(layer) {
    if (!isKnownLayer(layer)) return null
    if (containers[layer]) return containers[layer]

    const el = doc.createElement('div')
    el.setAttribute(CONTAINER_ATTR, layer)
    el.style.position = 'fixed'
    // 建立 stacking context：作者在裡面寫任何 z-index 都逃不出這個容器。
    el.style.isolation = 'isolate'
    applyContainerBox(el)
    el.style.zIndex = String(layerZIndex[layer] == null ? 0 : layerZIndex[layer])

    // 容器內的真實點擊 = 一次使用者手勢。
    //
    // 原本只有平台自己的送出鍵會登記手勢，於是作者按鈕呼叫 send() 永遠是
    // not_a_gesture——競品那種「助手按鈕點一下就送出」的玩法整條斷掉。
    //
    // 這裡放寬的是手勢的「來源」，不是送出本身：登記手勢只讓作者**自己呼叫**的
    // send() 過得了關，作者沒呼叫就什麼都不會送。範圍也是窄的——容器是
    // 0×0 並裁切，點在 App 自己的 UI 上時事件不以容器為目標、也不會冒泡
    // 到這裡，所以不存在「所有人點擊都自動送出」。
    //
    // 用捕獲階段：要在作者的 onclick 之前登記，否則同一次點擊裡的 send() 仍會被擋。
    // 只認 isTrusted：程式派發的點擊不算，否則作者用 setInterval 自己點自己
    // 就繞過了防自問自答的設計。
    el.addEventListener('click', function (event) {
      if (!disposed && onUserGesture && isTrustedEvent(event)) onUserGesture()
    }, true)

    applyColumnVars(el)
    root.appendChild(el)
    containers[layer] = el
    return el
  }

  /**
   * 讓作者資產裡的 script 真的執行。
   *
   * innerHTML 依規範不執行 script：標籤會留在 DOM 裡、什麼都沒跑、也不報錯。
   * 競品的卡在 window 上留了 35 個全域函式全靠 script，照原樣匯進來會整批靜默
   * 失效，而作者查不出原因——「安靜地不動作」是最糟的失敗模式。
   *
   * 逐個換成新建的 script 節點才會執行（複製屬性以保留 src / type）。
   * 單一 script 拋錯不得影響其餘掛載內容，所以逐個包 try。
   */
  function runScripts(el) {
    const list = el.querySelectorAll ? el.querySelectorAll('script') : []
    for (let i = 0; i < list.length; i++) {
      const old = list[i]
      const fresh = doc.createElement('script')
      for (let a = 0; a < old.attributes.length; a++) {
        const attr = old.attributes[a]
        try { fresh.setAttribute(attr.name, attr.value) } catch (e) { /* 屬性名不合法就跳過 */ }
      }
      fresh.text = old.text
      try {
        // 換節點的那一刻腳本就執行了：包在作者範圍裡，它往頁面根部塞的東西才記得到帳上
        runAuthorCode(function () { old.parentNode.replaceChild(fresh, old) })
      } catch (e) {
        // 作者腳本自己拋錯不能把掛載流程一起帶走
      }
    }
  }

  /**
   * 掛載內容最外層的裸文字不畫。
   *
   * 作者的東西靠 position: fixed 自己定位（見 applyContainerBox 的說明），沒有包在
   * 任何元素裡的文字本來就不該畫；容器現在會把流內內容裁掉，這裡多拿掉一層是
   * 讓它連 DOM 都不留（文字節點也不會被作者腳本 querySelector 到）。實際會出現的
   * 只有兩種東西：沒被任何規則吃掉的觸發詞（《播1》、[圖片集02]、<全局美化>），
   * 以及作者複製貼上留下的殘渣（例如一段掉出標籤外的 ="let m=…">）——2026-09-11
   * 全站 42 份資產跑過一遍，沒有一份的裸文字是要給玩家看的。只動最外層：元素裡
   * 的文字是作者版面的一部分，原樣保留。
   */
  function dropBareText(el) {
    const nodes = el.childNodes
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i].nodeType === 3) el.removeChild(nodes[i])
    }
  }

  /**
   * 掛上一份資產。冪等：同一個執行期重複呼叫不會產生第二份容器或第二次腳本執行。
   *
   * @param {Object} asset { mountLayer, html }
   */
  function mount(asset) {
    if (disposed) return null
    const spec = asset || {}
    const layer = isKnownLayer(spec.mountLayer) ? spec.mountLayer : 'under'
    const el = ensureContainer(layer)
    if (!el) return null
    if (!mounted) {
      el.innerHTML = String(spec.html == null ? '' : spec.html)
      dropBareText(el)
      // 作者寫 `<style disabled>` 是「預設關、之後由他的腳本開」；瀏覽器不認這個屬性、
      // 只認 .disabled，這裡翻譯一次（見 utils/author-style-disabled.js 的說明；本檔零 import，
      // 所以內聯）。要放在 runScripts 之前：作者腳本讀到的就是他預期的初始狀態。
      const disabledStyles = el.querySelectorAll('style[disabled]')
      for (let d = 0; d < disabledStyles.length; d++) disabledStyles[d].disabled = true
      // 哨兵先立起來再跑腳本：作者腳本若在執行期間又觸發 mount，不得重跑第二次。
      mounted = true
      runScripts(el)
    }
    return el
  }

  /** 作者訂閱平台事件。事件名不在表內一律忽略——拼錯不會靜默生效。 */
  function subscribe(event, handler) {
    if (disposed) return false
    if (AUTHOR_EVENTS.indexOf(event) < 0) return false
    if (typeof handler !== 'function') return false
    if (!subscribers[event]) subscribers[event] = []
    subscribers[event].push(handler)
    return true
  }

  /**
   * 平台發事件。一個訂閱者拋錯不得影響其他訂閱者——一張卡寫壞不該讓整頁停擺。
   */
  function emit(event, payload) {
    if (disposed && event !== 'dispose') return 0
    const list = subscribers[event]
    if (!list || !list.length) return 0
    let delivered = 0
    for (let i = 0; i < list.length; i++) {
      try {
        // 訂閱回呼是作者的程式碼，同樣跑在作者範圍裡
        const handler = list[i]
        runAuthorCode(function () { handler(payload) })
        delivered++
      } catch (e) {
        // 吞掉但不靜默：交給呼叫端的 onError 決定要不要記錄。
        if (typeof config.onError === 'function') config.onError(event, e)
      }
    }
    return delivered
  }

  /** 覆寫一個作者可覆寫的變數，並記住原值供離開時還原。 */
  function setThemeVar(name, value) {
    if (disposed || !root) return false
    if (!touchedVars.has(name)) {
      touchedVars.set(name, root.style.getPropertyValue(name))
    }
    root.style.setProperty(name, value)
    return true
  }

  /**
   * 把對話欄的位置發給作者，寫成容器上的 CSS 變數。
   *
   * 畫布沒有側欄，作者的 fixed 元素直接解析到視窗（見 applyContainerBox）；這組變數服務的是
   * 另一種需求——作者想讓某個裝飾元素只蓋住對話欄那一塊、不要滿版時，可以自己
   * 選擇性地寫 `right: var(--lt-chat-col-right)` 而不是 `right: 0`。這是 opt-in：
   * 不讀這組變數的卡完全不受影響。
   *
   * right / bottom 給的是「距視窗右緣／下緣」的距離，這樣寫出來的 CSS 才會是
   * 「貼對話欄邊」而不是「對話欄的絕對座標」，兩端同一份也對得上。
   *
   * 值先記在 pending，容器還沒建立時也能先設——否則首次量測與掛載的先後順序
   * 會決定變數在不在。
   */
  function setColumnMetrics(rect, viewportWidth, viewportHeight) {
    if (disposed || !rect) return
    const left = Number(rect.left) || 0
    const top = Number(rect.top) || 0
    const width = Number(rect.width) || 0
    const height = Number(rect.height) || 0
    columnVars = {
      '--lt-chat-col-left': left + 'px',
      '--lt-chat-col-top': top + 'px',
      '--lt-chat-col-width': width + 'px',
      '--lt-chat-col-height': height + 'px',
      '--lt-chat-col-right': ((Number(viewportWidth) || 0) - left - width) + 'px',
      '--lt-chat-col-bottom': ((Number(viewportHeight) || 0) - top - height) + 'px',
    }
    AUTHOR_LAYERS.forEach((layer) => {
      if (containers[layer]) applyColumnVars(containers[layer])
    })
  }

  function applyColumnVars(el) {
    if (!columnVars) return
    Object.keys(columnVars).forEach((name) => {
      el.style.setProperty(name, columnVars[name])
    })
  }

  /**
   * 容器是錨點，不是畫布：只有作者寫了 position: fixed 的東西才會被看見。
   *
   * 容器本身是 0×0 並裁切（overflow: hidden）。overflow 只裁「containing block 在
   * 容器裡」的子孫——排版流內的、position: absolute 的都會被裁掉；fixed 的子孫的
   * containing block 是視窗（前提是祖先沒有 transform / contain / filter /
   * perspective），不受這層裁切影響，照樣落在螢幕上。**不能**改用 clip-path（連
   * fixed 一起裁）或 transform 系（把容器變成 fixed 的 containing block，整批卡壞）。
   *
   * 為什麼要裁：MMD 的容器是 1px、停在畫面外 y≈-99999 的殼，作者資產裡排版流內的
   * 元素在那邊天生看不見；作者也就不會去清。這裡原本讓容器貼滿視窗（inset: 0），
   * 同一份資產裡一個 display:flex; height:100vh 的假聊天示範區塊就從左上角鋪滿整頁，
   * 把整個介面蓋住（2026-09-15 owner 截圖，罪惡王冠卡的「游玩助手」示範區）。
   * 對齊 MMD 的語義：流內內容不畫，fixed 才畫。
   *
   * 三層（under / over / cover）一樣，不依層級或對話欄量測分岔。
   *
   * 舊版曾經把 under/over 容器本身挪到對話欄的位置、疊上 transform，讓它成為
   * fixed 子孫的 containing block——這樣作者的 CSS 不用改一個字，`right: 0`
   * 就會自動落在對話欄邊上。那是三欄式聊天頁（左右各有側欄）的設計：對話欄只佔
   * 中間一條，直接貼視窗邊會飛到側欄或頭像那一區去。
   *
   * 畫布沒有側欄——沒有東西可以讓「貼對話欄邊」與「貼視窗邊」出現落差，對話欄
   * 本來就等於整個內容區。繼續做那層 containing block 只會讓作者寫的
   * `position:fixed; right:0` 貼到內容欄邊，而不是玩家看到的真正螢幕邊緣（見
   * defect 1：功能鍵列與立繪貼在內容欄旁邊，不是視窗右緣）。
   *
   * 需要「只蓋對話欄那一塊」的作者改讀 --lt-chat-col-* 變數自己組座標
   * （見 setColumnMetrics）——那是選擇性的，不影響沒讀這組變數的卡。
   */
  function applyContainerBox(el) {
    el.style.left = '0'
    el.style.top = '0'
    el.style.right = ''
    el.style.bottom = ''
    el.style.width = '0'
    el.style.height = '0'
    el.style.overflow = 'hidden'
    el.style.transform = ''
  }

  /**
   * 頁面被別的頁蓋住時收起容器（不是卸載）。
   *
   * 對話頁被 navigateTo 疊上子頁時只會 onHide、不會 onUnload——聊天頁還活著，
   * 而容器是掛在 body 上的 position: fixed。不收起來的話，作者的覆蓋層會蓋在
   * 子頁上面：使用者點進閱讀設定，看到的是上一張卡的全螢幕覆蓋層。
   *
   * 用顯示切換而不是 dispose，是因為 dispose 會讓作者的腳本在返回時重跑一次；
   * 藏起來則保留節點與訂閱，返回時就是原本那一份。
   */
  function setPageVisible(visible) {
    if (disposed) return
    AUTHOR_LAYERS.forEach((layer) => {
      const el = containers[layer]
      if (el) el.style.display = visible ? '' : 'none'
    })
  }

  /**
   * 離開對話頁：卸掉容器、還原變數、釋放訂閱。
   *
   * 這是單一還原點——不做逐 property 的差異記錄，因為作者的東西本來就活在
   * 我們的容器裡，容器一卸就沒了。只有變數需要記得還原。
   */
  function dispose() {
    if (disposed) return
    emit('dispose', undefined)
    disposed = true

    AUTHOR_LAYERS.forEach((layer) => {
      const el = containers[layer]
      if (el && el.parentNode) el.parentNode.removeChild(el)
      delete containers[layer]
    })

    touchedVars.forEach((original, name) => {
      if (original) root.style.setProperty(name, original)
      else root.style.removeProperty(name)
    })
    touchedVars.clear()

    Object.keys(subscribers).forEach((key) => {
      delete subscribers[key]
    })
    mounted = false
  }

  return {
    mount: mount,
    subscribe: subscribe,
    emit: emit,
    setThemeVar: setThemeVar,
    setColumnMetrics: setColumnMetrics,
    setPageVisible: setPageVisible,
    dispose: dispose,
    isMounted: function () {
      return mounted
    },
    isDisposed: function () {
      return disposed
    },
    containerFor: function (layer) {
      return containers[layer] || null
    },
    subscriberCount: function (event) {
      return (subscribers[event] || []).length
    },
  }
}

/** 目前掛在文件上的作者容器數量。重入不累積的驗證點。 */
function countAuthorContainers(doc) {
  if (!doc || !doc.querySelectorAll) return 0
  return doc.querySelectorAll('[' + CONTAINER_ATTR + ']').length
}

export {
  AUTHOR_LAYERS,
  AUTHOR_EVENTS,
  CONTAINER_ATTR,
  createAuthorAssetRuntime,
  countAuthorContainers,
}
