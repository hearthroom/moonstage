/**
 * 送出後一個字都沒回就失敗（伺服器說這一輪失敗、沒有 AI 回覆）：玩家自己那句不能先消失。
 *
 * 先前即時收尾把玩家那句連同空的 AI 占位一起拿掉，接著要把失敗卡插在「玩家那句」後面時
 * 找不到它，卡也插不上——畫面上那一句與失敗卡要等歷史重新載入才一起長回來。一般卡是閃一下，
 * 沙箱卡的殼會把玩家那則整個拆掉再重建（作者腳本收到 unmount／new）。
 *
 * 伺服器已經收下的那句（accepted 帶回它的 chatId）在伺服器上就在：留著，只拿掉空的 AI 占位，
 * 失敗卡就插在它後面。還沒被收下的那句照舊整組拿掉（伺服器上沒有它）。
 */
import { describe, it, expect } from 'vitest'
import { settleZeroOutputTerminalFailure } from '../chat-operation-ui-state'
import { mergeChatHistoryOperationProjections } from '../chat-transport-ownership'

const opening = { id: 'a0', chatId: 'a0', type: 0, content: '開場', chatFinish: true }
const placeholder = { id: 1002, operationBubbleId: 1002, type: 0, content: '', thinkingContent: '', chatLoading: true, chatFinish: false }
const failedSend = {
  operationId: 'op-1', kind: 'send', state: 'failed_retryable', version: 3, sourceChatId: 'u-1',
  allowedActions: ['retry', 'switch_model'], reasonCode: 'temporary_failure', failureCause: 'service_unavailable',
}

describe('送出零輸出失敗：玩家那句跟失敗卡一起留在畫面上', () => {
  it('伺服器收下的那句留著、只拿掉空的 AI 占位；失敗卡緊接在它後面', () => {
    const line = { id: 1001, chatId: 'u-1', type: 1, content: '看向窗外', serverAccepted: true, transportTransient: false }
    const settled = settleZeroOutputTerminalFailure([opening, line, placeholder], { operationKind: 'send', userBubbleId: 1001, aiBubbleId: 1002 })
    expect(settled.map((row) => row.id)).toEqual(['a0', 1001])
    expect(settled[1]).toBe(line)

    const merged = mergeChatHistoryOperationProjections(settled, { schemaVersion: 'outcome_v1', operationStatusAvailable: true, operations: [failedSend] })
    expect(merged.map((row) => row.id)).toEqual(['a0', 1001, 'operation-projection-op-1'])
    expect(merged[2]).toMatchObject({ systemOnly: true, finishReason: 'server_error', failureCause: 'service_unavailable', allowedActions: ['retry', 'switch_model'] })
  })

  it('還沒被伺服器收下的那句（沒有 chatId）照舊整組拿掉', () => {
    const line = { id: 1001, type: 1, content: '看向窗外', transportTransient: true, serverAccepted: false }
    expect(settleZeroOutputTerminalFailure([opening, line, placeholder], { operationKind: 'send', userBubbleId: 1001, aiBubbleId: 1002 }))
      .toEqual([opening])
  })
})
