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
  let ws: WebSocket | undefined
  let shutdown: ReturnType<typeof observeNativeBrowser> | undefined
  let closeBrowser: (() => Promise<unknown>) | undefined
  let primaryError: unknown
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  try {
    const file = join(dir, 'fixture.html')
    writeFileSync(file, `<style>${css}</style>${markup}<script>
      const ctx=document.createElement('canvas').getContext('2d');
      function rgba(value){ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]}
      function blend(front,back){return front.slice(0,3).map((v,i)=>v*front[3]/255+back[i]*(1-front[3]/255))}
      function luminance(rgb){return rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)}
      function contrast(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
      window.measureContrast=()=>[...document.querySelectorAll('section')].map(section=>{
        const bg=rgba(getComputedStyle(section.querySelector('.u-popup__content')).backgroundColor);
        const unchecked=section.querySelector('.confirm-check-box'),checked=section.querySelector('.is-on');
        const un=getComputedStyle(unchecked),on=getComputedStyle(checked);
        const fill=blend(rgba(on.backgroundColor),bg);
        return {mode:section.dataset.mode,unchecked:contrast(blend(rgba(un.borderTopColor),bg),bg),checked:contrast(blend(rgba(on.borderTopColor),bg),bg),mark:contrast(blend(rgba(on.color),fill),fill)};
      });
      window.measureFocus=()=>{
        const option=document.activeElement,section=option.closest('section'),focus=getComputedStyle(option);
        const bg=rgba(getComputedStyle(section.querySelector('.u-popup__content')).backgroundColor);
        return {mode:section.dataset.mode,active:option.matches('.confirm-option'),selected:!!option.querySelector('.is-on'),documentFocused:document.hasFocus(),focusVisible:option.matches(':focus-visible'),focus:contrast(blend(rgba(focus.outlineColor),bg),bg),focusStyle:focus.outlineStyle,focusWidth:parseFloat(focus.outlineWidth)};
      };
    </script>`)
    const proc = spawn(chrome!, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(dir, 'profile')}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
    shutdown = observeNativeBrowser(proc)
    const portFile = join(dir, 'profile', 'DevToolsActivePort')
    let address: string[] | undefined
    for (let count = 0; count < 100; count++) {
      const lines = existsSync(portFile) ? readFileSync(portFile, 'utf8').trim().split('\n') : []
      // Chrome creates the file before both lines are necessarily visible.
      if (/^\d+$/.test(lines[0] || '') && /^\/devtools\/browser\/[^\s]+$/.test(lines[1] || '')) { address = lines; break }
      await pause(100)
    }
    expect(address, 'Chrome must publish a complete DevTools address').toBeDefined()
    const [port, endpoint] = address!
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
    const evaluate = async (expression: string) => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value }
    await send('Page.navigate', { url: pathToFileURL(file).href }, sessionId)
    for (let count = 0; !await evaluate('document.readyState === "complete" && typeof window.measureFocus === "function"') && count < 100; count++) await pause(50)
    await send('Page.bringToFront', {}, sessionId)
    expect(await evaluate('document.hasFocus()'), 'The fixture must own browser focus before keyboard input').toBe(true)
    const rows = await evaluate('window.measureContrast()')
    expect(rows).toHaveLength(2)
    console.info("Reset checkbox contrast", JSON.stringify(rows))
    for (const row of rows) {
      for (const state of ['unchecked', 'checked', 'mark']) expect.soft(row[state], `${row.mode} ${state}: ${JSON.stringify(row)}`).toBeGreaterThanOrEqual(3)
    }
    // Inline .focus() during --dump-dom can run before the document owns focus.
    // Use real Tab input so :focus-visible is tested in its keyboard modality.
    for (const mode of modes) for (const selected of [false, true]) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId)
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId)
      const row = await evaluate('window.measureFocus()')
      console.info('Reset checkbox keyboard focus', JSON.stringify(row))
      expect(row.mode).toBe(mode.name)
      expect(row.active).toBe(true)
      expect(row.selected).toBe(selected)
      expect(row.documentFocused).toBe(true)
      expect(row.focusVisible).toBe(true)
      expect(row.focus).toBeGreaterThanOrEqual(3)
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
      const cleanupError = new Error(`Chrome cleanup failed; retained fixture at ${dir}`, { cause: error })
      throw primaryError ? new AggregateError([primaryError, cleanupError], 'Contrast test and Chrome cleanup failed') : cleanupError
    } finally { ws?.close() }
  }
}, 30000)
