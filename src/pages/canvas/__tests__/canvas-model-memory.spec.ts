/**
 * 這張卡選的模型、思考深度要記得：換模型的每一條路都要把深度一起帶上，
 * 進場讀回來的設定不能被之後的目錄載入蓋掉。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')

function body(name: string): string {
  const start = source.indexOf(`function ${name}(`)
  expect(start).toBeGreaterThan(-1)
  const next = source.indexOf('\nfunction ', start + 10)
  const nextAsync = source.indexOf('\nasync function ', start + 10)
  const ends = [next, nextAsync].filter((n) => n > 0)
  return source.slice(start, ends.length ? Math.min(...ends) : undefined)
}

describe('換模型時深度一起存', () => {
  it('只帶模型（HUD 那條路）時按新模型換算思考深度', () => {
    const apply = body('onApplyModelSettings')
    expect(apply).toMatch(/thinkingDepthForVariant\(/)
  })
})

describe('HUD 換到按次線', () => {
  it('只帶模型時檔位回到按次線的最低一檔，跟選單同一條規則', () => {
    const apply = body('onApplyModelSettings')
    expect(apply).toMatch(/else if \(modelChanged\) formData\.context = contextForHudModel\(variant, formData\.context\)/)
  })
})

describe('世界模式卡與按次線', () => {
  it('HUD 的模型清單在世界模式卡上不列按次線', () => {
    expect(source).toMatch(/\.filter\(\(v\) => !\(modelPanelWorldMode\.value && v\.flatPerTurn === true\)\)/)
  })
  it('存檔被以世界模式拒絕時講原因，不說儲存失敗', () => {
    const persist = body('persistRoleSettings')
    expect(persist).toMatch(/statusCode === 422/)
    expect(persist).toMatch(/per_turn_world_unsupported[\s\S]*modelSelect\.flatLaneWorldReason/)
  })
  it('送出被拒的泡泡有自己的標題與原因', () => {
    expect(source).toMatch(/'per_turn_world_unsupported': t\('modelSelect\.flatLaneWorldTitle'\)/)
    expect(source).toMatch(/'per_turn_world_unsupported': t\('modelSelect\.flatLaneWorldReason'\)/)
  })
})

describe('進場讀回的模型不被目錄蓋掉', () => {
  it('目錄載入只寫目錄，不改玩家選的模型或深度', () => {
    const load = body('loadModelCatalog')
    expect(load).not.toMatch(/formData\.(selectModel|thinkingDepth)\s*=/)
  })

  it('目錄與 Agent 模式都等遊玩設定讀回來之後才跑', () => {
    expect(source).toMatch(/ensureRoleSettings\(\)\.then\(loadModelCatalog\)/)
    expect(source).toMatch(/ensureRoleSettings\(\)\.then\(loadMultiPassPreference\)/)
  })
})

describe('進場那一刻還沒登入', () => {
  it('登入完成後補讀這張卡的遊玩設定，不留在空的模型上', () => {
    expect(source).toMatch(/watch\(hasLogin,[\s\S]{0,200}?ensureRoleSettings\(\)/)
  })
})
