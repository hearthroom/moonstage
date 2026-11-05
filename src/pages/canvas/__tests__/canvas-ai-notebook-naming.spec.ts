/**
 * 「＋」選單裡那一項只有一個名字：AI 記事本（owner 2026-11-06）。
 *
 * 清單裡的記錄只有 Agent 模式會寫（伺服器唯一的寫入點是 Agent 的記事本工具），一般模式
 * 不會抽取、也不會讀它。先前沒開 Agent 時叫「永久記憶」、說明寫「記憶會從對話中自動
 * 提取」，玩家聊了 59 輪面板仍是空的，以為壞掉。所以：名字不分模式；沒開 Agent 時說明與
 * 空態講清楚要開 Agent 模式，並給一顆鍵去既有的模型面板開它。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')
const panels = fs.readFileSync(path.resolve(__dirname, '../../../sandbox/render/panels.ts'), 'utf8')
const LOCALES = ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko']
const locale = (l: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../locale/${l}.json`), 'utf8'))

function block(start: string, end: string): string {
  const a = source.indexOf(start)
  expect(a).toBeGreaterThan(-1)
  const b = source.indexOf(end, a + start.length)
  expect(b).toBeGreaterThan(a)
  return source.slice(a, b)
}

describe('AI 記事本：名字不分模式', () => {
  it('「＋」選單那一項一律叫 AI 記事本', () => {
    const line = source.split('\n').find((l) => /\{ key: 'memory', label:/.test(l)) || ''
    expect(line).toContain("t('chat.aiNotebookEntry')")
    expect(line).not.toContain('deepPrepOn')
  })

  it('彈窗標題一律是 AI 記事本；刪除確認不再說「可能會再次被提取」', () => {
    const labels = block('const memoryLabels = computed(', '\n}))')
    expect(labels).toMatch(/title: t\('chat\.aiNotebookTitle'\)/)
    expect(source).not.toMatch(/chat\.(permanentMemory|memoryTip|memoryEmpty|memoryDeleteConfirm)\b/)
  })

  it('沒開 Agent 時說明與空態換成講 Agent 模式的那兩句，並給前往開啟的鍵', () => {
    const labels = block('const memoryLabels = computed(', '\n}))')
    expect(labels).toContain("t('chat.aiNotebookAgentOffDesc')")
    expect(labels).toContain("t('chat.aiNotebookAgentOffEmpty')")
    expect(labels).toContain("t('chat.aiNotebookEnableAgent')")
  })

  it('前往開啟的鍵只在真的開得了時出現，按下去打開既有的模型面板', () => {
    const gate = block('const memoryCanEnableAgent = computed(', '\n})')
    expect(gate).toContain('!deepPrepOn.value')
    expect(gate).toContain('multiPassRuntimeEnabled.value')
    expect(gate).toMatch(/capabilities\?\.agentMode !== false/)
    expect(gate).toMatch(/allowsStagePanel\(stageHost\.capabilities, 'model'\)/)
    expect(gate).toContain('previewOnly.value')
    const open = block('function onMemoryEnableAgent(', '\n}')
    expect(open).toContain('openModelSelect()')
  })

  it('沙箱卡同一顆鍵：殼放行事件、宿主接手', () => {
    expect(panels).toMatch(/memory: \[[^\]]*'enable-agent'/)
    const sandbox = block("    case 'memory':\n      if (event === 'toggle-expand')", '      return;')
    expect(sandbox).toContain("event === 'enable-agent'")
    expect(sandbox).toContain('onMemoryEnableAgent()')
  })
})

describe('AI 記事本：五語', () => {
  const NEW = ['chat.aiNotebookAgentOffDesc', 'chat.aiNotebookAgentOffEmpty', 'chat.aiNotebookEnableAgent']
  const GONE = [
    'chat.permanentMemory', 'chat.memoryTip', 'chat.memoryEmpty', 'chat.memoryDeleteConfirm',
    'chat.permanent_memory_vip_tips', 'chat.memoryRequiresMember', 'roleDetail.permanentMemory',
    'roleDetail.permanentMemoryVipOnly', 'chat.aiNotebookTip', 'chat.aiNotebookBadge',
  ]
  for (const l of LOCALES) {
    it(`${l}：新字齊全且提到 Agent 模式的介面名；舊的「自動提取」與會員字串已移除`, () => {
      const dict = locale(l)
      const agent = dict['modelSelect.deepPrepLabel']
      expect(agent).toBeTruthy()
      for (const k of NEW) expect(String(dict[k] || '').length, k).toBeGreaterThan(0)
      expect(dict['chat.aiNotebookAgentOffDesc']).toContain(agent)
      expect(dict['chat.aiNotebookEnableAgent']).toContain(agent)
      for (const k of GONE) expect(dict, k).not.toHaveProperty(k)
    })
  }
})
