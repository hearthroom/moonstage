/**
 * 規則 worker 的入口。以 `?worker&inline` 打包：產物內嵌在主套件裡、用 blob 網址起 worker，
 * 所以兩個 build（舞台套件、沙箱殼）都不必多發一個檔案。
 */
import { createRuleWorkerHandler, type FromRuleWorker, type ToRuleWorker } from './rule-worker-protocol'

const scope = self as unknown as {
  postMessage(message: FromRuleWorker): void
  onmessage: ((event: MessageEvent<ToRuleWorker>) => void) | null
}
const handle = createRuleWorkerHandler((message) => scope.postMessage(message))
scope.onmessage = (event) => handle(event.data)
scope.postMessage({ t: 'ready' })
