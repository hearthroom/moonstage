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
