import type { StageHost } from '@/host/stage-host'

/** Clipboard receives explicit text, never window.event (which may be a MessageEvent). */
export async function copyMessageText(host: StageHost, text: string, success: string, failure: string): Promise<boolean> {
  try {
    await host.clipboard.write(String(text ?? ''))
    host.ui.toast(success, 'success')
    return true
  } catch {
    host.ui.toast(failure, 'error')
    return false
  }
}
