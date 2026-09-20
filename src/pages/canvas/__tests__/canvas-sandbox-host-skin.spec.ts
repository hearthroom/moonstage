import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
import { effectScope, nextTick, ref, watch } from 'vue'
import { expect, it } from 'vitest'

// Run the real host skin lifecycle with synthetic author CSS; no card scripts or API.
const source = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
const start = source.indexOf('const sandboxDocState =')
const end = source.indexOf('// 面板與訊息選單的呈現資料', start)
const lifecycle = transpileModule(source.slice(start, end), {
 compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
}).outputText

it('applies sandbox card styling to response preferences and restores the host on close', async () => {
 const scope = effectScope()
 const sandboxCard = ref(true)
 const panel = ref({ sheet: '' })
 const before = { html: document.documentElement.className, body: document.body.className }
 const asset = { rules: [{ replace: '<style>.conv-style-modal { color: purple; }</style><script>throw new Error("never run")</script>' }] }
 let state: any
 try {
  scope.run(() => {
   state = new Function('ref', 'watch', 'sandboxCard', 'panel', 'sandboxAsset', lifecycle + '\nreturn { sandboxDocState };')(ref, watch, sandboxCard, panel, asset)
  })
  state.sandboxDocState.value = { html: { className: 'test-card-theme', data: { 'data-card-theme': 'night' } }, body: { className: 'test-card-body', data: {} } }
  panel.value = { sheet: 'response-settings' }
  await nextTick()
  const style = document.querySelector('style[data-lt="sandbox-skin"]')
  expect(style?.textContent).toBe('.conv-style-modal { color: purple; }')
  expect(document.documentElement.classList.contains('test-card-theme')).toBe(true)
  expect(document.documentElement.getAttribute('data-card-theme')).toBe('night')
  panel.value = { sheet: 'model' }
  await nextTick()
  expect(document.querySelector('style[data-lt="sandbox-skin"]')).toBe(style)
  panel.value = { sheet: '' }
  await nextTick()
  expect(document.querySelector('style[data-lt="sandbox-skin"]')).toBeNull()
  expect(document.documentElement.className).toBe(before.html)
  expect(document.body.className).toBe(before.body)
  expect(document.documentElement.hasAttribute('data-card-theme')).toBe(false)
 } finally {
  panel.value = { sheet: '' }; await nextTick(); scope.stop()
  document.querySelector('style[data-lt="sandbox-skin"]')?.remove()
  document.documentElement.className = before.html
  document.body.className = before.body
  document.documentElement.removeAttribute('data-card-theme')
 }
})
