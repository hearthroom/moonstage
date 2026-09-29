import {expect,it} from 'vitest'
import {operationFailureTitle} from './operation-failure-copy'
import hant from '../locale/zh-Hant.json'
import hans from '../locale/zh-Hans.json'
import en from '../locale/en.json'
import ja from '../locale/ja.json'
import ko from '../locale/ko.json'
it('uses localized causes without confusing tool failures with player network errors', () => {
 for(const locale of [hant,hans,en,ja,ko]) {
  const t = (key:string) => (locale as any)[key]
  const titles=['tool_rejections','upstream_timeout','stream_incomplete','stopped'].map(cause=>operationFailureTitle(cause,t))
  expect(titles.every(title=>typeof title === 'string' && !!title)).toBe(true)
  expect(new Set(titles).size).toBe(4)
  expect(titles).not.toContain(t('systemMsg.networkError'))
  for (const cause of [undefined,'other','private error text','toString','__proto__']) expect(operationFailureTitle(cause,t)).toBe('')
 }
})
