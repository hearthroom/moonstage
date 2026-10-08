import { describe, expect, it } from 'vitest'
import { outcomeFromInterruption, outcomeFromSystemNotice } from '../canvas-generation-outcome'

describe('沙箱卡的上一輪結局', () => {
  it('系統訊息卡：字照搬，鍵換成作者的動作名，交回宿主的鍵是卡上那顆', () => {
    const outcome = outcomeFromSystemNotice('11', {
      kind: 'model-error', label: '模型未能完成這次回覆', sub: '',
      actions: [{ action: 'retry_rewrite', label: '重試' }, { action: 'retry', label: '重試' }, { action: 'switch_model', label: '切換模型' }, { action: 'mystery', label: '?' }],
    })
    expect(outcome).toEqual({
      kind: 'model-error', label: '模型未能完成這次回覆', sub: '', messageId: '11',
      actions: [{ action: 'retry', label: '重試', key: 'sys:retry_rewrite' }, { action: 'switch-model', label: '切換模型', key: 'sys:switch_model' }],
    })
  })

  it('容量、模型設定、重新整理也是作者按得到的鍵', () => {
    const names = outcomeFromSystemNotice('1', { kind: 'x', label: '', sub: '', actions: [
      { action: 'capacity_choice', label: 'a' }, { action: 'open_model_settings', label: 'b' }, { action: 'refresh_history', label: 'c' }, { action: 'continue', label: 'd' },
    ] }).actions.map((a) => a.action)
    expect(names).toEqual(['capacity', 'model-settings', 'refresh', 'continue'])
  })

  it('Agent 中斷卡：繼續；續跑又停在同一個原因才多一顆換模型', () => {
    const card = { label: '這一輪還沒跑完', sub: '進度留著', continueLabel: '繼續', switchModelLabel: '切換模型', failedAgain: false }
    expect(outcomeFromInterruption('9', card)).toEqual({
      kind: 'interrupted', label: '這一輪還沒跑完', sub: '進度留著', messageId: '9',
      actions: [{ action: 'continue', label: '繼續', key: 'resume-agent' }],
    })
    expect(outcomeFromInterruption('9', { ...card, failedAgain: true }).actions.map((a) => a.key)).toEqual(['resume-agent', 'switch-model'])
  })
})
