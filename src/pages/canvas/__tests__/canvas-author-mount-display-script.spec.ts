// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { createAuthorAssetRuntime } from '@/utils/author-asset-mount.js'
import { applyTavernRules } from '../canvas-rule-engine'
import { scopeCardHtml } from '../canvas-style-scope'
import { createDisplayScriptConverter } from '../canvas-display-script'
import { convertAuthorMountHtml } from '../canvas-author-mount-content'

function applyAsset(asset: any, locale = 'zh-Hant') {
  document.body.innerHTML = '<div class="canvas-root"></div>'
  const source = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
  const start = source.indexOf('function applyAuthorAsset(asset) {')
  const end = source.indexOf('// 使用者按下主行動鍵時', start)
  if (start < 0 || end < 0) throw new Error('applyAuthorAsset source anchors missing')
  const activeAuthorAsset = { value: { rules: [] } }
  const context: any = {
    document, window, console,
    sandboxCard: { value: false }, activeAuthorAsset, cardFormat: { value: 'mmd' },
    authorAssetSettled: { value: false }, authorOwnedRegions: { value: '' },
    hudBridgeRef: { value: null }, AUTHOR_LAYER_Z_INDEX: { under: 12, over: 31, cover: 1000 },
    normalizeCardFormat: (format: string) => format,
    applyImmersiveMode: vi.fn(), destroySandboxHost: vi.fn(), ensureAuthorScope: () => null,
    setActiveAuthorAsset: (value: any) => { activeAuthorAsset.value = value },
    createAuthorAssetRuntime, createStageIntentApi: () => ({ api: {} }),
    hostOutsideAuthorScope: (host: any) => host, buildAuthorAssetHost: () => ({}), buildHudHost: () => ({}),
    createHudBridge: () => ({ destroy() {} }), applyTavernRules, scopeCardHtml, convertAuthorMountHtml,
    authorRuleOptions: () => ({}), detectAuthorOwnedRegions: () => [],
    displayScript: createDisplayScriptConverter(locale === 'zh-Hant' ? 's2t' : 't2s'),
    needsKaiFallback: () => false,
  }
  for (const name of ['measureAuthorColumn', 'observeAuthorColumn', 'observeComposerOverhang', 'observeAuthorSideDock', 'observeCardTheme', 'runFixedAuthorNodeHoist', 'observeFixedAuthorNodes']) context[name] = vi.fn()
  vm.runInNewContext(ts.transpileModule(source.slice(start, end) + '\nthis.applyAsset = applyAuthorAsset;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  context.applyAsset(asset)
  expect(context.authorAssetSettled.value).toBe(true)
  const mounted = document.querySelector('[data-stage-author-format]')
  expect(mounted).not.toBeNull()
  return mounted as HTMLElement
}

describe('classic HUD display script uses the actual applyAuthorAsset mount path', () => {
  it.each([
    ['zh-Hant', '状态：读取存档', '狀態：讀取存檔'],
    ['zh-Hans', '狀態：讀取存檔', '状态：读取存档'],
  ])('%s converts plain HUD after author rules without changing source', (locale, source, expected) => {
    const asset = { pageMode: 'classic', cardFormat: 'mmd', mountLayer: 'over', mountTrigger: 'BOOT', rules: [{ find: '/BOOT/g', replace: `<div class="hud">${source}</div>` }] }
    const original = JSON.stringify(asset)
    expect(applyAsset(asset, locale).querySelector('.hud')?.textContent).toBe(expected)
    expect(JSON.stringify(asset)).toBe(original)
  })

  it('keeps hidden data, attributes and author verbatim regions unchanged', () => {
    const html = '<div class="hud" title="读取存档">状态：读取存档</div><span hidden>状态=读取</span><span style="display:none">状态=读取</span><span style="visibility:hidden">状态=读取</span><span translate="no">状态=读取</span><span class="notranslate">状态=读取</span><span data-lt-verbatim>状态=读取</span><code>状态=读取</code>'
    const root = applyAsset({ pageMode: 'classic', cardFormat: 'mmd', mountLayer: 'over', mountTrigger: html, rules: [] })
    expect(root.querySelector('.hud')?.textContent).toBe('狀態：讀取存檔')
    expect(root.querySelector('.hud')?.getAttribute('title')).toBe('读取存档')
    for (const node of root.querySelectorAll('span, code')) expect(node.textContent).toBe('状态=读取')
    expect(root.querySelector('[hidden]')?.hasAttribute('translate')).toBe(false)
  })

  it('preserves scripted HUD HTML because scripts can read even visible source text', () => {
    const asset = { pageMode: 'classic', cardFormat: 'mmd', mountLayer: 'over', mountTrigger: '<div class="hud">状态：读取存档</div><script>window.HUD_TEXT="状态"</script>', rules: [] }
    const root = applyAsset(asset)
    expect(root.querySelector('.hud')?.textContent).toBe('状态：读取存档')
    expect(root.querySelector('script')?.textContent).toBe('window.HUD_TEXT="状态"')
  })

  it('preserves HUD HTML when another enabled author rule owns a script', () => {
    const root = applyAsset({ pageMode: 'classic', cardFormat: 'mmd', mountLayer: 'over', mountTrigger: '<div class="hud">状态：读取存档</div>', rules: [{ find: '/OTHER/g', replace: '<script>window.HUD_TEXT="状态"</script>' }] })
    expect(root.querySelector('.hud')?.textContent).toBe('状态：读取存档')
  })
})
