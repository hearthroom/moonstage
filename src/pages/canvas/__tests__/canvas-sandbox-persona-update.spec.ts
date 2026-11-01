import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { nextTick, reactive, ref, unref, watch } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { asPersonaMode, buildRoleSettingsSavePayload, ROLE_SETTINGS_DEFAULTS } from '../canvas-role-settings'
import { resolvePlayerName } from '../canvas-rule-engine'

// 跑實際 canvas 保存函式與名稱 watcher，HTTP 只替換為成功的合成設定服務。
const source = readFileSync('src/pages/canvas/canvas.vue', 'utf8')
const script = source.slice(source.indexOf('<script setup lang="ts">') + 24, source.indexOf('</script>'))
const tree = ts.createSourceFile('canvas.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const names = ['onSavePersona', 'persistGlobalPersona', 'persistRoleSettings', 'currentRoleSettings', 'effectivePersonaFields', 'userDisplayName']
const handlers = names.map(name => {
  const node = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  if (!node) throw Error(`Missing canvas handler: ${name}`)
  return node.getText(tree)
}).join('\n')
const watcher = tree.statements.find(n => ts.isExpressionStatement(n) && n.getText(tree).startsWith('watch(() => sandboxHostRef.value ? userDisplayName()'))
if (!watcher) throw Error('Missing sandbox name watcher')

it('全局人設保存後由真實 watcher 送新稱呼；連續改名可用、同名不送、卡級值不改寫', async () => {
  const postUserName = vi.fn(), posts: { url: string; data: unknown }[] = []
  const ctx: any = {
    asPersonaMode, buildRoleSettingsSavePayload, resolvePlayerName, unref, watch,
    formData: reactive({ ...ROLE_SETTINGS_DEFAULTS, personaMode: 'global', userName: 'Saved card name' }),
    roleSettingsSnapshot: { ...ROLE_SETTINGS_DEFAULTS, personaMode: 'global', userName: 'Saved card name' },
    globalPersona: ref({ userName: 'GlobalOld', userSex: '', userDefine: '' }),
    conversationPersona: ref({ exists: false }), userInfo: ref({ nickName: 'Nickname' }),
    roleView: ref({ userName: '' }), settingsRoleId: ref('synthetic-card'),
    personaSaving: ref(false), personaError: ref(''), sandboxHostRef: ref({ postUserName }),
    ensureRoleSettings: vi.fn(async () => {}), closeCanvasSheet: vi.fn(),
    sandboxStatusbarHtml: () => `<b>${ctx.userDisplayName()}</b>`, t: (key: string) => key,
    uni: { showToast: vi.fn() },
    _this: {
      requestUrl: { playerPersonaSave: '/persona/save', playerRoleSettingsSave: '/settings/save' },
      http: { post: vi.fn(async (url: string, options: { data: unknown }) => {
        posts.push({ url, data: options.data }); return { statusCode: 200 }
      }) },
    },
  }
  const js = ts.transpileModule(`${handlers}\n${watcher.getText(tree)}\nthis.stopWatcher = undefined`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  // 接住實際 watcher 的 stop 函式，避免本用例留下訂閱。
  ctx.watch = (...args: Parameters<typeof watch>) => { const stop = (watch as any)(...args); ctx.stop = stop; return stop }
  runInNewContext(js, ctx)
  try {
    for (const name of ['GlobalNew', 'GlobalThird', 'GlobalFourth']) {
      await ctx.onSavePersona({ personaMode: 'global', userName: name })
      await nextTick()
      expect(postUserName).toHaveBeenLastCalledWith(name, `<b>${name}</b>`)
      expect(ctx.userDisplayName()).toBe(name)
    }
    expect(postUserName).toHaveBeenCalledTimes(3)
    expect(posts).toEqual(['GlobalNew', 'GlobalThird', 'GlobalFourth'].map(userName => ({ url: '/persona/save', data: { userName } })))
    expect(ctx.formData.userName).toBe('Saved card name')
    await ctx.onSavePersona({ personaMode: 'global', userName: 'GlobalFourth' })
    await nextTick()
    expect(postUserName).toHaveBeenCalledTimes(3)
    expect(posts).toHaveLength(3)
    expect(ctx.personaError.value).toBe('')
  } finally { ctx.stop() }
})
