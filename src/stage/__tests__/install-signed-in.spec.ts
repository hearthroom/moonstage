// @vitest-environment jsdom
/**
 * 登入態以宿主給的為準：上次登入時存下的 hasLogin 不能讓這次的遊客被當成已登入。
 * 否則畫布會替遊客開對話、讀設定，全部 401，玩家看到一串「登入已過期」又停在載入畫面。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp } from 'vue'

async function install(user?: { id: string }) {
  vi.resetModules()
  const stage = await import('../index')
  const app = createApp({})
  await stage.installMoonStage(app, {
    host: stage.browserHost(),
    auth: { getAccessToken: async () => null, onUnauthorized: () => {}, user },
    api: { base: 'https://api.example.test' },
  })
  return app.config.globalProperties.$store as { state: { hasLogin: boolean } }
}

describe('installMoonStage 的登入態', () => {
  beforeEach(() => localStorage.clear())

  it('同一個瀏覽器上次登入過，這次以遊客掛上：hasLogin 是 false', { timeout: 60000 }, async () => {
    expect((await install({ id: '7' })).state.hasLogin).toBe(true)
    expect((await install()).state.hasLogin).toBe(false)
  })
})
