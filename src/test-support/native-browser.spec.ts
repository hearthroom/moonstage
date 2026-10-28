// @vitest-environment node
import { expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { observeNativeBrowser } from './native-browser'

it('lets a browser finish its pending profile write before teardown returns', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'native-browser-shutdown-'))
  const marker = join(dir, 'flushed')
  // A real process with asynchronous shutdown work. An OS termination signal
  // cannot acknowledge the browser protocol's pending profile flush.
  const proc = spawn(process.execPath, ['-e', `
    process.stdin.resume()
    process.stdin.on('end', () => setTimeout(() => {
      require('node:fs').writeFileSync(process.argv[1], 'complete')
      process.exit(0)
    }, 100))
    process.stdout.write('ready')
  `, marker], { stdio: ['pipe', 'pipe', 'pipe'] })
  const shutdown = observeNativeBrowser(proc)
  try {
    await once(proc.stdout!, 'data')
    await shutdown(async () => { proc.stdin!.end() })
    expect(readFileSync(marker, 'utf8')).toBe('complete')
    expect(proc.exitCode).toBe(0)
  } finally {
    if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
    rmSync(dir, { recursive: true, force: true })
  }
})

it('observes a browser which exits before teardown starts', async () => {
  const proc = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' })
  const shutdown = observeNativeBrowser(proc)
  await once(proc, 'close')
  await shutdown(async () => { throw new Error('closed browser must not receive a command') })
})

it('rejects a protocol failure and terminates only its own browser', async () => {
  const proc = spawn(process.execPath, ['-e', 'process.stdin.resume(); process.stdout.write("ready")'], { stdio: ['pipe', 'pipe', 'pipe'] })
  const shutdown = observeNativeBrowser(proc)
  const closed = once(proc, 'close')
  await once(proc.stdout!, 'data')
  await expect(shutdown(async () => { throw new Error('CDP unavailable') })).rejects.toThrow('CDP unavailable')
  await closed
  expect(proc.signalCode).toBe('SIGKILL')
})

it('fails bounded shutdown when the browser never acknowledges close', async () => {
  const proc = spawn(process.execPath, ['-e', 'process.stdin.resume(); process.stdout.write("ready")'], { stdio: ['pipe', 'pipe', 'pipe'] })
  const shutdown = observeNativeBrowser(proc)
  const closed = once(proc, 'close')
  await once(proc.stdout!, 'data')
  await expect(shutdown(() => new Promise(() => {}), 50)).rejects.toThrow('profile must be retained')
  await closed
  expect(proc.signalCode).toBe('SIGKILL')
})
