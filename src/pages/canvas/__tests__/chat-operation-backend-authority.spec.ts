import { describe, expect, it } from 'vitest'
import {
  CHAT_OPERATION_LIVE_STATUS_TRUST_MS,
  isChatOperationBackendStillWorking,
} from '../chat-transport-ownership'

// 權威只能有一個：這一輪還在不在跑由伺服器說了算。
//
// 線上實測（2026-08-30，24 小時窗）：272 輪在伺服器上成功完成，耗時卻超過前端
// 的五分鐘上界，而且全部是普通輪次拿不到 agent 豁免。使用者扣了點、回覆寫好了，
// 畫面卻顯示逾時失敗。這幾條把「後端說還在跑就不准判死」釘住。
describe('後端才是權威', () => {
  const now = 1_000_000_000

  it('伺服器剛說還在生成 → 不准放手', () => {
    expect(isChatOperationBackendStillWorking({
      state: 'generating', observedAt: now - 1_000, now,
    })).toBe(true)
  })

  it('伺服器剛說已受理（還沒開始生成）→ 一樣不准放手', () => {
    expect(isChatOperationBackendStillWorking({
      state: 'accepted', observedAt: now - 1_000, now,
    })).toBe(true)
  })

  it('問不到伺服器超過信任窗 → 退回碼表', () => {
    expect(isChatOperationBackendStillWorking({
      state: 'generating',
      observedAt: now - CHAT_OPERATION_LIVE_STATUS_TRUST_MS - 1,
      now,
    })).toBe(false)
  })

  it('終態不算還在跑', () => {
    for (const state of ['completed', 'interrupted', 'stopped', 'failed_retryable', 'failed_terminal']) {
      expect(isChatOperationBackendStillWorking({ state, observedAt: now - 1_000, now })).toBe(false)
    }
  })

  it('未知狀態退回碼表，不得把前端永遠釘住', () => {
    expect(isChatOperationBackendStillWorking({
      state: 'some_future_state', observedAt: now - 1_000, now,
    })).toBe(false)
  })

  it('從來沒問到過狀態 → 退回碼表（否則永遠不放手）', () => {
    expect(isChatOperationBackendStillWorking({ state: 'generating', observedAt: null, now })).toBe(false)
  })

  it('觀測時間指向未來（時鐘偏移）→ 保守繼續等', () => {
    expect(isChatOperationBackendStillWorking({
      state: 'generating', observedAt: now + 60_000, now,
    })).toBe(true)
  })
})

// 串流連線本身就是心跳：字還在一直送進來，這一輪就還活著，不管從開始算過了幾分鐘。
// 一則長回覆（思考加正文上萬 token）跑五分鐘以上是正常的，跟 agent 一樣不該被碼表殺掉；
// 只有連線斷了、而且過了信任窗都沒再收到任何東西，才算真的中斷。
describe('串流還在送就是還活著', () => {
  const now = 1_000_000_000

  it('狀態只在開頭說過一次，但字剛剛還在進來 → 不准放手', () => {
    expect(isChatOperationBackendStillWorking({
      state: 'accepted',
      observedAt: now - CHAT_OPERATION_LIVE_STATUS_TRUST_MS - 60_000,
      streamActivityAt: now - 2_000,
      now,
    })).toBe(true)
  })

  it('從沒問到狀態，但串流剛剛還有東西 → 不准放手', () => {
    expect(isChatOperationBackendStillWorking({ state: '', observedAt: null, streamActivityAt: now - 2_000, now })).toBe(true)
  })

  it('串流也安靜超過信任窗 → 退回碼表', () => {
    expect(isChatOperationBackendStillWorking({
      state: 'accepted',
      observedAt: null,
      streamActivityAt: now - CHAT_OPERATION_LIVE_STATUS_TRUST_MS - 1,
      now,
    })).toBe(false)
  })

  it('伺服器已經說結束了，收尾幀不算還在跑', () => {
    expect(isChatOperationBackendStillWorking({ state: 'completed', observedAt: now - 1_000, streamActivityAt: now - 1_000, now })).toBe(false)
  })
})
