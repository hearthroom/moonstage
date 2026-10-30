import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { conversationRoleId, settingsRoleFor } from '../canvas-role-settings'
import { syncStartedModelSettings } from '../canvas-model-preference'

// 託管卡每次作者更新都是新的 role id。頁面可能還停在舊版，伺服器開局時會把玩家接回
// 較新版本上的那段對話；生成照「對話所屬那一版」讀卡片層設定（人設、指示、多步生成⋯）。
// 面板若照頁面那一版讀寫，玩家改的人設就存到生成不會讀的地方（2026-10-30 Discord 回報）。

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
function fn(source: string, start: string): string {
  const at = source.indexOf(start)
  expect(at, `missing ${start}`).toBeGreaterThanOrEqual(0)
  const next = source.indexOf('\nfunction ', at + start.length)
  const nextAsync = source.indexOf('\nasync function ', at + start.length)
  const ends = [next, nextAsync].filter((i) => i > 0)
  return source.slice(at, ends.length ? Math.min(...ends) : undefined)
}

describe('card settings follow the conversation revision', () => {
  it('reads the conversation role from start and owned-conversation responses', () => {
    expect(conversationRoleId({ roleInfo: { roleId: 'rev-6' } })).toBe('rev-6')
    expect(conversationRoleId({ roleId: 'rev-6' })).toBe('rev-6')
    expect(conversationRoleId({})).toBe('')
    expect(conversationRoleId(null)).toBe('')
  })

  it('targets the conversation revision when known, the page card otherwise', () => {
    expect(settingsRoleFor('rev-5', 'rev-6')).toBe('rev-6')
    expect(settingsRoleFor('rev-5', '')).toBe('rev-5')
  })

  it('reloads settings on a resumed start whose conversation lives on another revision', async () => {
    const reload = vi.fn(async () => {}), notify = vi.fn()
    await syncStartedModelSettings({ historyConversation: true }, null, reload, notify, true)
    expect(reload).toHaveBeenCalledOnce()
    expect(notify).not.toHaveBeenCalled()
  })

  it('reads and writes every conversation-backed card setting through the settings target', () => {
    const canvas = read('src/pages/canvas/canvas.vue')
    expect(fn(canvas, 'async function loadRoleSettings(')).toContain('unref(settingsRoleId)')
    expect(fn(canvas, 'async function persistRoleSettings(')).toContain('String(unref(settingsRoleId)')
    expect(fn(canvas, 'async function loadMultiPassPreference(')).toContain('unref(settingsRoleId)')
    expect(fn(canvas, 'async function loadModelCatalog(')).toContain('roleId: unref(settingsRoleId)')
  })

  it('follows the conversation revision on start, new save, switch and fork', () => {
    const canvas = read('src/pages/canvas/canvas.vue')
    expect(fn(canvas, 'function chatStart(')).toContain('followConversationRole(conversationRoleId(res.data))')
    expect(fn(canvas, 'function adoptStartedConversation(')).toContain('followConversationRole(conversationRoleId(started))')
    expect(fn(canvas, 'function adoptConversation(')).toContain('syncConversationRole(nextId)')
  })
})
