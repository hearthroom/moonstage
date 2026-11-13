import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { computed, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { capacityChoiceOptions, capacityContent } from '../canvas-capacity-choice'
import CanvasCapacityChoice from '../components/canvas-capacity-choice.vue'

// Execute the actual canvas computed, including its dependency wiring. Testing
// only capacityChoiceOptions missed a removed helper still used by this caller.
const source = readFileSync('src/pages/canvas/canvas.vue', 'utf8')
const script = source.slice(source.indexOf('<script setup lang="ts">') + 24, source.indexOf('</script>'))
const tree = ts.createSourceFile('canvas.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const statement = tree.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(tree) === 'capacityProps'))
if (!statement) throw Error('Missing canvas capacityProps')
const js = ts.transpileModule(statement.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

function props(advice: any, contextBudgetOptions: any = [{ value: 3, tokens: 128000 }]) {
  const ctx: any = {
    computed, capacityChoiceOptions, capacityContent,
    capacitySpec: ref({ advice, saving: false, error: '' }),
    selectedVariant: ref({ contextBudgetOptions }),
    t: (key: string, params?: any) => params?.size ? `${key}:${params.size}` : key,
  }
  runInNewContext(`${js}\nthis.capacityProps = capacityProps`, ctx)
  return ctx.capacityProps.value
}

describe('canvas capacity sheet props', () => {
  it('a capacity error opens a usable sheet with the selected lane tier size', async () => {
    const value = props({ requiredTier: 3, requiredTokens: null, trimFits: true })
    const w = mount(CanvasCapacityChoice, { props: value })
    try {
      expect(w.find('.capacity-option-label').text()).toBe('canvas.capacity.raise:128K')
      expect(w.findAll('.capacity-option')).toHaveLength(2)
      await w.find('.capacity-option').trigger('click')
      expect(w.emitted('pick')).toEqual([['raise']])
    } finally { w.unmount() }
  })

  it('uses the server size when present and safely handles a missing catalog tier', () => {
    expect(props({ requiredTier: 3, requiredTokens: 96000, trimFits: false }).options[0].label).toBe('canvas.capacity.raise:96K')
    expect(props({ requiredTier: 3, requiredTokens: null, trimFits: false }, []).options[0].label).toBe('canvas.capacity.raiseNoSize')
    expect(props({ requiredTier: 3, requiredTokens: null, trimFits: false }, null).options[0].label).toBe('canvas.capacity.raiseNoSize')
  })

  it('does not require a model when no capacity advice is open', () => {
    expect(props(null, null).options).toEqual([])
  })
})
