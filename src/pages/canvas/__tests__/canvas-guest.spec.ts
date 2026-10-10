/**
 * 遊客在對話頁（owner 2026-10-10）：沒登入也能看開場白、左右挑開場白、點開場選項、打字；
 * 只有按下送出那一下才請宿主登入。登入是整頁來回，回來時剛才打的字與挑的開場白要還在。
 *
 * 要擋住的事：
 *   一、遊客進場不能打任何要登入的請求（讀遊玩設定、開對話）——被拒會把他整頁送去登入。
 *   二、草稿只還給同一張卡，而且不能放太久；拿過一次就清掉，不會每次進場都冒出來。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { saveGuestDraft, takeGuestDraft, GUEST_DRAFT_TTL_MS } from '../canvas-guest'

function memory() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v) },
    removeItem: (k: string) => { data.delete(k) },
    size: () => data.size,
  }
}

describe('遊客草稿', () => {
  it('同一張卡拿得回來，拿過就清掉', () => {
    const s = memory()
    saveGuestDraft(s, { roleId: 'r1', content: '我走過去打招呼', greetingIndex: 2 }, 1000)
    expect(takeGuestDraft(s, 'r1', 2000)).toEqual({ roleId: 'r1', content: '我走過去打招呼', greetingIndex: 2, savedAt: 1000 })
    expect(takeGuestDraft(s, 'r1', 2000)).toBeNull()
  })

  it('別張卡拿不到，而且照樣清掉', () => {
    const s = memory()
    saveGuestDraft(s, { roleId: 'r1', content: 'hi', greetingIndex: 0 }, 1000)
    expect(takeGuestDraft(s, 'r2', 2000)).toBeNull()
    expect(s.size()).toBe(0)
  })

  it('放太久就不還', () => {
    const s = memory()
    saveGuestDraft(s, { roleId: 'r1', content: 'hi', greetingIndex: 0 }, 1000)
    expect(takeGuestDraft(s, 'r1', 1000 + GUEST_DRAFT_TTL_MS + 1)).toBeNull()
  })

  it('沒有儲存空間或內容壞了：當沒有，不丟錯', () => {
    expect(() => saveGuestDraft(null, { roleId: 'r1', content: 'hi', greetingIndex: 0 })).not.toThrow()
    expect(takeGuestDraft(null, 'r1')).toBeNull()
    const s = memory()
    s.setItem('moonstage-guest-draft', '{壞掉')
    expect(takeGuestDraft(s, 'r1')).toBeNull()
  })
})

describe('畫布接線', () => {
  const canvas = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
  const boot = canvas.slice(canvas.indexOf('function bootRole('), canvas.indexOf('const chatContainerRef'))

  it('遊客進場不讀遊玩設定、不開對話：只畫開場白，等送出', () => {
    expect(boot).toMatch(/if \(unref\(hasLogin\)\) \{[^}]*ensureRoleSettings\(\)\.then\(loadModelCatalog\)/s)
    const guestBranch = boot.slice(boot.indexOf('if (!unref(hasLogin))'))
    expect(guestBranch.indexOf('renderGreetingPreview()')).toBeGreaterThan(-1)
    expect(guestBranch.indexOf('return')).toBeLessThan(guestBranch.indexOf('chatStart()'))
  })

  it('進場時把同一張卡的草稿拿回來（開場白選到哪、輸入框的字）', () => {
    expect(boot).toContain('takeGuestDraft(')
  })

  it('沙箱卡與畫布的送出鈕先開對話再送：遊客不開對話（要登入、會被拒而卡住），直接交給送出的登入檢查', () => {
    const start = canvas.slice(canvas.indexOf('async function startPendingGreeting()'), canvas.indexOf('async function onCanvasSend()'))
    const guard = start.indexOf('if (!unref(hasLogin)) return true')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(start.indexOf('chatStart('))
  })

  it('沙箱卡送出：遊客回「沒送出」（HOST_DENIED），作者的腳本才不會一直等回覆', () => {
    const line = canvas.split('\n').find((l) => l.includes('sendMessage: (text) =>')) || ''
    expect(line).toContain('unref(hasLogin)')
    expect(line).toMatch(/return signedIn/)
  })

  it('遊客送出：先存草稿，再請宿主登入', () => {
    const send = canvas.slice(canvas.indexOf('function send() {'), canvas.indexOf('function send() {') + 2500)
    const guard = send.slice(send.indexOf('if (!unref(hasLogin))'))
    expect(guard.indexOf('saveGuestDraft(')).toBeGreaterThan(-1)
    expect(guard.indexOf('saveGuestDraft(')).toBeLessThan(guard.indexOf("uni.$emit('notLogin'"))
  })
})

describe('宿主接點', () => {
  it('送出要登入時優先叫 onSignInRequired（沒給才退回 onUnauthorized）', () => {
    const index = readFileSync(resolve(__dirname, '../../../stage/index.ts'), 'utf8')
    expect(index).toMatch(/onSignInRequired\?\(\): void/)
    expect(index).toMatch(/host\.events\.on\('notLogin', \(\) => \(auth\.onSignInRequired \?\? auth\.onUnauthorized\)\(\)\)/)
  })
})
