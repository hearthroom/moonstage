// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createScriptTagLoader } from '../display-script'
import { createDisplayScriptConverter } from '@/pages/canvas/canvas-display-script'
import { createShell } from '../shell'
import type { RuleRunner } from '@/common/author-rules'

type DictionaryWindow = Window & { __msDisplayScript?: { create: typeof createDisplayScriptConverter } }
const win = window as DictionaryWindow

afterEach(() => {
  delete win.__msDisplayScript
  document.head.querySelectorAll('script[src="./sandbox-zh.js"]').forEach((tag) => tag.remove())
  vi.useRealTimers()
})

describe('字典的真實載入結果', () => {
  it('慢於十秒的成功載入仍完成轉換，不先把 ready 固定成原文', async () => {
    vi.useFakeTimers()
    const ready = createScriptTagLoader(document, window)('s2t')
    const settled = vi.fn()
    void ready.then(settled)
    await vi.advanceTimersByTimeAsync(11_000)
    expect(settled).not.toHaveBeenCalled()

    win.__msDisplayScript = { create: createDisplayScriptConverter }
    document.head.querySelector('script[src="./sandbox-zh.js"]')!.dispatchEvent(new Event('load'))
    const convert = await ready
    expect(convert?.('音乐：关闭／读取／旧版对话')).toBe('音樂：關閉／讀取／舊版對話')
  })

  it.each([
    ['zh-Hans', 'zh-Hant', '音乐：关闭／读取／旧版对话', '音樂：關閉／讀取／舊版對話'],
    ['zh-Hant', 'zh-Hans', '音樂：關閉／讀取／舊版對話', '音乐：关闭／读取／旧版对话'],
  ])('殼：%s 卡、%s 玩家在慢速載入後 SDK 與正文一起轉換', async (cardLanguage, locale, source, expected) => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="app"></div>'
    const ruleRunner = {
      display: (job: { text: string }) => ({ html: job.text, provisional: false }),
      onSettled: () => () => {},
    } as unknown as RuleRunner
    const shell = createShell({
      doc: document, win: window, mount: document.getElementById('app')!,
      config: {
        theme: 'dark', locale, cardLanguage,
        role: { name: 'A', avatarUrl: '' }, user: { nickname: 'B', avatarUrl: '' },
        card: { rules: [], statusbar: '' }, capabilities: { saves: false, edit: false, send: true },
      },
      transport: { send: () => {} }, ruleRunner,
    })
    try {
      shell.handle({ type: 'messages', messages: [{ id: 'm1', role: 'ai', content: source, state: 'done' }] })
      const settled = vi.fn()
      void shell.sdk.text.ready().then(settled)
      await vi.advanceTimersByTimeAsync(11_000)
      expect(shell.sdk.user.get().locale).toBe(locale)
      expect(shell.sdk.text.convert(source)).toBe(source)
      expect(settled).not.toHaveBeenCalled()

      win.__msDisplayScript = { create: createDisplayScriptConverter }
      document.head.querySelector('script[src="./sandbox-zh.js"]')!.dispatchEvent(new Event('load'))
      await shell.sdk.text.ready()
      await vi.advanceTimersByTimeAsync(100)
      expect(shell.sdk.text.convert(source)).toBe(expected)
      expect(document.body.textContent).toContain(expected)
    } finally {
      shell.dispose()
    }
  })

  it('確定載入失敗時完成為原文，頁面仍可使用', async () => {
    const ready = createScriptTagLoader(document, window)('s2t')
    document.head.querySelector('script[src="./sandbox-zh.js"]')!.dispatchEvent(new Event('error'))
    await expect(ready).resolves.toBeNull()
  })

  it('已載好的字典可供下一次轉換，不另發請求', async () => {
    win.__msDisplayScript = { create: createDisplayScriptConverter }
    const convert = await createScriptTagLoader(document, window)('t2s')
    expect(convert?.('音樂：關閉／讀取／舊版對話')).toBe('音乐：关闭／读取／旧版对话')
    expect(document.head.querySelector('script[src="./sandbox-zh.js"]')).toBeNull()
  })
})
