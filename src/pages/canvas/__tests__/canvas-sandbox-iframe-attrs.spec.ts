/**
 * 沙箱殼的 iframe 第一次出現時，網址與 sandbox 屬性要同時在。
 *
 * 2026-10-09：掛殼改成等角色細節之後，iframe 先以 src=""、sandbox="" 畫出來，等到掛殼才更新屬性；
 * Vue 更新順序是先 src 再 sandbox，Chrome 用當下的 sandbox=""（不准腳本）載入殼頁，
 * 殼腳本被擋、握手逾時，所有沙箱卡全黑。這裡直接拿 canvas.vue 模板裡那一段 iframe 來掛。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'

const page = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
const iframeTemplate = (page.match(/<iframe[\s\S]*?class="canvas-sandbox-iframe"[\s\S]*?<\/iframe>/) || [''])[0]

function mountFrame() {
  const sandboxUrl = Vue.ref('')
  const sandboxAttr = Vue.ref('')
  const sandboxFrame = Vue.ref<HTMLIFrameElement | null>(null)
  const { code } = compile(iframeTemplate, { mode: 'function', prefixIdentifiers: true })
  const render = new Function('Vue', code)(Vue)
  const host = document.createElement('div')
  const app = Vue.createApp({ setup: () => ({ sandboxUrl, sandboxAttr, sandboxFrame }), render })
  app.mount(host)
  return { host, sandboxUrl, sandboxAttr, app }
}

describe('沙箱殼 iframe 的屬性', () => {
  it('殼網址還沒定：不畫 iframe（免得先以不准腳本的 sandbox 存在）', () => {
    expect(iframeTemplate).not.toBe('')
    const { host, app } = mountFrame()
    expect(host.querySelector('iframe')).toBeNull()
    app.unmount()
  })

  it('掛殼時 iframe 一建立就同時帶著殼網址與 sandbox 屬性', async () => {
    const { host, sandboxUrl, sandboxAttr, app } = mountFrame()
    const seen: Array<{ src: string | null; sandbox: string | null }> = []
    const observer = new MutationObserver((records) => {
      for (const r of records) for (const n of Array.from(r.addedNodes)) {
        if (n instanceof HTMLIFrameElement) seen.push({ src: n.getAttribute('src'), sandbox: n.getAttribute('sandbox') })
      }
    })
    observer.observe(host, { childList: true, subtree: true })
    sandboxUrl.value = 'https://c1.example.test/sandbox/'
    sandboxAttr.value = 'allow-scripts allow-same-origin'
    await Vue.nextTick()
    await Promise.resolve()
    observer.disconnect()
    expect(seen).toEqual([{ src: 'https://c1.example.test/sandbox/', sandbox: 'allow-scripts allow-same-origin' }])
    app.unmount()
  })

  it('換一個殼網址：重建 iframe，不在既有的 iframe 上先改 src', async () => {
    const { host, sandboxUrl, sandboxAttr, app } = mountFrame()
    sandboxUrl.value = 'https://c1.example.test/sandbox/'
    sandboxAttr.value = 'allow-scripts allow-same-origin'
    await Vue.nextTick()
    const first = host.querySelector('iframe')
    sandboxUrl.value = 'https://c2.example.test/sandbox/'
    await Vue.nextTick()
    const second = host.querySelector('iframe')
    expect(second).not.toBe(first)
    expect(second?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    app.unmount()
  })
})
