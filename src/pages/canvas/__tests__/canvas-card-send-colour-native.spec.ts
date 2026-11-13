// @vitest-environment node
import { expect, it } from 'vitest'
import { build } from 'esbuild'
import { compileScript, parse } from '@vue/compiler-sfc'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

it('applies an explicit card send colour in Classic and Sandbox, restores defaults on clear, and lets display rules win', async () => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome, 'Native Chrome is required for CSS variables and cascade layers').toBeTruthy()
  const styles = ['src/common/canvas-theme-vars.css', 'src/pages/canvas/canvas.css', 'src/pages/canvas/canvas-chrome-box.css', 'src/sandbox/shell.css'].map(file => readFileSync(resolve(file), 'utf8'))
  const code = (await build({
    stdin: { contents: String.raw`
      import {createApp,h,nextTick} from 'vue'
      import Composer from './src/pages/canvas/components/canvas-composer.vue'
      import {createShell} from './src/sandbox/shell.ts'
      import {compileCardCss,createCardCssMount} from './src/common/card-css.ts'
      const css = '/* lt-card-appearance:start */\n.canvas-root { --lt-canvas-send-bg: #923455; }\n/* lt-card-appearance:end */'
      const read = root => [...root.querySelectorAll('.lt-send')].map(el => ({background:getComputedStyle(el).backgroundColor,colour:getComputedStyle(el).color}))
      const results=[]
      window.addEventListener('load',async()=>{
      for (const mode of ['light','dark']) for (const page of ['classic','sandbox']) {
        document.documentElement.dataset.theme=mode
        const host=document.getElementById('app');host.innerHTML=''
        let app,shell,root
        if(page==='classic') {
          host.innerHTML='<div class="canvas-root"><div id="composer"></div></div>'
          root=host.firstElementChild
          app=createApp({render:()=>h(Composer,{value:'Synthetic draft',sendState:'send',generating:false})})
          app.mount('#composer')
        } else {
          shell=createShell({doc:document,win:window,mount:host,config:{theme:mode,locale:'en',role:{name:'Synthetic',avatarUrl:''},user:{nickname:'Reader',avatarUrl:''},card:{rules:[],statusbar:''},capabilities:{saves:false,edit:false,send:true},composer:true,chromeState:{header:{roleName:'Synthetic',avatar:'',badge:'',backLabel:'Back'},composer:{placeholder:'Synthetic draft',sendState:'send',generating:false,enterSends:true,shortcuts:[],moreOpen:false,moreItems:[],modelScore:'',assistBusy:false,assistCost:'',labels:{stop:'Stop',more:'More',send:'Send',paste:'Paste',clear:'Clear',model:'Model',assist:'Assist',perTurn:'Per turn'}}}},transport:{send(){}}})
          root=host.querySelector('.canvas-root')
        }
        await nextTick()
        const before=read(root),mount=createCardCssMount(document)
        const disabled=()=>{const buttons=[...root.querySelectorAll('.lt-send')];buttons.forEach(el=>el.classList.replace('is-send','is-send-disabled'));const value=read(root);buttons.forEach(el=>el.classList.replace('is-send-disabled','is-send'));return value}
        const disabledBefore=disabled()
        const cells=[]
        for(const dialect of ['', 'fengyue']) {
          const compiled=compileCardCss({cardCss:css,cardCssDialect:dialect})
          mount.set(compiled,{nativeRootVariables:!dialect});await nextTick()
          const custom=read(root),disabledCustom=disabled()
          const override=document.createElement('style');override.textContent='.lt-send{background:rgb(12,34,56)}';document.head.append(override)
          const ruleWins=read(root);override.remove()
          mount.set('');await nextTick()
          cells.push({dialect,custom,disabledCustom,ruleWins,cleared:read(root)})
        }
        // Public root variables also work in handwritten card.css without an editor marker.
        mount.set(compileCardCss({cardCss:'.canvas-root{--lt-canvas-send-bg:#923455}'}),{nativeRootVariables:true})
        const handwritten=read(root)
        mount.dispose();await nextTick()
        results.push({mode,page,before,disabledBefore,cells,handwritten,disposed:read(root)})
        app?.unmount();shell?.dispose()
      }
      document.getElementById('result').textContent=JSON.stringify(results)
      })
    `, loader: 'ts', resolveDir: process.cwd() },
    alias: { '@': resolve('src') },
    plugins: [{ name: 'composer-fixture', setup(builder) {
      builder.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }))
      builder.onLoad({ filter: /\.vue$/ }, args => {
      const { descriptor } = parse(readFileSync(args.path, 'utf8'))
      styles.push(...descriptor.styles.map(style => style.content))
      return { contents: compileScript(descriptor, { id: 'fixture', inlineTemplate: true }).content, loader: 'ts', resolveDir: dirname(args.path) }
    }) } }],
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', resolveExtensions: ['.ts', '.js', '.vue'],
    define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  })).outputFiles[0].text
  const dir = mkdtempSync(join(tmpdir(), 'stage-card-send-colour-'))
  try {
    const file = join(dir, 'fixture.html')
    const css = styles.join('\n').replace(/(-?\d*\.?\d+)rpx/g, 'calc($1 * var(--ms-rpx))')
    writeFileSync(file, `<!doctype html><style>:root{--ms-rpx:.5px}${css}</style><div id="app"></div><pre id="result"></pre><script>${code.replace(/<\/script/gi, '<\\/script')}</script>`)
    const run = spawnSync(chrome!, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=3000', `file://${file}`], { encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024 })
    expect(run.error, run.stderr).toBeUndefined(); expect(run.status, run.stderr).toBe(0)
    const json = run.stdout.match(/<pre id="result"[^>]*>([^<]+)<\/pre>/)?.[1]
    expect(json, run.stdout.slice(-2000)).toBeTruthy()
    const results = JSON.parse(json!)
    expect(results).toHaveLength(4)
    for (const result of results) {
      expect(result.before, `${result.page}/${result.mode}: both composer states`).toHaveLength(2)
      for (const cell of result.cells) {
        expect(cell.custom.map(button => button.background), `${result.page}/${result.mode}/${cell.dialect}: explicit colour`).toEqual(['rgb(146, 52, 85)', 'rgb(146, 52, 85)'])
        expect(cell.disabledCustom).toEqual(result.disabledBefore)
        expect(cell.ruleWins.map(button => button.background)).toEqual(['rgb(12, 34, 56)', 'rgb(12, 34, 56)'])
        expect(cell.cleared).toEqual(result.before)
      }
      expect(result.handwritten.map(button => button.background)).toEqual(['rgb(146, 52, 85)', 'rgb(146, 52, 85)'])
      expect(result.disposed).toEqual(result.before)
    }
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) }
}, 60000)
