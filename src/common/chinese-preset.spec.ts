import { expect, it } from 'vitest'
import { Converter as fullConverter } from 'opencc-js'
import * as full from 'opencc-js/preset'
import { preset, Converter } from './chinese-preset'

it('keeps the exact upstream normalization, segmentation and conversion chains for both supported directions', () => {
  expect(Object.keys(preset.configs).sort()).toEqual(['s2tw', 'tw2s'])
  for (const key of ['s2tw', 'tw2s'] as const) expect(preset.configs[key]).toEqual(full.configs[key])
})

it.each([['cn', 'tw'], ['tw', 'cn']])('matches the full converter for %s → %s across every retained dictionary entry', (from, to) => {
  const config = full.configs[from === 'cn' ? 's2tw' : 'tw2s']
  const dicts = [...config.normalizationChain.flat(), ...(config.segmentation || []), ...config.conversionChain.flat()]
  const cases = [...new Set(dicts.flatMap((dict: string) => dict.split('|').flatMap(entry => entry.split(' '))))]
  const expected = fullConverter({ from, to })
  const actual = Converter({ from, to })
  for (let i = 0; i < cases.length; i += 200) {
    const text = cases.slice(i, i + 200).join('\n')
    expect(actual(text)).toBe(expected(text))
  }
  for (const text of ['这是测试，头发发展。', '臺灣的滑鼠、網路、乾淨與幹活。', '<script>变量</script>𠮷神車', '小栗帽 台北 後面里面 干杯乾杯']) {
    expect(actual(text)).toBe(expected(text))
  }
}, 20000)
