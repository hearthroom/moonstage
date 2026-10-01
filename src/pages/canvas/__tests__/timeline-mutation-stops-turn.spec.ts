import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveTimelineMutationGate } from '../chat-transport-ownership'

// 產品邊界（owner 2026-10-01）：回覆還在產生時按回溯／刪除＝先停止、再做。
// 回報的形狀：模型送了幾個字就沒下文，玩家按回溯被「請等待目前的聊天操作完成」擋住，
// F5 也接回同一輪，兩分鐘內什麼都不能做。停止永遠可用，回溯自己會去按。

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')
const readChat = () => read('src/pages/canvas/canvas.vue')

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex, `missing start marker: ${start}`).toBeGreaterThanOrEqual(0)
  expect(endIndex, `missing end marker: ${end}`).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

describe('resolveTimelineMutationGate', () => {
  it('lets a mutation through when nothing is running', () => {
    expect(resolveTimelineMutationGate({})).toBe('proceed')
    expect(resolveTimelineMutationGate(null)).toBe('proceed')
  })

  it('stops the running turn instead of refusing the mutation', () => {
    expect(resolveTimelineMutationGate({ isStreamActive: true })).toBe('stop_then_proceed')
    expect(resolveTimelineMutationGate({ isConnecting: true })).toBe('stop_then_proceed')
    expect(resolveTimelineMutationGate({ pendingChatTurn: { operationId: 'op' } })).toBe('stop_then_proceed')
    expect(resolveTimelineMutationGate({ pendingResendPayload: { payload: {} } })).toBe('stop_then_proceed')
    // 記憶整理也是這一輪的一部分，停止一樣會取消它。
    expect(resolveTimelineMutationGate({ isCompacting: true })).toBe('stop_then_proceed')
  })

  it('only waits for another rollback that is still being sent', () => {
    expect(resolveTimelineMutationGate({ rollbackPending: true })).toBe('wait')
    expect(resolveTimelineMutationGate({ rollbackPending: true, isStreamActive: true })).toBe('wait')
  })
})

describe('canvas timeline mutations stop the running turn first', () => {
  const chat = readChat()

  it('has one shared helper that stops the turn before a timeline mutation', () => {
    const helper = sliceBetween(chat, 'function stopRunningTurnForTimelineMutation', '\n}\n')
    expect(helper).toContain('resolveTimelineMutationGate(')
    expect(helper).toContain('sendStop()')
    expect(helper).toContain("'wait'")
  })

  it('rewind and delete go through the helper instead of refusing', () => {
    const rewind = sliceBetween(chat, 'function loadConversation(chatId)', 'function chatDelete(chatId)')
    const remove = sliceBetween(chat, 'function chatDelete(chatId)', '_this.http.post(_this.requestUrl.chatDelete')
    for (const entry of [rewind, remove]) {
      expect(entry).toContain('stopRunningTurnForTimelineMutation()')
      expect(entry).not.toContain('isTimelineMutationBlocked()')
    }
  })

  // 這一輪正在送的那句，本地 id 是時間戳；伺服器 id 在 chatId（accepted 事件寫上去）。
  // 停了之後倒回／刪除它，送的必須是伺服器 id，不然 400 之後回合停了、歷史沒動。
  it('rewind and delete send the server id of the in-flight user row', () => {
    const menu = sliceBetween(chat, "    case 'rewind':", "    default:")
    expect(menu).toContain('loadConversation(item.chatId || item.id)')
    expect(menu).toContain('chatDelete(item.chatId || item.id)')
  })

  // 改字重送的對象是這一輪正在送的那句：零輸出的停止會把它的本地氣泡整組移除，
  // 先停再接著做會送錯列。它維持原本的等待，不走 helper。
  it('edit-resend keeps waiting because its target is the in-flight row itself', () => {
    const editResend = sliceBetween(chat, 'function doEditResendPlayer(', 'const text = draft.trim()')
    expect(editResend).toContain('isTimelineMutationBlocked()')
    expect(editResend).not.toContain('stopRunningTurnForTimelineMutation()')
  })
})
