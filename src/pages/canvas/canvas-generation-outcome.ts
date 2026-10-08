/**
 * 沙箱卡的 sdk.generation.outcome：上一輪沒正常結束時，最新那一列底下那張卡（系統訊息卡或 Agent 中斷卡）
 * 換成作者看得到的樣子。
 *
 * 字不另寫：系統訊息卡用 systemNoticeFor() 算好的那一份，中斷卡用 canvas-message.vue 那張卡同一組字，
 * 作者拿到的就是畫面上那張卡。鍵名換成作者用的穩定名字（retry_rewrite、retry_continue 這些是伺服器
 * 操作的細分，對作者都是「重試」）；key 留著原本交回宿主的那個鍵，按下去走同一條路。
 */

export interface GenerationOutcomeAction { action: string; label: string; key: string }

export interface HostGenerationOutcome {
  kind: string
  label: string
  sub: string
  messageId: string
  actions: GenerationOutcomeAction[]
}

/** 系統訊息卡的動作 → 作者看到的動作名。不在表上的動作不給作者（他按了也不知道會發生什麼）。 */
const AUTHOR_ACTION: Record<string, string> = {
  retry: 'retry',
  retry_rewrite: 'retry',
  retry_continue: 'retry',
  rewrite: 'retry',
  continue: 'continue',
  switch_model: 'switch-model',
  open_model_settings: 'model-settings',
  capacity_choice: 'capacity',
  refresh_history: 'refresh',
}

export function outcomeFromSystemNotice(
  messageId: string,
  notice: { kind: string; label: string; sub: string; actions: Array<{ action: string; label: string }> },
): HostGenerationOutcome {
  const actions: GenerationOutcomeAction[] = []
  for (const entry of notice.actions) {
    const action = AUTHOR_ACTION[entry.action]
    // 同一個作者動作只留第一顆：伺服器可能同時給 retry 與 retry_rewrite，作者那邊是同一顆鍵。
    if (!action || actions.some((a) => a.action === action)) continue
    actions.push({ action, label: entry.label, key: `sys:${entry.action}` })
  }
  return { kind: notice.kind, label: notice.label, sub: notice.sub, messageId, actions }
}

/** Agent 中斷卡：進度留著、可以接著跑；續跑又停在同一個原因時多一顆換模型。 */
export function outcomeFromInterruption(
  messageId: string,
  card: { label: string; sub: string; continueLabel: string; switchModelLabel: string; failedAgain: boolean },
): HostGenerationOutcome {
  const actions: GenerationOutcomeAction[] = [{ action: 'continue', label: card.continueLabel, key: 'resume-agent' }]
  if (card.failedAgain && card.switchModelLabel) actions.push({ action: 'switch-model', label: card.switchModelLabel, key: 'switch-model' })
  return { kind: 'interrupted', label: card.label, sub: card.sub, messageId, actions }
}
