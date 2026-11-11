import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { transpileModule, ScriptTarget } from 'typescript'
import { afterEach, expect, it } from 'vitest'
import { compileCardCss, createCardCssMount, resolveCardCssAsset } from '@/common/card-css'
import { compileRuleCssDialects } from '@/common/rule-css-dialect'
import { scopeCardHtml } from '../canvas-style-scope'
import { hasCrossLineRule } from '@/utils/display-rule-engine.js'

const source = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
const body = source.slice(source.indexOf('function setActiveAuthorAsset(asset) {'), source.indexOf('// 每次套用規則都要帶同一組選項'))
const compiled = transpileModule(body, { compilerOptions: { target: ScriptTarget.ES2022 } }).outputText
afterEach(() => document.head.querySelectorAll('[data-lt="card-css"]').forEach(node => node.remove()))

it('一般頁走實際 setActiveAuthorAsset：空歷史也注入，更新與清空不殘留', () => {
  const sandboxCard = { value: false }
  const make = new Function('document', 'sandboxCard', 'compileCardCss', 'createCardCssMount', 'resolveCardCssAsset', 'compileRuleCssDialects', 'hasCrossLineRule', `
    let cardCssMount = null, authorScopeClosed = false;
    const activeAuthorAsset = {value:{}}, openingPage={value:''}, openingMode={value:''};
    function clearStreamCache(){}
    ${compiled}
    return {setActiveAuthorAsset, activeAuthorAsset};
  `)
  const state = make(document, sandboxCard, compileCardCss, createCardCssMount, resolveCardCssAsset, compileRuleCssDialects, hasCrossLineRule)
  state.setActiveAuthorAsset({ cardCss: '.mes{color:red}', rules: [] })
  const style = document.head.querySelector('style[data-lt="card-css"]')
  expect(style?.textContent).toContain('color:red')
  state.setActiveAuthorAsset({ cardCss: '.mes{color:blue}', rules: [] })
  expect(document.head.querySelectorAll('style[data-lt="card-css"]')).toHaveLength(1)
  expect(style?.textContent).toContain('color:blue')
  state.setActiveAuthorAsset({ cardCss: '', rules: [] })
  expect(document.head.querySelector('style[data-lt="card-css"]')).toBeNull()
  state.setActiveAuthorAsset({ rules: [{ id: 'hearthroom-fengyue-inner-css', find: '/([\\s\\S])$/', replace: '$1<style>#ai-chat-input{color:red}</style>' }] })
  expect(state.activeAuthorAsset.value.rules).toEqual([])
  expect(document.head.querySelector('style[data-lt="card-css"]')).not.toBeNull()
  for (const hint of [false, true]) {
    const carrier = { id: 'hearthroom-fengyue-inner-css', find: '/([\\s\\S])$/', replace: '$1<style>#ai-chat-input{background:#bde8f2}</style>', ...(hint ? { cssDialect: 'fengyue' } : {}) }
    const peer = { id: 'peer', find: carrier.find, replace: '$1<style>#ai-chat-input{background:#ff6600}</style>' }
    state.setActiveAuthorAsset({ cardFormat: 'fengyue', rules: [carrier, peer] })
    expect(state.activeAuthorAsset.value.rules[0].replace).toContain(':where(.composer-field)')
    expect(state.activeAuthorAsset.value.rules[1].replace).toBe(peer.replace)
    expect(scopeCardHtml(state.activeAuthorAsset.value.rules[1].replace, 'fengyue')).toBe(peer.replace)
    expect(document.head.querySelector('style[data-lt="card-css"]')).toBeNull()
  }
  sandboxCard.value = true
  state.setActiveAuthorAsset({ cardCss: '.mes{color:red}' })
  expect(document.head.querySelector('style[data-lt="card-css"]')).toBeNull()
})
