// @vitest-environment node
import { expect, it } from 'vitest'
import { build } from 'vite'
import path from 'node:path'

it('ships reusable dictionaries, locales and model images outside the player chunk', async () => {
  const result: any = await build({ configFile: path.resolve('vite.stage.config.ts'), build: { write: false } })
  const output = result[0].output
  const chunks = output.filter((file: any) => file.type === 'chunk')
  const dictionary = chunks.find((file: any) => file.name === 'chinese-dictionary')
  expect(dictionary, 'dictionary can be cached without the player').toBeDefined()
  expect(Object.keys(dictionary.modules).some(id => id.includes('opencc-js/dist/esm/full'))).toBe(false)
  expect(Object.keys(dictionary.modules).some(id => /HK|JP|TWPhrases/.test(id))).toBe(false)
  for (const locale of ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant']) {
    expect(chunks.find((file: any) => file.name === `stage-locale-${locale}`)?.code.length).toBeGreaterThan(1000)
  }
  const images = output.filter((file: any) => file.type === 'asset' && /\.(png|svg)$/.test(file.fileName))
  expect(images.length).toBeGreaterThanOrEqual(19)
  const imageModules = chunks.flatMap((file: any) => Object.entries(file.modules)).filter(([id]: any) => id.includes('/static/icon/models/'))
  expect(imageModules.every(([, module]: any) => !module.code.includes('data:image/'))).toBe(true)
  // Locale/dictionary files must not import the frequently changing player entry.
  for (const stable of chunks.filter((file: any) => file.name === 'chinese-dictionary' || file.name.startsWith('stage-locale-'))) {
    expect(stable.imports).toEqual([])
  }
  const changed: any = await build({ configFile: path.resolve('vite.stage.config.ts'), build: { write: false }, plugins: [{
    name: 'simulate-player-release', enforce: 'pre',
    transform(code, id) { if (id.endsWith('/src/stage/index.ts')) return code + '\nexport const releaseCacheProbe = 1;'; },
  }] })
  const stableNames = (files: any[]) => files.filter(file => file.type === 'chunk' && (file.name === 'chinese-dictionary' || file.name.startsWith('stage-locale-'))).map(file => file.fileName).sort()
  expect(stableNames(changed[0].output)).toEqual(stableNames(output))
  const player = (files: any[]) => files.find(file => file.type === 'chunk' && Object.keys(file.modules).some(id => id.endsWith('/src/stage/index.ts'))).fileName
  expect(player(changed[0].output)).not.toBe(player(output))
}, 30000)
