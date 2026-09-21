import { Converter } from './chinese-preset'

type Direction = 's2t' | 't2s'
const converters: Partial<Record<Direction, (text: string) => string>> = {}

/** 字典與玩家資料無關；只在真正轉換時建立，所有顯示出口共用。 */
export function convertChinese(text: string, direction: Direction): string {
  const converter = converters[direction] ??= Converter(direction === 's2t'
    ? { from: 'cn', to: 'tw' }
    : { from: 'tw', to: 'cn' })
  return converter(text)
}
