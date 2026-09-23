import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { sandboxRetryPrompt } from '../canvas-sandbox-retry'

const ROOT = process.cwd()
const CANVAS = fs.readFileSync(path.join(ROOT, 'src/pages/canvas/canvas.vue'), 'utf8')

const user = { id: 'u1', chatId: 'u1', type: 1, content: 'Hello', chatFinish: true }
const failed = (over: Record<string, unknown> = {}) => ({
  id: 'a1', chatId: 'a1', type: 0, chatFinish: true, chatLoading: false,
  operationProjectionCapable: true, operationId: 'op-1', finishReason: 'reasoning_only',
  allowedActions: ['retry', 'switch_model'], thinkingContent: 'hmm', content: '',
  ...over,
})
// 跟 canvas.vue 的 getSystemMsgCtaAction 一樣：只看最新那一列伺服器給的第一個動作
const ctaAction = (item: any) => (Array.isArray(item.allowedActions) ? item.allowedActions[0] : '') || ''

/**
 * 沙箱卡的訊息列表畫在殼裡，殼不畫系統訊息卡——一般卡那張「重試」卡在沙箱裡看不到，
 * 玩家只看到思考停住，沒有任何出路。可重試的失敗要改用面板通道（確認框）問他要不要重試。
 */
describe('沙箱卡：可重試的失敗要有重試出路', () => {
  it('最新一列是可重試的失敗：給出重試動作與這一列的識別', () => {
    const prompt = sandboxRetryPrompt([user, failed()], ctaAction)
    expect(prompt).toEqual({ key: 'op-1', index: 1, action: 'retry', finishReason: 'reasoning_only' })
  })

  it('舊版重試動作（retry_rewrite／rewrite／retry_continue）也算', () => {
    for (const action of ['retry_rewrite', 'rewrite', 'retry_continue']) {
      expect(sandboxRetryPrompt([user, failed({ allowedActions: [action] })], ctaAction)?.action).toBe(action)
    }
  })

  it('沒有重試動作、正常完成、還在生成、或不是最新一列：不問', () => {
    expect(sandboxRetryPrompt([user, failed({ allowedActions: [] })], ctaAction)).toBeNull()
    expect(sandboxRetryPrompt([user, failed({ allowedActions: ['switch_model'] })], ctaAction)).toBeNull()
    expect(sandboxRetryPrompt([user, failed({ finishReason: 'stop' })], ctaAction)).toBeNull()
    expect(sandboxRetryPrompt([user, failed({ finishReason: '' })], ctaAction)).toBeNull()
    expect(sandboxRetryPrompt([user, failed({ chatFinish: false })], ctaAction)).toBeNull()
    expect(sandboxRetryPrompt([user, failed({ chatLoading: true })], ctaAction)).toBeNull()
    expect(sandboxRetryPrompt([user, failed(), user], ctaAction)).toBeNull()
  })

  it('同一個操作的說法變了（即時收尾→重新載入）仍是同一則，不再問第二次', () => {
    const live = sandboxRetryPrompt([user, failed({ finishReason: 'server_error' })], ctaAction)
    const reloaded = sandboxRetryPrompt([user, failed()], ctaAction)
    expect(live?.key).toBe(reloaded?.key)
  })

  it('沒有 operationId 的錯誤列用列 id 當識別', () => {
    const row = failed({ operationId: '', operationProjectionCapable: false, finishReason: 'server_error', id: 17 })
    expect(sandboxRetryPrompt([user, row], () => 'retry')?.key).toBe('17')
  })

  it('canvas.vue 在沙箱卡時用確認框問，按下去走系統訊息卡同一個動作', () => {
    const start = CANVAS.indexOf('function promptSandboxRetry(')
    expect(start).toBeGreaterThan(-1)
    const body = CANVAS.slice(start, CANVAS.indexOf('\n}\n', start))
    expect(body).toContain('sandboxRetryPrompt(')
    expect(body).toContain('getSystemMsgLabel(')
    expect(body).toContain('getSystemMsgSub(')
    expect(body).toContain('getSystemMsgCtaLabel(')
    expect(body).toMatch(/askConfirm\('modal'/)
    expect(body).toContain('onSystemMsgCta(')
    // 只在沙箱卡、沒有別的面板開著時問；同一則失敗只問一次
    expect(body).toContain('sandboxCard.value')
    expect(body).toContain('panel.value.sheet')
    expect(body).toContain('sandboxRetryAsked')
    // 跟系統訊息卡同一道能力閘
    expect(body).toContain("allowsStageAction(stageHost.capabilities, 'continue')")
    // getSystemMsgCtaAction 的第一個參數是結果（finishReason），不能直接把列傳進去
    expect(body).not.toMatch(/sandboxRetryPrompt\(talkList\.value, getSystemMsgCtaAction\)/)
    expect(CANVAS).toMatch(/function sandboxRetryCtaAction\(item: any, index: number\) \{\s*return getSystemMsgCtaAction\(item\?\.finishReason, item, index\)/)
    expect(CANVAS).toMatch(/watch\(\s*\(\) => \[sandboxCard\.value, panel\.value\.sheet, sandboxCard\.value \? sandboxRetryPrompt\(/)
  })
})
