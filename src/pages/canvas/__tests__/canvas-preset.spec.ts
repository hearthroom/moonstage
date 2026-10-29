import { expect, it } from 'vitest'
import { lockedPatch, newerVersion, presetFailure, readBinding, readPresetChoices } from '../canvas-preset'

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
 expect(presetFailure({ statusCode: 409, data: { error: 'preset_revision_unavailable' } })).toBe('loadFailed')
 expect(presetFailure({ statusCode: 422, data: { error: 'context_capacity' } })).toBe('capacity')
 expect(presetFailure(new TypeError('Failed to fetch'))).toBe('unknown')
 expect(presetFailure({ statusCode: 500, data: {} })).toBe('failed')
})

it('drops the style keys from a save while a preset owns the style, so other axes still save', () => {
 const patch = { agency: 'protect', style: null, customStyle: null, styleNote: null, length: null, lengthTarget: null }
 expect(lockedPatch(patch, true)).toEqual({ agency: 'protect', length: null, lengthTarget: null })
 expect(lockedPatch(patch, false)).toBe(patch)
})
