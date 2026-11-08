// @vitest-environment node
import { expect, it } from 'vitest'
import { build } from 'esbuild'
import { compileScript, parse } from '@vue/compiler-sfc'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

it.each(['normal', 'sandbox'])('keeps %s native more-panel visibility independent of author layout', async surface => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome, 'Native Chrome is required for CSS layer and hidden behavior').toBeTruthy()
  const styles = ['src/common/canvas-theme-vars.css', 'src/pages/canvas/canvas.css', 'src/pages/canvas/canvas-chrome-box.css'].map(file => readFileSync(resolve(file), 'utf8'))
  if (surface === 'sandbox') styles.push(readFileSync(resolve('src/sandbox/shell.css'), 'utf8'))
  const code = (await build({ stdin: { contents: `
    import {createApp,h,ref,nextTick} from 'vue'
    import Composer from './src/pages/canvas/components/canvas-composer.vue'
    const more=ref(false),width=ref(390),rows=[]
    createApp({render:()=>h('div',{class:'canvas-root chat',style:{position:'relative',width:width.value+'px',height:'auto'},'data-chat':${surface === 'sandbox' ? "'root'" : 'undefined'}},[
      h(Composer,{value:'',placeholder:'Synthetic draft',sendState:'send',generating:false,chat:${surface === 'sandbox'},moreOpen:more.value,onMore:()=>more.value=!more.value,
        labels:{more:'More'},moreItems:[{key:'one',label:'First'},{key:'two',label:'Second'},{key:'three',label:'Third'}]}),
      h('div',{class:'mes_text'},[h('div',{class:'more-scope author-owned',hidden:true},'Author-owned layout')])
    ])}).mount('#app')
    const measure=()=>{
      const panel=document.querySelector('[data-chat="more-panel"]'),button=document.querySelector('#options_button'),css=getComputedStyle(panel),box=panel.getBoundingClientRect()
      return {hidden:panel.hidden,open:panel.dataset.open,expanded:button.getAttribute('aria-expanded'),display:css.display,height:box.height,width:box.width,
        childRects:panel.firstElementChild.getClientRects().length,gap:css.gap,padding:css.paddingTop,color:css.color,
        authorDisplay:getComputedStyle(document.querySelector('.author-owned')).display,items:panel.children.length}
    }
    addEventListener('load',async()=>{
      try{
        for(const w of [390,1440])for(const skin of ['plain','flex','grid','block']){
          width.value=w;document.body.dataset.skin=skin;more.value=false;await nextTick()
          const closed=measure();document.querySelector('#options_button').click();await nextTick();const opened=measure()
          document.querySelector('#options_button').click();await nextTick();rows.push({width:w,skin,closed,opened,reclosed:measure()})
        }
        document.querySelector('#result').textContent=JSON.stringify({rows})
      }catch(error){document.querySelector('#result').textContent=JSON.stringify({error:String(error)})}
    })
  `, loader: 'ts', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', alias: { '@': resolve('src') }, resolveExtensions: ['.ts', '.js', '.vue'],
    plugins: [{ name: 'real-composer', setup(builder) { builder.onLoad({ filter: /\.vue$/ }, args => {
      const { descriptor } = parse(readFileSync(args.path, 'utf8'))
      styles.push(...descriptor.styles.map(style => style.content))
      return { contents: compileScript(descriptor, { id: 'more-hidden', inlineTemplate: true }).content, loader: 'ts', resolveDir: dirname(args.path) }
    }) } }], define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } })).outputFiles[0].text
  const dir = mkdtempSync(join(tmpdir(), 'stage-more-panel-hidden-'))
  try {
    const css = styles.join('\n').replace(/(-?\d*\.?\d+)rpx/g, 'calc($1 * var(--ms-rpx))')
    const file = join(dir, 'fixture.html')
    writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>:root{--ms-rpx:.5px}body{margin:0}${css}</style><style>
      /* Reduced author layouts: the failing selector plus ordinary grid/block skins. */
      body[data-skin="flex"] .chat-bottom .more-scope{display:flex!important;gap:13px!important;padding:7px!important;color:rgb(40,50,60)!important}
      body[data-skin="grid"] .chat-bottom .more-scope{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:17px;padding:9px;color:rgb(50,60,70)}
      body[data-skin="block"] .chat-bottom .more-scope{display:block!important;padding:11px!important;color:rgb(60,70,80)!important}
      .mes_text .author-owned[hidden]{display:block!important}
    </style><div id="app"></div><pre id="result"></pre><script>${code.replace(/<\/script/gi, '<\\/script')}</script>`)
    const run = spawnSync(chrome!, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=2000', pathToFileURL(file).href], { encoding: 'utf8', timeout: 25000, maxBuffer: 4 * 1024 * 1024 })
    expect(run.error, run.stderr).toBeUndefined(); expect(run.status, run.stderr).toBe(0)
    const json = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
    expect(json, run.stdout.slice(-2000)).toBeTruthy()
    const result = JSON.parse(json!)
    expect(result.error).toBeUndefined(); expect(result.rows).toHaveLength(8)
    for (const row of result.rows) {
      const note = JSON.stringify({ surface, ...row })
      for (const closed of [row.closed, row.reclosed]) {
        expect(closed.hidden, note).toBe(true); expect(closed.open, note).toBe('off'); expect(closed.expanded, note).toBe('false')
        expect(closed.display, note).toBe('none'); expect(closed.height, note).toBe(0); expect(closed.childRects, note).toBe(0)
      }
      expect(row.opened.hidden, note).toBe(false); expect(row.opened.open, note).toBe('on'); expect(row.opened.expanded, note).toBe('true')
      expect(row.opened.display, note).toBe(row.skin === 'plain' ? 'grid' : row.skin)
      expect(row.opened.height, note).toBeGreaterThan(0); expect(row.opened.items, note).toBe(3)
      if (row.skin === 'flex') { expect(row.opened.gap, note).toBe('13px'); expect(row.opened.padding, note).toBe('7px'); expect(row.opened.color, note).toBe('rgb(40, 50, 60)') }
      if (row.skin === 'grid') { expect(row.opened.gap, note).toBe('17px'); expect(row.opened.padding, note).toBe('9px'); expect(row.opened.color, note).toBe('rgb(50, 60, 70)') }
      if (row.skin === 'block') { expect(row.opened.padding, note).toBe('11px'); expect(row.opened.color, note).toBe('rgb(60, 70, 80)') }
      expect(row.closed.authorDisplay, note).toBe('block'); expect(row.opened.authorDisplay, note).toBe('block')
    }
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) }
}, 60000)
