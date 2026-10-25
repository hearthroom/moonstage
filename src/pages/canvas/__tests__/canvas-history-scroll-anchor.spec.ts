import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

// Invoke the real canvas callback; the host has no message node when the row
// lives in the sandbox iframe or was removed before the selector query returns.
const source = readFileSync('src/pages/canvas/canvas.vue', 'utf8')
const start = source.indexOf('function setPageScrollTo(selector)')
const functionSource = source.slice(start, source.indexOf('\n//简介', start))
function harness(rect: unknown) {
 const pageScrollTo = vi.fn()
 let callback: (rect: unknown) => void
 const query = { in: vi.fn(() => query), select: vi.fn(() => query), boundingClientRect: vi.fn(fn => { callback = fn; return query }), exec: vi.fn(() => callback(rect)) }
 const uni = { createSelectorQuery: vi.fn(() => query), pageScrollTo }
 const run = new Function('uni', '_this', functionSource + '\nreturn setPageScrollTo;')(uni, {})
 return { run, uni }
}

describe('old-history scroll anchor', () => {
 it('skips a missing host node when a sandbox old page is prepended', () => {
  const { run, uni } = harness(null)
  expect(() => run('#msg-00000000-0000-4000-8000-000000000001')).not.toThrow()
  expect(uni.pageScrollTo).not.toHaveBeenCalled()
 })
 it.each([undefined, {}, { top: NaN }, { top: Infinity }])('skips unavailable geometry %j', rect => {
  const { run, uni } = harness(rect)
  expect(() => run('#msg-old')).not.toThrow()
  expect(uni.pageScrollTo).not.toHaveBeenCalled()
 })
 it('preserves the existing scroll offset for a real message node', () => {
  const { run, uni } = harness({ top: 150 })
  run('#msg-current')
  expect(uni.pageScrollTo).toHaveBeenCalledWith({ scrollTop: 120, duration: 0 })
 })
 it('does not query without an anchor selector', () => {
  const { run, uni } = harness(null)
  run('')
  expect(uni.createSelectorQuery).not.toHaveBeenCalled()
 })
})
