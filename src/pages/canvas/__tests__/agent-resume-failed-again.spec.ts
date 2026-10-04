// @vitest-environment jsdom
/**
 * Agent 那一輪按「繼續」之後又立刻停在同一個原因上。
 *
 * 先前卡片一模一樣：同一句標題、同一句說明、同一顆「繼續」。模型整條掛著的時候玩家只會
 * 一直按繼續，而那個模型不會好。續跑的那次又停在跟上一次同一個原因上時，說明改成建議換
 * 模型，卡上多一顆「切換模型」。原因不同（上次逾時、這次工具失敗）不算，那是另一個問題；
 * 玩家自己按的停止也不算。
 *
 * 也一起釘住：卡上的「繼續」沒有東西可續時（回 false）要讓玩家知道，不能按了沒反應；
 * 輸入區那顆「繼續」的無障礙名稱是「繼續」，不是「更多」。
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { agentResumeFailedAgain } from '@/utils/agent-composer-action'
import CanvasMessage from '../components/canvas-message.vue'
import CanvasComposer from '../components/canvas-composer.vue'

const CANVAS = fs.readFileSync(path.join(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
const NIL = '00000000-0000-0000-0000-000000000000'
const op = (operationId: string, failureCause: string, resumeFromOperationId = NIL) =>
  ({ operationId, reasonCode: 'agent_progress_preserved', failureCause, resumeFromOperationId })

describe('agentResumeFailedAgain：續跑的那次又停在同一個原因', () => {
  it('上一次逾時、續跑又逾時：是', () => {
    expect(agentResumeFailedAgain([op('op-1', 'upstream_timeout'), op('op-2', 'upstream_timeout', 'op-1')], 'op-2')).toBe(true)
  })

  it('連續好幾次都一樣：每一次都是', () => {
    const ops = [op('op-1', 'tool_rejections'), op('op-2', 'tool_rejections', 'op-1'), op('op-3', 'tool_rejections', 'op-2')]
    expect(agentResumeFailedAgain(ops, 'op-3')).toBe(true)
  })

  it('第一次停下（不是續跑來的）、原因不同、上一次不在清單裡、沒有原因、玩家自己按停止：都不是', () => {
    expect(agentResumeFailedAgain([op('op-1', 'upstream_timeout')], 'op-1')).toBe(false)
    expect(agentResumeFailedAgain([op('op-1', 'upstream_timeout'), op('op-2', 'tool_rejections', 'op-1')], 'op-2')).toBe(false)
    expect(agentResumeFailedAgain([op('op-2', 'upstream_timeout', 'op-1')], 'op-2')).toBe(false)
    expect(agentResumeFailedAgain([op('op-1', ''), op('op-2', '', 'op-1')], 'op-2')).toBe(false)
    expect(agentResumeFailedAgain([op('op-1', 'stopped'), op('op-2', 'stopped', 'op-1')], 'op-2')).toBe(false)
  })

  it('找不到這一列的操作（沒有 id、清單是空的、不是陣列）：不是', () => {
    expect(agentResumeFailedAgain([op('op-1', 'upstream_timeout'), op('op-2', 'upstream_timeout', 'op-1')], '')).toBe(false)
    expect(agentResumeFailedAgain([], 'op-2')).toBe(false)
    expect(agentResumeFailedAgain(undefined, 'op-2')).toBe(false)
  })
})

const LABELS = {
  copy: '', edit: '', regenerate: '', reasoning: '', prepTrail: '準備過程', prev: '', next: '',
  interruptedNotice: '這一輪還沒跑完，進度已經留著', interruptedNoticeSub: '進度已保留，可以按繼續接著跑，或換一個模型再試',
  continueAction: '繼續', failedAgainSub: '同樣的問題又發生了，換一個模型可能比較順', switchModel: '切換模型',
}
const card = (over: Record<string, unknown>) => mount(CanvasMessage, {
  props: {
    message: { id: 'm1', mesid: 2, role: 'ai', name: '露娜', avatar: '', html: '', finished: false, loading: false, latest: true, swipes: null, agentInterrupted: true, prepTrail: ['回想先前的劇情'], interruptedNotice: '模型回應逾時', ...over },
    labels: LABELS,
  },
})

describe('中斷卡：同一個原因又停下時建議換模型', () => {
  it('又停在同一個原因：說明換成建議換模型，「切換模型」在「繼續」旁邊', async () => {
    const w = card({ agentFailedAgain: true })
    const resume = w.find('[data-lt="agent-resume"]')
    expect(resume.find('.agent-resume-card__sub').text()).toBe(LABELS.failedAgainSub)
    const alt = resume.find('.agent-resume-card__alt')
    expect(alt.text()).toBe('切換模型')
    expect(resume.find('.agent-resume-card__btn').text()).toBe('繼續')
    await alt.trigger('click')
    await resume.find('.agent-resume-card__btn').trigger('click')
    expect(w.emitted('action')).toEqual([['switch-model'], ['resume-agent']])
    // 兩顆鍵包在同一組裡：窄螢幕放不下時一起換到下一行，「繼續」不會自己被擠到另一行的左邊
    expect(resume.findAll('.agent-resume-card__actions > div').map((b) => b.classes()[0])).toEqual(['agent-resume-card__alt', 'agent-resume-card__btn'])
  })

  it('第一次停下：照舊的說明，只有「繼續」', () => {
    const w = card({})
    expect(w.find('.agent-resume-card__sub').text()).toBe(LABELS.interruptedNoticeSub)
    expect(w.find('.agent-resume-card__alt').exists()).toBe(false)
  })

  it('原因說得出是誰的問題時，說明照原因講；又停在同一個原因時仍以建議換模型為先', () => {
    const upstream = '問題出在模型那一端，進度都還留著。'
    expect(card({ interruptedNoticeSub: upstream }).find('.agent-resume-card__sub').text()).toBe(upstream)
    expect(card({ interruptedNoticeSub: upstream, agentFailedAgain: true }).find('.agent-resume-card__sub').text()).toBe(LABELS.failedAgainSub)
  })
})

describe('canvas.vue 的接線', () => {
  const slice = (start: string) => {
    const i = CANVAS.indexOf(start)
    expect(i, start).toBeGreaterThan(-1)
    return CANVAS.slice(i, CANVAS.indexOf('\n}\n', i))
  }

  it('中斷那一列帶「又停在同一個原因」的判斷（看伺服器給的操作清單），卡片的字從語系來', () => {
    expect(slice('function messageProps(')).toContain('agentFailedAgain: item.agentInterrupted === true && agentResumeFailedAgain(unref(knownOperations), item.operationId)')
    const labels = CANVAS.slice(CANVAS.indexOf('const messageLabels = computed('), CANVAS.indexOf('}))', CANVAS.indexOf('const messageLabels = computed(')))
    expect(labels).toContain("failedAgainSub: t('multiPass.failedAgainSub')")
    expect(labels).toContain("switchModel: t('chat.switchModel')")
  })

  it('卡上的「切換模型」打開模型選擇（在選單的能力閘之前）', () => {
    const action = slice('function onMessageAction(')
    expect(action.indexOf("key === 'switch-model'")).toBeGreaterThan(-1)
    expect(action.indexOf("key === 'switch-model'")).toBeLessThan(action.indexOf('onMenuPick(key)'))
    expect(action).toContain('openModelSelect()')
  })

  it('卡上的「繼續」沒有東西可續時講出來（繼續的目標不成立那一句），不是按了沒反應', () => {
    const pick = slice('function onMenuPick(')
    expect(pick).toMatch(/case 'resume-agent':[\s\S]*?if \(!resumeAgentOperation\(\)\) message\.error\(resolveChatErrorMessage\('continue_target_invalid', t\)\)/)
  })

  it('輸入區的字帶「繼續」', () => {
    const labels = CANVAS.slice(CANVAS.indexOf('const composerLabels = computed('), CANVAS.indexOf('}))', CANVAS.indexOf('const composerLabels = computed(')))
    expect(labels).toContain("continue: t('multiPass.continueAction')")
  })
})

describe('輸入區：「繼續」那顆鍵的無障礙名稱', () => {
  const labels = { stop: '停止', more: '更多', send: '送出', paste: '貼上', clear: '清除', model: '模型', assist: '幫答', perTurn: '每輪', continue: '繼續' }
  const composer = (sendState: string, over: Record<string, unknown> = {}) =>
    mount(CanvasComposer, { props: { value: '', placeholder: '說點什麼', sendState, generating: false, labels: { ...labels, ...over } } })

  it('繼續狀態念「繼續」，不是「更多」', () => {
    const names = composer('continue').findAll('.lt-send').map((b) => b.attributes('aria-label'))
    expect(names.length).toBeGreaterThan(0)
    expect(new Set(names)).toEqual(new Set(['繼續']))
  })

  it('送出狀態念「送出」', () => {
    expect(new Set(composer('send').findAll('.lt-send').map((b) => b.attributes('aria-label')))).toEqual(new Set(['送出']))
  })
})
