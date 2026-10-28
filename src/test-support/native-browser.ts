import type { ChildProcess } from 'node:child_process'

// Subscribe at spawn time: a browser that dies during setup must not leave
// teardown waiting for an event which has already happened.
export function observeNativeBrowser(proc: ChildProcess) {
  let closed = false
  let spawnError: Error | undefined
  proc.once('error', error => { spawnError = error })
  const completion = new Promise<void>(resolve => proc.once('close', () => { closed = true; resolve() }))
  const requireCleanExit = () => {
    if (spawnError) throw spawnError
    if (proc.exitCode !== 0 || proc.signalCode !== null) throw new Error('Browser shutdown was not clean; profile must be retained')
  }
  return async (requestClose: () => Promise<unknown>, timeout = 5000) => {
    if (closed) {
      requireCleanExit()
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        Promise.all([requestClose(), completion]),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Browser shutdown timed out; profile must be retained')), timeout) }),
      ])
      requireCleanExit()
    } catch (error) {
      // This is failed teardown, never permission to delete an active profile.
      if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}
