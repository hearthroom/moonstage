import { describe, expect, it, vi } from 'vitest'
import { dispatchSSEEvent } from '../chat-sse-dispatch'
import { applyTavernRules } from '../canvas-rule-engine-core'
import { convertVisibleHtml, createDisplayScriptConverter } from '../canvas-display-script'

const source = '状态：她穿着校服'
const rules = [{ find: '/状态：(.*)/', replace: '<section class="status">$1</section>' }]

function context(locale: string, resumed: boolean) {
  const tify = vi.fn(createDisplayScriptConverter('s2t'))
  const ctx: any = {
    currentChatId: { value: 'local-answer' }, replyContent: { value: '' }, thinkingContent: { value: '' },
    talkList: { value: [] }, lastFinishReason: { value: '' }, pendingMessageMeta: { value: null },
    tempContent: { value: '' }, isResumeInitial: { value: resumed }, userStopRequested: { value: false },
    pic: { value: '' }, formData: {}, tify, getLocale: () => locale,
    upsertPendingAIBubble: vi.fn(), nextTick: (cb: () => void) => cb(), scrollToBottom: vi.fn(),
    commitPendingChatOperationAfterVisibleDone: vi.fn(),
  }
  return ctx
}

describe('streaming answers reach author rules as original source', () => {
  for (const locale of ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko']) {
    it.each([false, true])(`${locale}, resume=%s: chunks and terminal preserve source`, (resumed) => {
      const ctx = context(locale, resumed)
      for (const content of ['状态：她穿', '着校服']) {
        dispatchSSEEvent({ event: 'answer', raw: '', data: { choices: [{ delta: { content } }] } } as any, ctx)
      }
      expect(ctx.replyContent.value).toBe(source)
      expect(ctx.upsertPendingAIBubble.mock.lastCall[0].content).toBe(source)
      dispatchSSEEvent({ event: 'answer', raw: '[DONE]', data: {} } as any, ctx)
      const final = ctx.upsertPendingAIBubble.mock.lastCall[0]
      expect(final).toMatchObject({ content: source, chatFinish: true, finishReason: 'stop' })
      expect(ctx.tify).not.toHaveBeenCalled()
      const html = applyTavernRules(final.content, rules).html
      expect(convertVisibleHtml(html, createDisplayScriptConverter('s2t')))
        .toBe('<section class="status">她穿著校服</section>')
    })

    it(`${locale}: legacy terminal preserves previously buffered source`, () => {
      const ctx = context(locale, true)
      ctx.replyContent.value = source
      dispatchSSEEvent({ event: 'message', raw: '[DONE]', data: {} } as any, ctx)
      expect(ctx.upsertPendingAIBubble.mock.lastCall[0]).toMatchObject({ content: source, chatFinish: true })
      expect(ctx.tify).not.toHaveBeenCalled()
    })
  }
})
