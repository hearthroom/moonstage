// @vitest-environment node
import { expect, it } from 'vitest'
import { build } from 'esbuild'
import { compileScript, parse } from '@vue/compiler-sfc'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

it('keeps length labels and notebook actions inside real panels at phone and desktop widths', async () => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome).toBeTruthy()
  const locales = ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko']
  const dictionaries = Object.fromEntries(locales.map(locale => [locale, JSON.parse(readFileSync(resolve(`src/locale/${locale}.json`), 'utf8'))]))
  // Use the caller's label keys, including the long secondary actions, rather than shortened fixture copy.
  const caller = readFileSync(resolve('src/pages/canvas/canvas.vue'), 'utf8').match(/const notepadLabels = computed\(\(\) => \(\{([\s\S]*?)\}\)\)/)![1]
  const labelKeys = Object.fromEntries([...caller.matchAll(/(\w+): t\('([^']+)'/g)].map(match => [match[1], match[2]]))
  const styles = ['src/common/canvas-theme-vars.css', 'src/pages/canvas/canvas.css', 'src/pages/canvas/canvas-chrome-box.css'].map(file => readFileSync(resolve(file), 'utf8'))
  const result = await build({ stdin: { contents: `
    import {createApp,h,ref,nextTick} from 'vue'
    import Popup from './src/pages/canvas/components/canvas-popup.vue'
    import Response from './src/pages/canvas/components/canvas-response-settings.vue'
    import Notebook from './src/pages/canvas/components/canvas-notepad.vue'
    const dictionaries=${JSON.stringify(dictionaries)},labelKeys=${JSON.stringify(labelKeys)}
    const state=ref({locale:'en',kind:'response',mode:'dark',templates:false}),version=ref(0)
    const t=key=>dictionaries[state.value.locale][key]||key
    createApp({render(){const s=state.value
      return h('div',{class:'canvas-root chat'},[h(Popup,{key:version.value,open:true},{default:()=>s.kind==='response'
        ?h(Response,{conversationId:'layout',t,load:async()=>({conversationId:'layout',scope:'conversation',schemaVersion:1,revision:0,overrides:{},effective:{agency:'coauthor',style:'card',perspective:'card',length:'auto',pace:'natural'}}),save:async()=>({})})
        :h(Notebook,{hasConversation:true,templatesOpen:s.templates,labels:Object.fromEntries(Object.entries(labelKeys).map(([name,key])=>[name,t(key)]))})})])
    }}).mount('#app')
    window.measurePanel=async next=>{
      state.value=next;version.value++;document.documentElement.dataset.mode=next.mode
      document.documentElement.lang=next.locale
      await nextTick();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
      const group=document.querySelector(next.kind==='response'?'.response-axis[data-axis="length"] .radio-group':'.np-actions')
      if(!group)throw Error('panel did not load')
      const area=group.getBoundingClientRect(),issues=[]
      const items=[...group.children].filter(e=>e.getBoundingClientRect().height>0)
      for(const item of items){
        const box=item.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(item)
        const text=[...range.getClientRects()]
        if(box.left<area.left-1||box.right>area.right+1||box.right>innerWidth+1||item.scrollWidth>item.clientWidth+1||text.some(r=>r.left<box.left-1||r.right>box.right+1))
          issues.push({label:item.textContent.trim(),left:box.left,right:box.right,areaRight:area.right,scrollWidth:item.scrollWidth,clientWidth:item.clientWidth})
      }
      return {width:innerWidth,items:items.length,issues}
    }
  `, loader: 'ts', resolveDir: process.cwd() }, plugins: [{ name: 'real-panel-components', setup(builder) {
    builder.onLoad({ filter: /\.vue$/ }, args => {
      const { descriptor } = parse(readFileSync(args.path, 'utf8'))
      styles.push(...descriptor.styles.map(style => style.content))
      return { contents: compileScript(descriptor, { id: 'layout', inlineTemplate: true }).content, loader: 'ts', resolveDir: dirname(args.path) }
    })
  } }], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', resolveExtensions: ['.ts', '.js', '.vue'],
  define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } })
  const dir = mkdtempSync(join(tmpdir(), 'stage-panel-layout-'))
  const file = join(dir, 'panels.html')
  const css = styles.join('\n').replace(/(-?\d*\.?\d+)rpx/g, 'calc($1 * var(--ms-rpx))')
  writeFileSync(file, `<meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--ms-rpx:.5px}body{margin:0;font-family:system-ui}*,*::before,*::after{animation:none!important;transition:none!important}${css}</style><div id="app"></div><script>${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`)
  const proc = spawn(chrome!, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(dir, 'profile')}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
  let ws: WebSocket | undefined
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
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    await send('Page.enable', {}, sessionId)
    const evaluate = async (expression: string) => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value }
    const failures = []
    for (const width of [360, 390, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: width < 700 ? 3 : 1, mobile: width < 700 }, sessionId)
      await send('Page.navigate', { url: pathToFileURL(file).href }, sessionId)
      for (let count = 0; !await evaluate('typeof window.measurePanel==="function"') && count < 100; count++) await pause(50)
      for (const locale of locales) for (const mode of ['dark', 'light']) for (const [kind, templates] of [['response', false], ['notepad', false], ['notepad', true]]) {
        const measured = await evaluate(`window.measurePanel(${JSON.stringify({ locale, mode, kind, templates })})`)
        expect(measured.width, 'CDP must emulate the actual CSS viewport').toBe(width)
        expect(measured.items).toBeGreaterThanOrEqual(3)
        if (measured.issues.length) failures.push({ width, locale, mode, kind, templates, issues: measured.issues })
      }
    }
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([])
  } finally {
    ws?.close()
    const exited = new Promise(resolve => proc.once('exit', resolve))
    proc.kill('SIGTERM')
    await Promise.race([exited, pause(5000)])
    if (proc.exitCode === null && proc.signalCode === null) { proc.kill('SIGKILL'); await exited }
    rmSync(dir, { recursive: true, force: true })
  }
}, 120000)
