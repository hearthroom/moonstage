/**
 * build 時注入的規則引擎版本（見 build/engine-version.ts）。沒注入（例如宿主站台直接編譯舞台原始碼、
 * 設定裡沒加 define）時是空字串：排程器就不用持久層——固定的預設值會讓引擎改了之後還拿到舊產物。
 */
declare const __AUTHOR_RULE_ENGINE_VERSION__: string | undefined

export const AUTHOR_RULE_ENGINE_VERSION: string =
  typeof __AUTHOR_RULE_ENGINE_VERSION__ === 'string' ? __AUTHOR_RULE_ENGINE_VERSION__ : ''
