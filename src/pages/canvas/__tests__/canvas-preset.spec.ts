import { expect, it } from 'vitest'
import { lockedPatch, newerVersion, presetFailure, presetLockedOf, readBinding, readPresetChoices } from '../canvas-preset'

const binding = (over: Record<string, unknown> = {}) => ({ mode: 'revision', presetId: 'p1', revisionId: 'r1', bindingVersion: 3, presetTitle: '細膩', version: 1, state: 'ready', cacheEffect: 'prefix_rebuild_once', ...over })

it('reads a bound revision and a card default without inventing a preset', () => {
 expect(readBinding(binding())).toMatchObject({ mode: 'revision', presetId: 'p1', revisionId: 'r1', bindingVersion: 3, title: '細膩', version: 1, state: 'ready' })
 expect(readBinding({ mode: 'card_default', presetId: null, revisionId: null, bindingVersion: 0, state: 'ready' })).toMatchObject({ mode: 'card_default', presetId: null, revisionId: null })
 expect(() => readBinding({ mode: 'global', bindingVersion: 0, state: 'ready' })).toThrow()
 expect(() => readBinding({ mode: 'revision', bindingVersion: 1, state: 'ready' })).toThrow()
})

it('keeps an unavailable binding as unavailable instead of falling back', () => {
 expect(readBinding(binding({ state: 'unavailable' })).state).toBe('unavailable')
})

it('lists only presets that can still be chosen', () => {
 const list = readPresetChoices({ items: [
  { id: 'p1', title: 'A', headRevisionId: 'r2', version: 2, archived: false, recommendedModels: ['m1'] },
  { id: 'p2', title: 'B', headRevisionId: 'r9', version: 1, archived: true, recommendedModels: [] },
 ] })
 expect(list.map((p) => p.id)).toEqual(['p1'])
})

it('offers the newer version only for the same preset with a higher version', () => {
 const list = readPresetChoices({ items: [{ id: 'p1', title: 'A', headRevisionId: 'r2', version: 2, archived: false, recommendedModels: [] }] })
 expect(newerVersion(readBinding(binding()), list)?.headRevisionId).toBe('r2')
 expect(newerVersion(readBinding(binding({ version: 2, revisionId: 'r2' })), list)).toBeNull()
 expect(newerVersion(readBinding(binding({ presetId: 'other' })), list)).toBeNull()
 expect(newerVersion(readBinding({ mode: 'card_default', presetId: null, revisionId: null, bindingVersion: 0, state: 'ready' }), list)).toBeNull()
})

it('classifies apply failures into what the player can do next', () => {
 expect(presetFailure({ statusCode: 409, data: { error: 'preset_conflict', reason: 'operation_active' } })).toBe('busy')
 expect(presetFailure({ statusCode: 409, data: { error: 'preset_conflict', reason: 'preset_revision_conflict' } })).toBe('conflict')
 // 預設的取樣參數目前的模型不能用：講清楚能怎麼辦（換模型或停用預設），不是一般的「沒有保存成功」
 expect(presetFailure({ statusCode: 422, data: { error: 'preset_invalid', reason: 'preset_model_setting_unsupported' } })).toBe('modelSettingUnsupported')
 expect(presetFailure({ statusCode: 409, data: { error: 'preset_revision_unavailable' } })).toBe('loadFailed')
 expect(presetFailure({ statusCode: 422, data: { error: 'context_capacity' } })).toBe('capacity')
 expect(presetFailure(new TypeError('Failed to fetch'))).toBe('unknown')
 // 逾時：請求層回負的狀態碼，結果一樣是未知
 expect(presetFailure({ statusCode: -9999, data: {} })).toBe('unknown')
 expect(presetFailure({ statusCode: 409, data: { error: 'preset_conflict', reason: 'preset_archived' } })).toBe('archived')
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
