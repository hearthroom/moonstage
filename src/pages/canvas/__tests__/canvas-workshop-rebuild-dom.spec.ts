// @vitest-environment jsdom
/**
 * 擴充換了（workshopHash 不同）時，一般頁在真的 DOM 上把舊的規則安裝整個收掉再裝新的：
 * 舊擴充的掛載容器、作者樣式、作者塞進 body 的節點、作者範圍裡的計時器都不能留下來，畫面上只剩新的一份。
 * 跑頁面上真正的 applyAuthorAsset／teardownAuthorRuntime／rebuildAuthorAsset 與真正的作者執行期、作者範圍。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { createAuthorAssetRuntime } from '@/utils/author-asset-mount.js'
import { createAuthorScope } from '@/utils/author-asset-scope.js'
import { applyTavernRules } from '../canvas-rule-engine'
import { scopeCardHtml } from '../canvas-style-scope'
import { convertAuthorMountHtml, hasAuthorMountCode } from '../canvas-author-mount-content'
import { assetWorkshopHash } from '../canvas-workshop'
import { createDisplayScriptConverter } from '../canvas-display-script'

const source = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
function slice(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  if (start < 0 || end < 0) throw new Error(`source anchors missing: ${startMarker}`)
  return source.slice(start, end)
}
function fn(name: string) {
  const start = source.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`missing ${name}`)
  return source.slice(start, source.indexOf('\n}\n', start) + 3)
}

function page() {
  document.body.innerHTML = '<div class="canvas-root"><div id="chat"></div></div>'
  const activeAuthorAsset = { value: { rules: [] } }
  const context: any = {
    document, window, console,
    setTimeout: (...a: any[]) => (window.setTimeout as any)(...a), clearTimeout: (id: any) => window.clearTimeout(id),
    setInterval: (...a: any[]) => (window.setInterval as any)(...a), clearInterval: (id: any) => window.clearInterval(id),
    getComputedStyle: (el: Element) => window.getComputedStyle(el), MutationObserver: window.MutationObserver,
    sandboxCard: { value: false }, sandboxReloads: { value: 0 }, activeAuthorAsset, cardFormat: { value: 'mmd' },
    authorAssetSettled: { value: false }, authorOwnedRegions: { value: '' },
    hudBridgeRef: { value: null }, AUTHOR_LAYER_Z_INDEX: { under: 12, over: 31, cover: 1000 },
    normalizeCardFormat: (format: string) => format,
    applyImmersiveMode: vi.fn(), destroySandboxHost: vi.fn(),
    setActiveAuthorAsset: (value: any) => { activeAuthorAsset.value = value },
    createAuthorAssetRuntime, createStageIntentApi: () => ({ api: {} }),
    hostOutsideAuthorScope: (host: any) => host, buildAuthorAssetHost: () => ({}), buildHudHost: () => ({}),
    createHudBridge: () => ({ destroy() {} }), applyTavernRules, scopeCardHtml, convertAuthorMountHtml, hasAuthorMountCode,
    authorRuleOptions: () => ({}), detectAuthorOwnedRegions: () => [],
    displayScript: createDisplayScriptConverter('s2t'), needsKaiFallback: () => false,
    cardStateFeed: { reset: vi.fn() }, syncCardStateEvents: vi.fn(), assetWorkshopHash,
    // 收尾那一段碰到的其他東西：這裡不驗它們，只要叫得到
    disposeCardTheme: vi.fn(), disposeComposerOverhang: vi.fn(), disposeAuthorSideDock: vi.fn(),
    hudHtmlCache: new Map(), authorColumnObserver: null, authorFixedNodeObserver: null,
    authorFixedNodeHoistLayer: null, authorFixedNodeHoistScheduled: false,
    stageIntent: null, authorAssetRuntime: null, authorScope: null, authorScopeClosed: false,
    installedWorkshopHash: null, activatedMessageScripts: new WeakMap(),
  }
  // 頁面的作者範圍：真的範圍（計時器、塞進 body 的節點都記帳），收掉後下一次套用再建一個
  context.ensureAuthorScope = () => {
    if (!context.authorScope || context.authorScope.isDisposed()) context.authorScope = createAuthorScope({ doc: document, win: window })
    return context.authorScope
  }
  for (const name of ['measureAuthorColumn', 'observeAuthorColumn', 'observeComposerOverhang', 'observeAuthorSideDock', 'observeCardTheme', 'runFixedAuthorNodeHoist', 'observeFixedAuthorNodes']) context[name] = vi.fn()
  const code = [
    slice('function applyAuthorAsset(asset) {', '// 使用者按下主行動鍵時'),
    fn('teardownAuthorRuntime'),
    fn('rebuildAuthorAsset'),
    'this.apply = applyAuthorAsset; this.rebuild = rebuildAuthorAsset;',
  ].join('\n')
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, vm.createContext(context))
  return context
}

const assetA = { pageMode: 'classic', cardFormat: 'mmd', mountLayer: 'over', workshopHash: 'hash-a', rules: [],
  mountTrigger: '<div class="hud-a">A 擴充的面板</div><style id="ws-a-style">.hud-a{color:red}</style>' }
const assetB = { pageMode: 'classic', cardFormat: 'mmd', mountLayer: 'over', workshopHash: 'hash-b', rules: [],
  mountTrigger: '<div class="hud-b">B 擴充的面板</div>' }

describe('擴充重建（一般頁，真的 DOM）', () => {
  it('A 換成 B：A 的容器、樣式、body 節點與計時器都收掉，只剩一份 B', () => {
    vi.useFakeTimers()
    let page_: any = null
    try {
      page_ = page()
      page_.apply(assetA)
      expect(document.querySelector('.hud-a')).not.toBeNull()
      expect(document.getElementById('ws-a-style')).not.toBeNull()
      // A 的作者程式碼在範圍裡開計時器、往 body 塞節點（例如點外面就關的遮罩）
      const ticks = { n: 0 }
      page_.authorScope.run(() => {
        window.setInterval(() => { ticks.n++ }, 100)
        const veil = document.createElement('div'); veil.id = 'ws-a-veil'; document.body.appendChild(veil)
      })
      vi.advanceTimersByTime(250)
      expect(ticks.n).toBe(2)
      const scopeA = page_.authorScope

      page_.rebuild(assetB)

      expect(scopeA.isDisposed()).toBe(true)
      expect(document.querySelector('.hud-a')).toBeNull()
      expect(document.getElementById('ws-a-style')).toBeNull()
      expect(document.getElementById('ws-a-veil')).toBeNull()
      vi.advanceTimersByTime(500)
      expect(ticks.n).toBe(2)
      expect(document.querySelectorAll('.hud-b').length).toBe(1)
      expect(document.querySelectorAll('[data-stage-author-format]').length).toBe(1)
      expect(page_.installedWorkshopHash).toBe('hash-b')
      // 頁面還活著：新的範圍可用
      expect(page_.authorScope && !page_.authorScope.isDisposed()).toBe(true)
    } finally {
      // 作者範圍會改寫 window 的計時器：先收範圍再換回真的計時器
      page_?.authorScope?.dispose()
      vi.useRealTimers()
      document.body.innerHTML = ''
    }
  })

  it('B 再換回 A：來回換不會疊出第二份容器', () => {
    const page_ = page()
    page_.apply(assetA)
    page_.rebuild(assetB)
    page_.rebuild(assetA)
    expect(document.querySelectorAll('[data-stage-author-format]').length).toBe(1)
    expect(document.querySelectorAll('.hud-a').length).toBe(1)
    expect(document.querySelector('.hud-b')).toBeNull()
    page_.authorScope?.dispose()
    document.body.innerHTML = ''
  })
})
