import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createConversationActivityReporter } from '../canvas-conversation-activity'

describe('persisted conversation activity', () => {
  const opening = { chatId: 'welcome', chatRole: 'AI', chatMessage: 'Welcome' }
  const player = { chatId: 'user-1', chatRole: 'USER', chatMessage: 'Hello' }
  it('does not treat opening text, blank sessions or provisional messages as played', () => {
    const emit = vi.fn(); const report = createConversationActivityReporter(emit)
    report('role', 'empty', [])
    report('role', 'empty', [opening])
    report('role', 'empty', [{ chatRole: 'USER', chatMessage: 'unsaved' }])
    expect(emit).not.toHaveBeenCalled()
  })
  it('keeps played history when a new blank session opens, and reports the new one only after a saved turn', () => {
    const emit = vi.fn(); const report = createConversationActivityReporter(emit)
    report('role', 'played', [player, opening])
    report('role', 'blank', [opening])
    report('role', 'played', [player, opening])
    expect(emit.mock.calls).toEqual([[{roleId:'role', conversationId:'played'}]])
    report('role', 'blank', [{ ...player, chatId:'user-2' }, opening])
    expect(emit).toHaveBeenLastCalledWith({roleId:'role', conversationId:'blank'})
    expect(emit).toHaveBeenCalledTimes(2)
  })
  it('recognizes persisted continue and thinking output, excluding empty generated shells and summaries', () => {
    const emit = vi.fn(); const report = createConversationActivityReporter(emit)
    report('role', 'continued', [{chatId:'ai-1',chatRole:'AI',chatMessage:'Next scene',model:'test'}])
    report('role', 'thinking', [{chatId:'ai-2',chatRole:'AI',contentThinking:'Thinking',hasContextUsage:true}])
    report('role', 'failed', [{chatId:'ai-3',chatRole:'AI',chatMessage:'',model:'test'}])
    report('role', 'summary', [{chatId:'summary',chatRole:'AI',chatMessage:'Summary',model:'test',isSummary:true}])
    expect(emit.mock.calls.map(([p])=>p.conversationId)).toEqual(['continued','thinking'])
  })
  it('hooks history readback and post-turn readback, not conversation creation', () => {
    const source = readFileSync('src/pages/canvas/canvas.vue','utf8')
    expect(source).toContain('reportConversationActivity(String(unref(roleId)), conversationIdAtHistoryRequest, chatList)')
    expect(source).toContain('reportConversationActivity(String(unref(roleId)), conversationAtSchedule, chats)')
    const start = source.slice(source.indexOf('function chatStart('), source.indexOf('function appendChatErrorBubble('))
    expect(start).not.toContain('reportConversationActivity(')
  })
})
