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

// 跑 canvas.vue 裡真正的處理函式（同 owned-history.spec 的做法），驗證換版那段重讀期間的行為。
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { computed, ref } from 'vue'
import * as roleSettings from '../canvas-role-settings'

const canvasSource = fs.readFileSync('src/pages/canvas/canvas.vue', 'utf8')
const setup = canvasSource.slice(canvasSource.indexOf('<script setup lang="ts">') + 24, canvasSource.indexOf('</script>'))
const tree = ts.createSourceFile('canvas.ts', setup, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
function load(names: string[], ctx: any) {
  const js = names.map((name) => {
    const node = tree.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name)
    if (!node) throw Error(`Missing actual handler ${name}`)
    return ts.transpileModule(node.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  }).join('\n')
  runInNewContext(`${js}\n${names.map((n) => `this.${n} = ${n}`).join(';')}`, ctx)
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

function harness() {
  const settingsRead = deferred<any>()
  const posts: any[] = []
  const roleId = ref('rev-5'), conversationRole = ref(''), conversationId = ref('conv')
  const ctx: any = {
    ...roleSettings,
    roleId, conversationRole, conversationId,
    settingsRoleId: computed(() => roleSettings.settingsRoleFor(roleId.value, conversationRole.value)),
    formData: { ...roleSettings.ROLE_SETTINGS_DEFAULTS, roleId: 'rev-5', selectModel: 'model-a', personaMode: 'custom', userName: 'Old name' },
    roleSettingsSnapshot: { ...roleSettings.ROLE_SETTINGS_DEFAULTS, selectModel: 'model-a', personaMode: 'custom', userName: 'Old name' },
    roleSettingsReady: ref(true), roleSettingsInFlight: null,
    globalPersona: ref({}), conversationPersona: ref({}), playerNickName: ref(''), defaultJailbreak: ref(''),
    readConversationPersona: (v: any) => v,
    loadModelCatalog: vi.fn(), loadMultiPassPreference: vi.fn(),
    unref: (r: any) => (r && typeof r === 'object' && 'value' in r ? r.value : r),
    uni: { showToast: vi.fn() }, t: (s: string) => s, console,
    _this: {
      requestUrl: { ownedConversation: '/owned', playerRoleSettings: '/settings', playerRoleSettingsSave: '/settings/save' },
      http: {
        get: vi.fn(async (url: string, opts: any) => {
          if (url === '/owned') return { statusCode: 200, data: { conversationId: opts.data.conversationId, roleId: 'rev-6' } }
          return settingsRead.promise
        }),
        post: vi.fn(async (_url: string, opts: any) => { posts.push(opts.data); return { statusCode: 200 } }),
      },
    },
  }
  load(['currentRoleSettings', 'loadRoleSettings', 'ensureRoleSettings', 'followConversationRole', 'reloadSettingsForRevision', 'syncConversationRole', 'persistRoleSettings'], ctx)
  return { ctx, posts, settingsRead }
}

describe('switching onto another revision mid-session', () => {
  it('a save while the new revision is still loading carries only what the player changed, to that revision', async () => {
    const { ctx, posts, settingsRead } = harness()
    const sync = ctx.syncConversationRole('conv')
    await vi.waitFor(() => expect(ctx._this.http.get).toHaveBeenCalledWith('/settings', expect.anything()))
    expect(ctx.settingsRoleId.value).toBe('rev-6')

    ctx.formData.userName = 'New name'
    const saved = ctx.persistRoleSettings()
    settingsRead.resolve({ statusCode: 200, data: { selectModel: 'model-b', personaMode: 'custom', userName: 'Old name' } })
    await Promise.all([sync, saved])

    expect(posts).toHaveLength(1)
    expect(posts[0].roleId).toBe('rev-6')
    expect(posts[0].userName).toBe('New name')
    expect(posts[0]).not.toHaveProperty('selectModel')
  })

  it('tracks the revision reload as the in-flight settings read', async () => {
    const { ctx, settingsRead } = harness()
    const sync = ctx.syncConversationRole('conv')
    await vi.waitFor(() => expect(ctx.roleSettingsInFlight).not.toBeNull())
    expect(ctx.ensureRoleSettings()).toBe(ctx.roleSettingsInFlight)
    settingsRead.resolve({ statusCode: 200, data: { selectModel: 'model-b' } })
    await sync
    expect(ctx.roleSettingsReady.value).toBe(true)
    expect(ctx.formData.selectModel).toBe('model-b')
  })

  it('looks the conversation up quietly: a failed lookup keeps the current revision without a toast', () => {
    expect(fn(read('src/pages/canvas/canvas.vue'), 'async function syncConversationRole(')).toContain('quietErrors: true')
  })

  it('the model sheet (agent mode toggle, catalog) targets the same revision as the settings', () => {
    const canvas = read('src/pages/canvas/canvas.vue')
    const sheet = canvas.slice(canvas.indexOf('<CanvasModelPanel\n        mode="model"'), canvas.indexOf('/>', canvas.indexOf('<CanvasModelPanel\n        mode="model"')))
    expect(sheet).toContain(':role-id="settingsRoleId"')
    expect(fn(canvas, 'function onMultiPassPreferenceUpdated(')).toContain('unref(settingsRoleId)')
  })
})
