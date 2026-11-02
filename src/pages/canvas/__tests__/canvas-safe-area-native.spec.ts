// @vitest-environment node
import { expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { observeNativeBrowser } from '../../../test-support/native-browser'

it('reserves device safe areas once across the canvas host and sandbox iframe', async () => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome, 'Install Chrome or set CHROME_BIN').toBeTruthy()
  const canvasCss = readFileSync('src/pages/canvas/canvas.css', 'utf8')
  const shellCss = readFileSync('src/sandbox/shell.css', 'utf8')
  const dir = mkdtempSync(join(tmpdir(), 'stage-safe-area-'))
  const file = join(dir, 'safe-area.html')
  // Real shared CSS and shell root/header hierarchy. No API, author card, or synthetic env() replacement.
  const shell = '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>'+canvasCss+shellCss+'</style><div class="canvas-root chat" data-chat="root" data-chrome="shell"><header data-chat="header">Synthetic navigation</header><main data-chat="messages">Opening</main></div>'
  const srcdoc = shell.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  writeFileSync(file, `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}${canvasCss}</style><div class="canvas-root" id="host"><div class="canvas-sandbox-frame"><iframe class="canvas-sandbox-iframe" srcdoc="${srcdoc}"></iframe></div></div>`)
  const proc = spawn(chrome!, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(dir, 'profile')}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
  const shutdown = observeNativeBrowser(proc)
  let ws: WebSocket | undefined
  let closeBrowser: (() => Promise<unknown>) | undefined
  let primaryError: unknown
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  try {
    const portFile = join(dir, 'profile', 'DevToolsActivePort')
    for (let count = 0; !existsSync(portFile) && count < 100; count++) await pause(100)
    const [port, endpoint] = readFileSync(portFile, 'utf8').trim().split('\n')
    ws = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`)
    await new Promise<void>((resolve, reject) => { ws!.onopen = () => resolve(); ws!.onerror = reject })
    let seq = 0
    const pending = new Map<number, { resolve: (result: any) => void; reject: (error: Error) => void }>()
    ws.onmessage = event => { const message = JSON.parse(String(event.data)); const request = pending.get(message.id); if (!request) return; pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) }
    const send = (method: string, params = {}, sessionId?: string): Promise<any> => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws!.send(JSON.stringify({ id, method, params, sessionId })) })
    ws.onclose = () => { for (const request of pending.values()) request.reject(new Error('Chrome CDP connection closed')); pending.clear() }
    closeBrowser = () => send('Browser.close')
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    await send('Page.enable', {}, sessionId)
    const evaluate = async (expression: string) => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value }

    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }, sessionId)
    await send('Page.navigate', { url: pathToFileURL(file).href }, sessionId)
    for (let count = 0; !await evaluate('!!document.querySelector("iframe")?.contentDocument?.querySelector("[data-chat=header]")') && count < 100; count++) await pause(50)
    const measure = () => evaluate(`(() => {
      const frame=document.querySelector('iframe'), d=frame.contentDocument, root=d.querySelector('[data-chat=root]'), header=d.querySelector('[data-chat=header]'), rect=frame.getBoundingClientRect();
      if(!header)throw Error('Shell header missing');
      return {hostPadding:parseFloat(getComputedStyle(document.querySelector('#host')).paddingTop),shellPadding:parseFloat(frame.contentWindow.getComputedStyle(root).paddingTop),headerTop:rect.top+header.getBoundingClientRect().top,headerLeft:rect.left+header.getBoundingClientRect().left,headerRight:rect.left+header.getBoundingClientRect().right,frameTop:rect.top,width:innerWidth}
    })()`)
    const failures: unknown[] = []
    // Android browser/no inset, nonzero Android inset, iOS notch, and landscape side cutout.
    for (const insets of [{top:0,left:0,right:0,bottom:0},{top:42,left:0,right:0,bottom:0},{top:47,left:0,right:0,bottom:34},{top:0,left:47,right:47,bottom:21}]) {
      await send('Emulation.setSafeAreaInsetsOverride', { insets }, sessionId)
      await pause(30)
      for (const full of [false,true]) {
        await evaluate(`document.querySelector('.canvas-sandbox-frame').classList.toggle('is-full',${full})`)
        const m=await measure()
        expect(m.hostPadding, 'Positive control: browser must expose real env(safe-area-inset-top)').toBe(insets.top)
        if(m.shellPadding!==0||m.headerTop!==insets.top||m.headerLeft!==insets.left||m.headerRight!==m.width-insets.right)failures.push({insets,full,...m})
      }
    }
    // An unlayered author rule keeps priority over the platform safe-area reset.
    await send('Emulation.setSafeAreaInsetsOverride', { insets:{top:47,left:0,right:0,bottom:0} }, sessionId)
    await evaluate(`{const d=document.querySelector('iframe').contentDocument,s=d.createElement('style');s.textContent='[data-chat="root"]{padding-top:8px}';d.head.append(s)}`)
    expect((await measure()).shellPadding).toBe(8)
    // Classic uses the same host root; its notch padding remains intact.
    await evaluate(`document.querySelector('#host').innerHTML='<header id="classic">Classic navigation</header>'`)
    expect(await evaluate('document.querySelector("#classic").getBoundingClientRect().top')).toBe(47)
    expect(failures, JSON.stringify(failures,null,2)).toEqual([])
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    try {
      await shutdown(async () => {
        if (!closeBrowser) throw new Error('Chrome did not reach CDP setup')
        await closeBrowser()
      })
      rmSync(dir, { recursive: true, force: true })
    } catch (error) {
      const cleanupError = new Error(`Chrome cleanup failed; retained fixture at ${dir}`, { cause: error })
      throw primaryError ? new AggregateError([primaryError, cleanupError], 'Panel test and Chrome cleanup failed') : cleanupError
    } finally {
      ws?.close()
    }
  }
}, 120000)
