// @vitest-environment node
import { expect, it } from 'vitest'
import { build } from 'esbuild'
import { compileScript, parse } from '@vue/compiler-sfc'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

it('keeps author-restored AI names and avatars above the full-width message lane', async () => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome, 'Install Chrome or set CHROME_BIN').toBeTruthy()
  const styles = ['src/common/canvas-theme-vars.css', 'src/pages/canvas/canvas.css'].map(file => readFileSync(resolve(file), 'utf8'))
  const result = await build({ stdin: { contents: `
    import {createApp,h,nextTick} from 'vue'
    import Message from './src/pages/canvas/components/canvas-message.vue'
    const cases=[]
    for(const width of [390,1440])for(const kind of ['default','name','avatar','short','user'])cases.push({width,kind})
    createApp({render:()=>cases.map(({width,kind},i)=>h('section',{class:'canvas-root chat fixture '+kind,style:{position:'relative',width:width+'px',height:'auto'},'data-case':i},[
      h(Message,{message:{mesid:i,role:kind==='user'?'user':'ai',name:'Layout fixture speaker',avatar:'',html:'<p>'+(kind==='short'?'Hi':'A synthetic reply for checking the available message lane. '.repeat(20))+'</p>',finished:true},chat:{from:kind==='user'?'user':'ai',state:'done',msgId:null,generating:false},labels:{},menuLabel:'Menu'})
    ]))}).mount('#app')
    nextTick(()=>{document.querySelector('#result').textContent=JSON.stringify(cases.map((c,i)=>{
      const root=document.querySelector('[data-case="'+i+'"]'),msg=root.querySelector('.mes'),block=root.querySelector('.mes_block'),bubble=root.querySelector('.mes_text'),name=root.querySelector('.ch_name')
      const box=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}}
      return {...c,message:box(msg),block:box(block),bubble:box(bubble),name:box(name)}
    }))})
  `, loader: 'ts', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
    alias: { '@': resolve('src') }, resolveExtensions: ['.ts', '.js', '.vue'],
    plugins: [{ name: 'real-message-components', setup(builder) { builder.onLoad({ filter: /\.vue$/ }, args => {
      const { descriptor } = parse(readFileSync(args.path, 'utf8'))
      styles.push(...descriptor.styles.map(style => style.content))
      return { contents: compileScript(descriptor, { id: 'message-layout', inlineTemplate: true }).content, loader: 'ts', resolveDir: dirname(args.path) }
    }) } }], define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } })
  const dir = mkdtempSync(join(tmpdir(), 'stage-author-name-'))
  try {
    const file = join(dir, 'messages.html')
    const css = styles.join('\n').replace(/(-?\d*\.?\d+)rpx/g, 'calc($1 * var(--ms-rpx))')
    writeFileSync(file, `<meta charset="utf-8"><style>:root{--ms-rpx:.5px}body{margin:0}${css}
      .fixture.name [data-chat="message-name"],.fixture.avatar [data-chat="message-name"]{display:flex!important}
      .fixture.avatar .mesAvatarWrapper{display:block!important}
      [data-chat="message-body"]{width:100%;box-sizing:border-box}
      </style><div id="app"></div><pre id="result"></pre><script>${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`)
    const run = spawnSync(chrome!, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=1000', pathToFileURL(file).href], { encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024 })
    expect(run.error, run.stderr).toBeUndefined()
    expect(run.status, run.stderr).toBe(0)
    const json = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
    expect(json, run.stdout.slice(-2000)).toBeTruthy()
    const cases = JSON.parse(json!)
    expect(cases).toHaveLength(10)
    for (const c of cases) {
      expect(c.block.width, JSON.stringify(c)).toBeCloseTo(c.message.width, 0)
      expect(c.bubble.right, JSON.stringify(c)).toBeLessThanOrEqual(c.message.right + 1)
      if (c.kind === 'name' || c.kind === 'avatar' || c.kind === 'user') expect(c.name.bottom, JSON.stringify(c)).toBeLessThanOrEqual(c.block.top + 1)
      if (c.kind === 'default' || c.kind === 'short') {
        expect(c.block.top, JSON.stringify(c)).toBe(c.message.top)
        expect(c.block.height, JSON.stringify(c)).toBe(c.message.height)
      }
      if (c.kind === 'short') expect(c.bubble.width).toBeLessThan(c.block.width / 2)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}, 30000)
