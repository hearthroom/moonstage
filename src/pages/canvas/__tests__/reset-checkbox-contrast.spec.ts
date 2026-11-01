// @vitest-environment node
import { expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { observeNativeBrowser } from '../../../test-support/native-browser'

it('keeps reset checkbox boundaries, selected marks and keyboard focus distinguishable in light and dark', async () => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome, 'Native Chrome is required for computed color-mix contrast').toBeTruthy()
  const css = ['src/common/canvas-theme-vars.css', 'src/pages/canvas/canvas.css'].map(file => readFileSync(file, 'utf8')).join('\n')
  const modes = [{ name: 'light', bg: '#ffffff', fg: '#17171c', accent: '#ef4f6f' }, { name: 'dark', bg: '#191c20', fg: '#e8eaed', accent: '#ffd452' }]
  const markup = modes.map(mode => `<section class="canvas-root chat" data-mode="${mode.name}" style="color:${mode.fg};--lt-canvas-fg:${mode.fg};--lt-canvas-sheet-pop-bg:${mode.bg};--lt-canvas-accent:${mode.accent};--lt-canvas-accent-bg:color-mix(in srgb,${mode.accent} 14%,${mode.bg})"><div class="u-popup__content" style="background:${mode.bg}"><div class="confirm-scope"><div class="confirm-option" role="checkbox" tabindex="0"><span class="confirm-check-box"></span>Notebook</div><div class="confirm-option" role="checkbox" tabindex="0"><span class="confirm-check-box is-on">✓</span>Instructions</div></div></div></section>`).join('')
  const dir = mkdtempSync(join(tmpdir(), 'reset-checkbox-contrast-'))
  let closeBrowser: (() => Promise<unknown>) | undefined
  let shutdown: ReturnType<typeof observeNativeBrowser> | undefined
  let ws: WebSocket | undefined
  let primaryError: unknown
  try {
    const file = join(dir, 'fixture.html')
    writeFileSync(file, `<style>${css}</style>${markup}<pre id="result"></pre><script>
      const ctx=document.createElement('canvas').getContext('2d');
      function rgba(value){ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]}
      function blend(front,back){return front.slice(0,3).map((v,i)=>v*front[3]/255+back[i]*(1-front[3]/255))}
      function luminance(rgb){return rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)}
      function contrast(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
      window.measureReset=()=>{
        const option=document.activeElement,section=option.closest('section');
        if(!section||!option.matches('.confirm-option'))throw Error('Keyboard must focus a reset option');
        const bg=rgba(getComputedStyle(section.querySelector('.u-popup__content')).backgroundColor);
        const unchecked=section.querySelector('.confirm-check-box'),checked=section.querySelector('.is-on');
        const un=getComputedStyle(unchecked),on=getComputedStyle(checked);
        const fill=blend(rgba(on.backgroundColor),bg);
        const focus=getComputedStyle(option);
        return {mode:section.dataset.mode,documentFocused:document.hasFocus(),focusVisible:option.matches(':focus-visible'),unchecked:contrast(blend(rgba(un.borderTopColor),bg),bg),checked:contrast(blend(rgba(on.borderTopColor),bg),bg),mark:contrast(blend(rgba(on.color),fill),fill),focus:contrast(blend(rgba(focus.outlineColor),bg),bg),focusStyle:focus.outlineStyle,focusWidth:parseFloat(focus.outlineWidth)};
      };
    </script>`)
    const proc = spawn(chrome!, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, 'about:blank'], { stdio: 'ignore' })
    shutdown = observeNativeBrowser(proc)
    const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
    const portFile = join(dir, 'profile', 'DevToolsActivePort')
    for (let n = 0; !existsSync(portFile) && n < 100; n++) await pause(50)
    const [port, endpoint] = readFileSync(portFile, 'utf8').trim().split('\n')
    ws = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`)
    await new Promise<void>((resolve, reject) => { ws!.onopen = () => resolve(); ws!.onerror = reject })
    let seq = 0
    const pending = new Map<number, { resolve: (result: any) => void; reject: (error: Error) => void }>()
    const send = (method: string, params = {}, sessionId?: string): Promise<any> => new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws!.send(JSON.stringify({ id, method, params, sessionId }))
    })
    ws.onmessage = event => {
      const message = JSON.parse(String(event.data)), request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
    }
    ws.onclose = () => { for (const request of pending.values()) request.reject(new Error('Chrome CDP connection closed')); pending.clear() }
    closeBrowser = () => send('Browser.close')
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    const evaluate = async (expression: string) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    await send('Page.enable', {}, sessionId)
    await send('Page.navigate', { url: pathToFileURL(file).href }, sessionId)
    for (let n = 0; !await evaluate('typeof window.measureReset === "function"') && n < 100; n++) await pause(50)
    await send('Page.bringToFront', {}, sessionId)
    // A synchronous focus() in --dump-dom has no active document on macOS Chrome.
    // Exercise real keyboard modality before reading the :focus-visible contract.
    const rows: any[] = []
    for (let n = 0; rows.length < modes.length && n < 6; n++) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId)
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId)
      const mode = await evaluate('document.activeElement.closest("section")?.dataset.mode || null')
      if (mode && !rows.some(row => row.mode === mode)) rows.push(await evaluate('window.measureReset()'))
    }
    expect(rows).toHaveLength(2)
    console.info("Reset checkbox contrast", JSON.stringify(rows))
    for (const row of rows) {
      expect(row.documentFocused, `${row.mode}: browser setup must focus the page`).toBe(true)
      expect(row.focusVisible, `${row.mode}: real keyboard focus must reach the option`).toBe(true)
      for (const state of ['unchecked', 'checked', 'mark', 'focus']) expect.soft(row[state], `${row.mode} ${state}: ${JSON.stringify(row)}`).toBeGreaterThanOrEqual(3)
      expect(row.focusStyle).toBe('solid')
      expect(row.focusWidth).toBeGreaterThanOrEqual(2)
    }
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    try {
      if (shutdown) await shutdown(async () => {
        if (!closeBrowser) throw new Error('Chrome did not reach CDP setup')
        await closeBrowser()
      })
      rmSync(dir, { recursive: true, force: true })
    } catch (error) {
      if (primaryError) console.error('Native browser teardown also failed; profile retained')
      else throw error
    } finally { ws?.close() }
  }
}, 30000)
