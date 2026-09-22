// @vitest-environment jsdom
//
// 把作者範圍跟執行期照畫布的接法接起來，用一張「會殘留」的卡走一遍：
// 掛載腳本往 body 塞 fixed HUD、開 interval 每幾毫秒把 HUD 畫回去、在 document 接快捷鍵；
// 訊息裡的 <script> 複製進 head 再往 body 塞底部列。離場之後這些全部要不見，
// 而且下一張卡進來時什麼都不會沾到。
//
// jsdom 的限制：<script> 裡的程式跑在 jsdom 自己的 realm，那裡的 window 跟測試碼的 window
// 不是同一個物件（瀏覽器裡只有一個）。所以卡片腳本的效果一律寫在 document 上（兩邊共用），
// 不透過 window 全域來觀察；window 層的計時器與監聽由 author-asset-scope.spec.js 直接驗。
import { describe, it, expect, beforeEach } from 'vitest'

import { createAuthorAssetRuntime, CONTAINER_ATTR } from './author-asset-mount.js'
import { createAuthorScope } from './author-asset-scope.js'
import { adoptAuthorBodyNode } from '../pages/canvas/canvas-author-node-hoist'

const nativeSetTimeout = window.setTimeout
function wait(ms) { return new Promise((resolve) => { nativeSetTimeout(resolve, ms) }) }

function bootCard(mountHtml) {
  const scope = createAuthorScope({
    doc: document,
    win: window,
    isAuthorRoot: (el) => !!(el.hasAttribute && el.hasAttribute(CONTAINER_ATTR)),
    isOwnNode: (node) => !!(node.hasAttribute && node.hasAttribute(CONTAINER_ATTR)),
  })
  const runtime = createAuthorAssetRuntime({
    doc: document,
    layerZIndex: { under: 12, over: 30, cover: 1000 },
    runAuthorCode: (fn) => scope.run(fn),
  })
  runtime.mount({ mountLayer: 'over', html: mountHtml })
  return { scope, runtime }
}

// 畫布 activateMessageScripts 的接法：script 複製一份進 head 才會執行
function activateMessageScript(scope, code) {
  const script = document.createElement('script')
  script.textContent = code
  scope.adopt(script)
  scope.run(() => { document.head.appendChild(script) })
}

function leaveCard(card) {
  card.runtime.dispose()
  card.scope.dispose()
}

const app = () => document.getElementById('app')
const ticks = () => Number(app().getAttribute('data-ticks') || 0)

const HUD_CARD = `
  <div id="in-container">inside</div>
  <script>
    (function () {
      var app = document.getElementById('app')
      function paint() {
        if (document.getElementById('card-a-hud')) return
        var hud = document.createElement('div')
        hud.id = 'card-a-hud'
        hud.style.position = 'fixed'
        document.body.appendChild(hud)
      }
      paint()
      app.setAttribute('data-ticks', '0')
      window.setInterval(function () {
        app.setAttribute('data-ticks', String(Number(app.getAttribute('data-ticks')) + 1))
        paint()
      }, 5)
      document.addEventListener('keydown', function () { app.setAttribute('data-key', '1') })
      document.onkeyup = function () {}
    })()
  </script>
`

describe('作者範圍 × 執行期：一張會殘留的卡', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"><div id="chat"></div></div>'
    document.head.innerHTML = ''
  })

  it('離場後 HUD、重畫的 interval、快捷鍵、head 裡的腳本與樣式全部不見', async () => {
    const card = bootCard(HUD_CARD)
    activateMessageScript(card.scope, `
      var bar = document.createElement('div'); bar.id = 'card-a-bottom-bar'; document.body.appendChild(bar)
    `)
    const style = document.createElement('style')
    style.id = 'card-a-style'
    card.scope.adopt(style)
    document.head.appendChild(style)

    await wait(30)
    expect(document.getElementById('card-a-hud')).not.toBeNull()
    expect(document.getElementById('card-a-bottom-bar')).not.toBeNull()
    expect(document.getElementById('card-a-style')).not.toBeNull()
    expect(ticks()).toBeGreaterThan(0)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    expect(app().getAttribute('data-key')).toBe('1')
    expect(typeof document.onkeyup).toBe('function')

    leaveCard(card)

    expect(document.getElementById('card-a-hud')).toBeNull()
    expect(document.getElementById('card-a-bottom-bar')).toBeNull()
    expect(document.getElementById('card-a-style')).toBeNull()
    expect(document.querySelectorAll('head script').length).toBe(0)
    expect(document.querySelectorAll('[' + CONTAINER_ATTR + ']').length).toBe(0)
    expect(document.onkeyup).toBeNull()

    // interval 停了：計數不再動，HUD 也不會再被畫回來
    const at = ticks()
    await wait(30)
    expect(ticks()).toBe(at)
    expect(document.getElementById('card-a-hud')).toBeNull()

    // 快捷鍵拆了
    app().removeAttribute('data-key')
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    expect(app().getAttribute('data-key')).toBeNull()

    // 宿主自己的東西還在
    expect(app()).not.toBeNull()
    expect(document.getElementById('chat')).not.toBeNull()
  })

  it('下一張卡進來時只有自己的東西；再離場也清乾淨', async () => {
    const first = bootCard(HUD_CARD)
    await wait(15)
    leaveCard(first)

    const second = bootCard(`
      <script>
        var p = document.createElement('div'); p.id = 'card-b-panel'; document.body.appendChild(p)
      </script>
    `)
    expect(document.getElementById('card-b-panel')).not.toBeNull()
    expect(document.getElementById('card-a-hud')).toBeNull()
    // 第二張卡的範圍只記自己的：第一張留下的 interval 已停，HUD 不會回來
    await wait(20)
    expect(document.getElementById('card-a-hud')).toBeNull()
    expect(second.scope.trackedNodeCount()).toBe(1)

    leaveCard(second)
    expect(document.getElementById('card-b-panel')).toBeNull()
    expect(document.body.children.length).toBe(1)
    expect(document.body.firstElementChild.id).toBe('app')
  })

  // 社群回報的卡（2026-09-22）：面板在掛載層裡用 z-index 9999，點開時再往 body 塞一層
  // z-index 9998 的全螢幕透明遮罩當「點外面就關」。作者容器是自己的 stacking context，
  // 遮罩若留在 body，9998 是跟整個畫布比，面板與預覽彈窗全被它蓋住：點什麼都先點到
  // 遮罩，面板就關了。遮罩搬進同一個容器，9998 < 9999 才又成立。
  it('作者點開面板時塞到 body 的 fixed 遮罩，搬進面板所在的容器；流內節點不搬', async () => {
    let runtime = null
    const scope = createAuthorScope({
      doc: document,
      win: window,
      isAuthorRoot: (el) => !!(el.hasAttribute && el.hasAttribute(CONTAINER_ATTR)),
      isOwnNode: (node) => !!(node.hasAttribute && node.hasAttribute(CONTAINER_ATTR)),
      onBodyNode: (node) => {
        adoptAuthorBodyNode(node, runtime && runtime.containerFor('over'), (el) => window.getComputedStyle(el))
      },
    })
    runtime = createAuthorAssetRuntime({
      doc: document,
      layerZIndex: { under: 12, over: 30, cover: 1000 },
      runAuthorCode: (fn) => scope.run(fn),
    })
    const container = runtime.mount({ mountLayer: 'over', html: `
      <div class="sidebar" style="position:fixed;z-index:9999" onclick="event.stopPropagation()">
        <div id="trigger" onclick="
          var p=this.nextElementSibling;
          p.style.display='flex';
          var overlay=document.createElement('div');
          overlay.id='teapot-overlay';
          overlay.style.cssText='position:fixed;inset:0;z-index:9998;background:transparent;';
          overlay.onclick=function(){p.style.display='none';this.remove();};
          document.body.appendChild(overlay);
          var note=document.createElement('div');
          note.id='flow-note';
          document.body.appendChild(note);
        ">特化库</div>
        <div id="bubble" style="display:none"></div>
      </div>` })

    document.getElementById('trigger').click()
    // 面板自己 stopPropagation，事件到不了 window，窗口由頁面根部的觀察回呼（微任務）
    // 先結帳——瀏覽器在繪製前就跑完，這裡等一拍。
    await Promise.resolve()

    const overlay = document.getElementById('teapot-overlay')
    expect(overlay.parentNode).toBe(container)
    // 流內節點搬進 0×0 的容器會被裁掉看不見，留在原地
    expect(document.getElementById('flow-note').parentNode).toBe(document.body)

    overlay.click()
    expect(document.getElementById('bubble').style.display).toBe('none')
    expect(document.getElementById('teapot-overlay')).toBeNull()

    leaveCard({ runtime, scope })
    expect(document.getElementById('flow-note')).toBeNull()
  })

  it('作者訂閱 dispose 事件時在回呼裡做的事也收得掉', () => {
    const card = bootCard('<script>document.getElementById("app").setAttribute("data-hook", "1")</script>')
    expect(app().getAttribute('data-hook')).toBe('1')
    card.runtime.subscribe('dispose', () => {
      const farewell = document.createElement('div')
      farewell.id = 'farewell'
      document.body.appendChild(farewell)
      window.setInterval(() => {}, 5)
    })
    leaveCard(card)
    expect(document.getElementById('farewell')).toBeNull()
    expect(card.scope.timerCount()).toBe(0)
  })
})
