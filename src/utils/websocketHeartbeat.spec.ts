import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHeartbeatManager } from './websocketHeartbeat'

afterEach(() => { vi.useRealTimers() })

// 伺服器只在收到客戶端的東西時延長連線的讀取期限。串流期間一直有字進來，
// 如果因此不送心跳，一則超過期限的長回覆會被伺服器當成斷線切掉。
describe('心跳在串流期間照送', () => {
  it('一直收到訊息時，每個間隔仍然送一次 ping', () => {
    vi.useFakeTimers()
    const ws = { readyState: WebSocket.OPEN, send: vi.fn() }
    const manager: any = createHeartbeatManager()
    manager.start(ws, { interval: 10000 })
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(9000)
      manager.updateLastMessageTime?.()
      vi.advanceTimersByTime(1000)
    }
    expect(ws.send).toHaveBeenCalledTimes(3)
    expect(JSON.parse(ws.send.mock.calls[0][0]).type).toBe('ping')
    manager.stop()
  })

  it('連線不在開啟狀態就停', () => {
    vi.useFakeTimers()
    const ws = { readyState: WebSocket.CLOSED, send: vi.fn() }
    const manager = createHeartbeatManager()
    manager.start(ws as any, { interval: 10000 })
    vi.advanceTimersByTime(10000)
    expect(ws.send).not.toHaveBeenCalled()
    expect(manager.isActive()).toBe(false)
  })
})
