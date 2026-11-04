// @vitest-environment node
import { expect, it } from 'vitest'
import { build } from 'esbuild'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { compileString } from 'sass'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

it('keeps the recovery notice above the real composer with collapsed and expanded textareas at phone and desktop widths', async () => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome, 'Native Chrome is required for recovery/input collision checks').toBeTruthy()
  const styles = ['src/common/canvas-theme-vars.css', 'src/pages/canvas/canvas.css', 'src/pages/canvas/canvas-chrome-box.css'].map(file => readFileSync(resolve(file), 'utf8'))
  const code = (await build({ stdin: { contents: `
    import {createApp,h,ref,nextTick} from 'vue'
    import Boundary from './src/pages/canvas/components/canvas-notice-boundary.vue'
    import Notice from './src/components/chat-system-message/chat-system-message.vue'
    import Composer from './src/pages/canvas/components/canvas-composer.vue'
    const value=ref('')
    createApp({render:()=>h('div',{class:'ms-stage'},[h('div',{class:'canvas-root chat'},[
      h('div',{style:'position:absolute;top:100px;left:0;right:0'},[
        h(Boundary,{enabled:true},{default:()=>h(Notice,{kind:'server-error',label:'Synthetic failure',sub:'Retry this reply',cta:'Retry'})})]),
      h('div',{style:'position:fixed;inset:0;z-index:3400;background:#eee'}),
      h(Composer,{style:'position:fixed;bottom:0;left:0;right:0;z-index:3500',value:value.value,'onUpdate:value':v=>value.value=v,placeholder:'Synthetic draft',sendState:'send',generating:false,shortcuts:[{key:'model',label:'Synthetic model'}]})
    ])])}).mount('#app')
    const wait=()=>new Promise(resolve=>setTimeout(resolve,180))
    const read=()=>{
      const fallback=document.querySelector('[data-lt="notice-fallback"]'),composer=document.querySelector('.composer-scope')
      if(!fallback){const el=document.querySelector('[data-lt-notice-anchor]').nextElementSibling,r=el.getBoundingClientRect();return {missing:true,sourceRect:r.toJSON(),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,400)}}
      const a=fallback.getBoundingClientRect(),b=composer.getBoundingClientRect(),retry=fallback.querySelector('[data-lt="retry"]'),r=retry.getBoundingClientRect()
      const send=[...document.querySelectorAll('.lt-send')].find(el=>el.getBoundingClientRect().width>0);if(!send)return {missingSend:true,body:document.body.innerHTML.slice(-3500)};const s=send.getBoundingClientRect()
      return {noticeBottom:a.bottom,composerTop:b.top,noticeTop:a.top,height:a.height,viewport:innerWidth,retryHit:retry.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),sendHit:send.contains(document.elementFromPoint(s.x+s.width/2,s.y+s.height/2))}
    }
    ;(async()=>{
      await nextTick()
      const expanded=window.frameElement.dataset.expanded==='true'
      if(expanded){
        document.querySelector('#send_textarea').focus()
        value.value='First line\\nSecond line\\nThird line\\nFourth line'
        await nextTick()
      }
      await wait()
      parent.postMessage({expanded,state:read()},'*')
    })().catch(error=>parent.postMessage({error:String(error),stack:error.stack},'*'))
  `, loader: 'ts', resolveDir: process.cwd() }, plugins: [{ name: 'notice-position-fixture', setup(builder) {
    builder.onLoad({ filter: /\.vue$/ }, args => {
      const { descriptor } = parse(readFileSync(args.path, 'utf8'))
      styles.push(...descriptor.styles.map(style => style.content))
      let contents = compileScript(descriptor, { id: 'fixture', inlineTemplate: true }).content
      if (!descriptor.scriptSetup && descriptor.template) {
        contents = contents.replace('export default', 'const component =') + '\n'
          + compileTemplate({ source: descriptor.template.content, filename: args.path, id: 'fixture' }).code.replace('export function render', 'function render')
          + '\ncomponent.render = render; export default component'
      }
      return { contents, loader: 'ts', resolveDir: dirname(args.path) }
    })
  } }], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', resolveExtensions: ['.ts', '.js', '.vue'], define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } })).outputFiles[0].text
  const css = compileString(styles.join('\n').replace(/(-?\d*\.?\d+)rpx/g, 'calc($1 * var(--ms-rpx))')).css
  const dir = mkdtempSync(join(tmpdir(), 'notice-composer-position-'))
  try {
    const fixture = `<!doctype html><style>:root{--ms-rpx:.5px}body{margin:0}${css}</style><div id="app"></div><script>addEventListener('error',e=>parent.postMessage({error:e.message},'*'))</script><script>${code.replace(/<\/script/gi, '<\\/script')}</script>`
    const file = join(dir, 'fixture.html')
    writeFileSync(file, `<pre id="result"></pre><script>const results=[];addEventListener('message',e=>{results.push(e.data);document.querySelector('#result').textContent=JSON.stringify(results)})</script>` + [390, 1440].flatMap(width => [false, true].map(expanded => `<iframe data-expanded="${expanded}" style="width:${width}px;height:900px" srcdoc="${fixture.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe>`)).join(''))
    const run = spawnSync(chrome!, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=2400', `file://${file}`], { encoding: 'utf8', timeout: 25000, maxBuffer: 8 * 1024 * 1024 })
    expect(run.error, run.stderr).toBeUndefined(); expect(run.status, run.stderr).toBe(0)
    const json = run.stdout.match(/<pre id="result"[^>]*>([^<]+)<\/pre>/)?.[1]
    expect(json, run.stdout.slice(-1500)).toBeTruthy()
    const rows = JSON.parse(json!)
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row.error).toBeUndefined()
      for (const state of [row.state]) {
        expect(state.missing, JSON.stringify(rows)).not.toBe(true)
        expect(state.height).toBeGreaterThan(0)
        expect(state.noticeTop).toBeGreaterThanOrEqual(0)
        expect(state.noticeBottom).toBeLessThanOrEqual(state.composerTop - 8)
        expect(state.retryHit).toBe(true)
        expect(state.sendHit).toBe(true)
      }
    }
    for (const width of [390, 1440]) {
      const collapsed = rows.find(row => row.state.viewport === width && !row.expanded)
      const expanded = rows.find(row => row.state.viewport === width && row.expanded)
      expect(expanded.state.composerTop).toBeLessThan(collapsed.state.composerTop)
    }
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) }
}, 60000)
