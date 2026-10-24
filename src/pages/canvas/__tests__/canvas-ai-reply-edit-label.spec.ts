import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import CanvasMessageMenu from '../components/canvas-message-menu.vue'
import { allowsStageAction } from '@/host/capabilities'
import { canEditResendPlayerIndex, isOpeningIndex, latestCanonicalAIIndex } from '../chat-operation-ui-state'

const source = ts.createSourceFile('canvas.ts', fs.readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8').match(/<script[^>]*>([\s\S]*?)<\/script>/)![1], ts.ScriptTarget.Latest, true)
const printer = ts.createPrinter()
function actual(name: string, env: Record<string, unknown>) {
  let code = ''
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) code = printer.printNode(ts.EmitHint.Expression, node.initializer, source)
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) code = `(${printer.printNode(ts.EmitHint.Unspecified, node, source)})`
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!code) throw new Error(`Missing canvas binding: ${name}`)
  const js = ts.transpileModule(`const result = ${code}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  return new Function(...Object.keys(env), `${js}; return result`)(...Object.values(env))
}
const timeline = () => [
  { id: 'opening', type: 0, content: 'Opening', chatFinish: true },
  { id: 'player', type: 1, content: 'Hello', chatFinish: true },
  { id: 'reply', type: 0, content: 'Original AI reply', chatFinish: true },
]
function bindings(locale: string, index = 2, preview = false, generatable = true) {
  const strings = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../locale/${locale}.json`), 'utf8'))
  const talkList = ref(timeline())
  const env = {
    computed, t: (key: string) => strings[key] || key, talkList, canGenerate: ref(generatable),
    menuIndex: ref(index), previewOnly: ref(preview), stageHost: {}, allowsStageAction,
    isOpeningIndex, isLatestCanonicalAIIndex: (i: number) => latestCanonicalAIIndex(talkList.value) === i,
    canEditResendPlayerIndex, canContinueFromIndex: () => false, archivesFull: ref(false),
    menuDraft: ref(''), menuEditing: ref(false),
  }
  return { strings, env, actions: actual('menuActions', env), labels: actual('messageLabels', env), pick: actual('onMenuPick', env) }
}

describe('manual AI reply editing has its own label', () => {
  for (const locale of ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko']) {
    it(`${locale}: the edit entry opens a draft and is distinct from regeneration`, async () => {
      vi.useFakeTimers()
      const { strings, env, actions, labels, pick } = bindings(locale)
      const menu = mount(CanvasMessageMenu, { props: { open: true, actions: actions.value, onPick: pick } })
      try {
        const edit = menu.find('[data-lt-action="edit"]')
        expect(edit.text()).toBe(strings['main.edit'])
        expect(edit.text()).not.toBe(strings['canvas.actions.regenerate'])
        expect(labels.value.edit).toBe(strings['main.edit'])
        expect(labels.value.regenerate).toBe(strings['canvas.actions.regenerate'])
        vi.advanceTimersByTime(401)
        await edit.trigger('click')
        await menu.setProps({ editing: env.menuEditing.value, draft: env.menuDraft.value })
        expect(menu.find('textarea').element.value).toBe('Original AI reply')
        expect(env.menuEditing.value).toBe(true)
      } finally { menu.unmount(); vi.useRealTimers() }
    })
  }
  it('keeps previews and the opening out of manual AI editing', () => {
    expect(bindings('en', 2, true).actions.value.map((a: any) => a.key)).toEqual(['copy'])
    expect(bindings('en', 0).actions.value.map((a: any) => a.key)).not.toContain('edit')
  })
  it('keeps closed owned history copy-only even with the separate edit label', () => {
    const { actions, env, pick } = bindings('en', 2, false, false)
    expect(actions.value.map((a: any) => a.key)).toEqual(['copy'])
    pick('edit')
    expect(env.menuEditing.value).toBe(false)
    expect(env.menuDraft.value).toBe('')
  })
})
