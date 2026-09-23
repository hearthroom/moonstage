import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * 作者規則引擎的版本：決定規則產物的原始碼的雜湊，build 時以 `__AUTHOR_RULE_ENGINE_VERSION__` 注入。
 * 持久層（IndexedDB）的鍵含這個值——引擎一改，舊的產物自然不命中，不會拿到跟同步套用不同的結果。
 *
 * 規則產物依賴的原始碼多了一個檔（新的 import），就加進這裡；漏加的後果是引擎改了、重整還拿到舊產物。
 */
export const AUTHOR_RULE_ENGINE_SOURCES = [
  'src/pages/canvas/canvas-rule-engine-core.ts',
  'src/utils/display-rule-engine.js',
  'src/common/author-rules/rule-job.ts',
]

/** stageRoot：舞台 repo 的根目錄（含 src/）。 */
export function authorRuleEngineVersion(stageRoot: string): string {
  const h = createHash('sha256')
  for (const rel of AUTHOR_RULE_ENGINE_SOURCES) {
    h.update(rel)
    h.update('\0')
    h.update(readFileSync(path.resolve(stageRoot, rel)))
    h.update('\0')
  }
  return h.digest('hex').slice(0, 16)
}

/** 給 Vite `define` 用。 */
export function authorRuleEngineDefine(stageRoot: string): Record<string, string> {
  return { __AUTHOR_RULE_ENGINE_VERSION__: JSON.stringify(authorRuleEngineVersion(stageRoot)) }
}
