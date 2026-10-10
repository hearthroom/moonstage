/**
 * 輸入框旁的小圓環一進頁面就會自己讀用量。那條路要登入：遊客或作者預覽撞到 401 會被整頁
 * 送去登入，所以沒登入、預覽中都不能發。跑的是 canvas.vue 裡真正的那段，不是重寫一份。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { ref, unref } from 'vue'
import { normalizeServerReport } from '../canvas-context-breakdown'

const canvas = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
const block = canvas.slice(canvas.indexOf('const latestContextReport'), canvas.indexOf('const contextRing = computed'))
const js = ts.transpileModule(block, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

function harness(signedIn: boolean, preview = false) {
  const get = vi.fn(async () => ({ statusCode: 200, data: { supported: true, status: 'ok', items: [], total: {}, window: { available: true, usedTokens: 10, limitTokens: 100, compactAtTokens: 92, turnsLeft: 3 } } }))
  const bindings: Record<string, any> = {
    ref, unref, normalizeServerReport, watch: () => {},
    conversationId: ref('conv-1'), hasLogin: ref(signedIn), previewOnly: ref(preview),
    _this: { http: { get }, requestUrl: { promptDiagnostics: '/conversation/prompt-diagnostics' } },
  }
  const run = new Function(...Object.keys(bindings), js + '\nreturn { refreshContextRing, latestContextReport };')(...Object.values(bindings))
  return { ...run, get }
}

describe('上下文用量小圓環的讀取', () => {
  it('遊客與作者預覽不發請求', async () => {
    for (const app of [harness(false), harness(true, true)]) {
      await app.refreshContextRing()
      expect(app.get).not.toHaveBeenCalled()
      expect(app.latestContextReport.value).toBeNull()
    }
  })

  it('登入後讀最新一輪，不帶 chatId', async () => {
    const app = harness(true)
    await app.refreshContextRing()
    expect(app.get).toHaveBeenCalledOnce()
    expect((app.get.mock.calls[0] as any[])[1].data).toEqual({ conversationId: 'conv-1', breakdownVersion: 2 })
    expect(app.latestContextReport.value.window.usedTokens).toBe(10)
  })
})
