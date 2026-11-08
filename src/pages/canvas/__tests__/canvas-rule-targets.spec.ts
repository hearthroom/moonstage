import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { transpileModule } from 'typescript'
import { createRuleRunner } from '@/common/author-rules'
import { substituteMacros } from '../canvas-rule-engine-core'

const source = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')

// 執行真實 caller：normal 渲染與 sandbox 宿主的 view.html 都經 renderMarkdown。
function renderWithCanvasCaller(rules: unknown[]) {
  const authorSource = source.slice(source.indexOf('const authorRules = {'), source.indexOf('// ── 新版沙箱卡', source.indexOf('const authorRules = {')))
  const markdownSource = source.slice(source.indexOf('const renderMarkdown = (item) => {'), source.indexOf('function onConfirmStartNewConversation()', source.indexOf('const renderMarkdown = (item) => {')))
  const context = vm.createContext({
    activeAuthorAsset: { value: { rules, version: 1 } },
    substituteMacros,
    authorRuleOptions: () => ({}),
    authorRuleRunner: createRuleRunner({ executor: null }),
    unref: (value: any) => value,
    conversationId: '',
    randomSeedFor: () => '',
    renderSummary: () => '摘要原樣',
  })
  const code = `${authorSource}\n${markdownSource}\nfunction highlightText(text, type) { return authorRules.display(text, false, type); }\nrenderMarkdown;`
  return new vm.Script(transpileModule(code, { compilerOptions: { target: 7 } }).outputText).runInContext(context)
}

describe('畫布訊息種類傳給顯示規則', () => {
  it('只套 AI：玩家、systemOnly 系統列保持原文，摘要仍跳過規則', () => {
    const render = renderWithCanvasCaller([{ find: '戰報', replace: '折疊', targets: ['ai'] }])
    expect(render({ content: '戰報', type: 0, chatFinish: true })).toBe('折疊')
    expect(render({ content: '戰報', type: 1, chatFinish: true })).toBe('戰報')
    expect(render({ content: '戰報', type: 0, systemOnly: true, chatFinish: true })).toBe('戰報')
    expect(render({ content: '戰報', type: 0, isSummary: true })).toBe('摘要原樣')
  })
  it('只套系統：type 0 的 systemOnly 列套用，AI 與玩家不套用', () => {
    const render = renderWithCanvasCaller([{ find: '戰報', replace: '折疊', targets: ['system'] }])
    expect(render({ content: '戰報', type: 0, systemOnly: true, chatFinish: true })).toBe('折疊')
    expect(render({ content: '戰報', type: 0, chatFinish: true })).toBe('戰報')
    expect(render({ content: '戰報', type: 1, chatFinish: true })).toBe('戰報')
  })
})

it('訊息的角色改變時，定稿顯示快取不沿用先前角色的產物', () => {
  const begin = source.indexOf('function renderMemoKey(item) {')
  const end = source.indexOf('/** 這一列目前畫的是不是暫時的規則結果', begin)
  const context = vm.createContext({ activeAuthorAsset: { value: { random: false, version: 1 } }, displayScriptDirection: { value: '' }, sandboxCard: { value: false }, authorRuleEpoch: { value: 1 } })
  const { key, hit } = new vm.Script(`(function(){ ${source.slice(begin, end)}; return { key: renderMemoKey, hit: renderMemoHit }; })()`).runInContext(context)
  const ai = key({ type: 0, content: '戰報', chatFinish: true })
  expect(hit({ key: ai }, key({ type: 1, content: '戰報', chatFinish: true }))).toBe(false)
  expect(hit({ key: ai }, key({ type: 0, systemOnly: true, content: '戰報', chatFinish: true }))).toBe(false)
})
