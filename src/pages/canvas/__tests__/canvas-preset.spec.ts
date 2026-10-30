import { expect, it } from 'vitest'
import { lockedPatch, presetFailure, presetLockedOf, readBinding, readPresetChoices } from '../canvas-preset'

// 跟著作者走（owner 2026-10-30）：卡綁的是預設本身，沒有版本
const binding = (over: Record<string, unknown> = {}) => ({ scope: 'card', mode: 'preset', presetId: 'p1', presetTitle: '細膩', bindingVersion: 3, state: 'ready', cacheEffect: 'none', ...over })

it('reads a bound preset and a card default without inventing a preset', () => {
 expect(readBinding(binding())).toEqual({ mode: 'preset', presetId: 'p1', bindingVersion: 3, title: '細膩', state: 'ready' })
 expect(readBinding({ mode: 'card_default', presetId: null, bindingVersion: 0, state: 'ready' })).toMatchObject({ mode: 'card_default', presetId: null })
 expect(() => readBinding({ mode: 'global', bindingVersion: 0, state: 'ready' })).toThrow()
 expect(() => readBinding({ mode: 'preset', bindingVersion: 1, state: 'ready' })).toThrow()
})

it('still reads the shape the server sent before presets followed the author, so a release gap does not show an error', () => {
 expect(readBinding({ mode: 'revision', presetId: 'p1', revisionId: 'r1', version: 2, bindingVersion: 3, presetTitle: '細膩', state: 'ready' })).toEqual({ mode: 'preset', presetId: 'p1', bindingVersion: 3, title: '細膩', state: 'ready' })
})

it('keeps an unavailable binding as unavailable instead of falling back', () => {
 expect(readBinding(binding({ state: 'unavailable' })).state).toBe('unavailable')
})

it('lists the presets the server returns, by id and name only', () => {
 const list = readPresetChoices({ items: [
  { id: 'p1', title: 'A', recommendedModels: ['m1'] },
  { id: '', title: 'broken' },
  { id: 'p2', title: 'B' },
 ] })
 expect(list).toEqual([{ id: 'p1', title: 'A', recommendedModels: ['m1'] }, { id: 'p2', title: 'B', recommendedModels: [] }])
})

it('classifies apply failures into what the player can do next', () => {
 expect(presetFailure({ statusCode: 409, data: { error: 'preset_conflict', reason: 'operation_active' } })).toBe('busy')
 expect(presetFailure({ statusCode: 409, data: { error: 'preset_conflict', reason: 'preset_revision_conflict' } })).toBe('conflict')
 // 預設的取樣參數目前的模型不能用：講清楚能怎麼辦（換模型或停用預設），不是一般的「沒有保存成功」
 expect(presetFailure({ statusCode: 422, data: { error: 'preset_invalid', reason: 'preset_model_setting_unsupported' } })).toBe('modelSettingUnsupported')
 expect(presetFailure({ statusCode: 409, data: { error: 'preset_revision_unavailable' } })).toBe('loadFailed')
 expect(presetFailure({ statusCode: 422, data: { error: 'context_capacity' } })).toBe('capacity')
  // 要套用的那份已經刪除：伺服器跟不存在一樣回 404
 expect(presetFailure({ statusCode: 404, data: { error: 'not_found' } })).toBe('gone')
 expect(presetFailure({ statusCode: 409, data: { error: 'preset_conflict', reason: 'preset_binding_changed' } })).toBe('conflict')
 expect(presetFailure(new TypeError('Failed to fetch'))).toBe('unknown')
 // 逾時：請求層回負的狀態碼，結果一樣是未知
 expect(presetFailure({ statusCode: -9999, data: {} })).toBe('unknown')
 expect(presetFailure({ statusCode: 500, data: {} })).toBe('failed')
})

it('drops every key the preset decides from a save (with its note, and the custom style), so the rest still saves', () => {
 const patch = { agency: 'protect', agencyNote: 'x', style: null, customStyle: null, styleNote: null, perspective: null, pace: 'linger', paceNote: null, length: null, lengthTarget: null, lengthNote: 'y', streaming: 'on' }
 expect(lockedPatch(patch, ['agency', 'style', 'perspective', 'pace', 'sandboxLevel', 'jailbreak'])).toEqual({ length: null, lengthTarget: null, lengthNote: 'y', streaming: 'on' })
 expect(lockedPatch(patch, [])).toBe(patch)
})

it('reads which settings the preset decides from the server, and falls back to the style flag of an older server', () => {
 expect(presetLockedOf({ presetLocked: ['agency', 'style'] })).toEqual(['agency', 'style'])
 expect(presetLockedOf({ styleLocked: true })).toEqual(['style'])
 expect(presetLockedOf({ styleLocked: false })).toEqual([])
 expect(presetLockedOf(null)).toEqual([])
})

it('treats the retired per-conversation scope as a version conflict: re-read and try again', () => {
 expect(presetFailure({ statusCode: 409, data: { error: 'preset_conflict', reason: 'preset_scope_changed' } })).toBe('conflict')
})
