// @vitest-environment node
import { expect, it } from 'vitest'
import { build } from 'esbuild'
import { compileScript, parse } from '@vue/compiler-sfc'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

it.each(['classic', 'sandbox'])('wraps %s fenced status text without changing whitespace or frontend documents', async surface => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome, 'Install Chrome or set CHROME_BIN').toBeTruthy()
  const styles = ['src/common/canvas-theme-vars.css', 'src/pages/canvas/canvas.css'].map(file => readFileSync(file, 'utf8'))
  if (surface === 'sandbox') styles.push(readFileSync('src/sandbox/shell.css', 'utf8'))
  const texts = ['    Status: '+ 'unbroken-status-'.repeat(100) + '\n\tNext: 原本的換行與縮排', '  Mood: calm\n    HP: 80']
  const result = await build({ stdin: { contents: `
    import {createApp,h,nextTick} from 'vue'
    import Message from './src/pages/canvas/components/canvas-message.vue'
    import render from './src/utils/rich-text-renderer.js'
    const texts=${JSON.stringify(texts)},surface=${JSON.stringify(surface)},cases=[]
    for(const width of [390,1440])for(const mode of ['dark','light'])for(const kind of ['long','short','frontend','author'])cases.push({width,mode,surface,kind})
    createApp({render:()=>cases.map((c,i)=>h('section',{class:'canvas-root fixture '+c.kind,style:{position:'relative',width:c.width+'px',height:'auto'},'data-case':i,'data-theme':c.mode},[
      h(Message,{message:{mesid:i,role:'ai',name:'Synthetic status',avatar:'',html:c.kind==='frontend'?'<pre class="lt-frontend"><code>Document placeholder</code></pre>':render('~~~text\\n'+texts[c.kind==='short'?1:0]+'\\n~~~'),finished:true},chat:c.surface==='sandbox'?{from:'ai',state:'done',generating:false}:undefined,labels:{}})
    ]))}).mount('#app')
    nextTick(()=>{document.querySelector('#result').textContent=JSON.stringify(cases.map((c,i)=>{
      const root=document.querySelector('[data-case="'+i+'"]'),bubble=root.querySelector('.mes_text'),pre=root.querySelector('pre'),code=pre.querySelector('code')
      const box=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height}}
      const range=document.createRange();range.selectNodeContents(code)
      return {...c,bubble:box(bubble),pre:box(pre),code:box(code),text:code.textContent,whiteSpace:getComputedStyle(code).whiteSpace,visibility:getComputedStyle(code).visibility,
        scrollWidth:code.scrollWidth,clientWidth:code.clientWidth,lines:[...range.getClientRects()].map(r=>({left:r.left,right:r.right,top:r.top}))}
    }))})
  `, loader: 'ts', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
    alias: { '@': resolve('src') }, resolveExtensions: ['.ts', '.js', '.vue'],
    plugins: [{ name: 'real-message', setup(builder) { builder.onLoad({ filter: /\.vue$/ }, args => {
      const { descriptor } = parse(readFileSync(args.path, 'utf8'))
      styles.push(...descriptor.styles.map(style => style.content))
      return { contents: compileScript(descriptor, { id: 'code-wrap', inlineTemplate: true }).content, loader: 'ts', resolveDir: dirname(args.path) }
    }) } }], define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } })
  const dir = mkdtempSync(join(tmpdir(), 'stage-code-wrap-'))
  try {
    const file = join(dir, 'messages.html')
    const css = styles.join('\n').replace(/(-?\d*\.?\d+)rpx/g, 'calc($1 * var(--ms-rpx))')
    writeFileSync(file, `<meta charset="utf-8"><style>:root{--ms-rpx:.5px}body{margin:0}${css}\n.author pre>code{white-space:pre;overflow-x:auto}</style><div id="app"></div><pre id="result"></pre><script>${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`)
    const run = spawnSync(chrome!, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=1000', pathToFileURL(file).href], { encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024 })
    expect(run.error, run.stderr).toBeUndefined(); expect(run.status, run.stderr).toBe(0)
    const json = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
    expect(json, run.stdout.slice(-2000)).toBeTruthy()
    const cases = JSON.parse(json!)
    expect(cases).toHaveLength(16)
    for (const c of cases) {
      const note=JSON.stringify(c)
      if(c.kind==='frontend'){expect(c.visibility,note).toBe('hidden');continue}
      expect(c.text,note).toBe(texts[c.kind==='short'?1:0]+'\n')
      if(c.kind==='author'){expect(c.whiteSpace,note).toBe('pre');continue}
      expect(c.pre.left,note).toBeGreaterThanOrEqual(c.bubble.left-1)
      expect(c.pre.right,note).toBeLessThanOrEqual(c.bubble.right+1)
      expect(c.scrollWidth,note).toBeLessThanOrEqual(c.clientWidth+1)
      expect(c.whiteSpace,note).toBe('pre-wrap')
      expect(c.lines.every((r:any)=>r.left>=c.pre.left-1&&r.right<=c.pre.right+1),note).toBe(true)
      if(c.kind==='long')expect(new Set(c.lines.map((r:any)=>r.top)).size,note).toBeGreaterThan(2)
      if(c.kind==='short')expect(c.bubble.width,note).toBeLessThan(c.width/2)
    }
  } finally { rmSync(dir, {recursive:true,force:true}) }
}, 30000)
