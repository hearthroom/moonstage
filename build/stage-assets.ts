import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/** Library mode always inlines images; assetsInlineLimit alone cannot disable it.
 * Emit model icons with Rollup file references, so both direct ESM consumers and
 * a consuming Vite build resolve the asset relative to the generated module.
 */
export function stageModelAssets(): Plugin {
  return {
    name: 'moonstage:model-assets',
    enforce: 'pre',
    load(id) {
      if (!/\/src\/static\/icon\/models\/[^/?]+\.(png|svg)$/.test(id)) return null
      const ref = this.emitFile({ type: 'asset', name: path.basename(id), source: readFileSync(id) })
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`
    },
  }
}

/** Data-only chunks have no dependency on the frequently changing player code. */
export function stageDataChunk(id: string): string | undefined {
  if (id.includes('/node_modules/opencc-js/') || id.endsWith('/src/common/chinese-preset.ts')) return 'chinese-dictionary'
  const locale = id.match(/\/src\/locale\/(en|ja|ko|zh-Hans|zh-Hant)\.json$/)?.[1]
  if (locale) return `stage-locale-${locale}`
}
