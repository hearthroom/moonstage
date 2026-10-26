// @vitest-environment node
import { expect, it } from 'vitest'
import { build } from 'esbuild'
import { parse, compileScript } from '@vue/compiler-sfc'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const source = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
const binding = source.match(/^useCanvasModalFocus\(sandboxFrame,.*$/m)![0]

it('keeps host response preferences interactive in classic and sandbox modes in native Chrome', async () => {
 const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
 expect(chrome).toBeTruthy()
 for (const [sandbox, sheet] of [[false, 'response-settings'], [true, 'response-settings'], [true, 'model']] as const) {
  const code = (await build({ stdin: { contents: `
   import {createApp,h,ref,nextTick} from 'vue'
   import Popup from './src/pages/canvas/components/canvas-popup.vue'
   import Panel from './src/pages/canvas/components/canvas-response-settings.vue'
   import {useCanvasModalFocus} from './src/pages/canvas/canvas-modal-focus'
   const panel=ref({sheet:''}),sandboxCard=ref(${sandbox}),menuOpen=ref(false)
   createApp({setup(){const sandboxFrame=ref(null)
    ${binding}
    setTimeout(async()=>{
     panel.value.sheet='${sheet}';await nextTick();await nextTick()
     setTimeout(()=>{
      const popup=document.querySelector('.u-popup.is-open'),close=popup.querySelector('.u-popup__content__close')
      const result={open:popup.matches(':popover-open'),inert:!!close.closest('[inert]'),iframeInert:!!document.querySelector('iframe').closest('[inert]')}
      close.click()
      nextTick(async()=>{result.closed=!document.querySelector('[data-lt="response-settings"]');panel.value.sheet='persona';await nextTick();await nextTick();result.shellIframeInert=!!document.querySelector('iframe').closest('[inert]');result.shellBackgroundInert=!!document.querySelector('#background').closest('[inert]');document.querySelector('#result').textContent=JSON.stringify(result)})
     },0)
    },0)
    return()=>h('main',[h('button',{id:'background'},'Background'),h('iframe',{ref:sandboxFrame}),panel.value.sheet==='${sheet}'?h(Popup,{open:true,onClose:()=>panel.value.sheet=''}, {default:()=>h(Panel,{conversationId:'fixture',t:k=>k,load:async()=>({conversationId:'fixture',schemaVersion:1,revision:0,overrides:{},effective:{agency:'coauthor',style:'card',perspective:'card',length:'auto',pace:'natural'}}),save:async()=>({})})}):null])
   }}).mount('#app')`, resolveDir: process.cwd(), loader: 'ts' },
   plugins: [{name:'vue-fixture',setup(build){build.onLoad({filter:/\.vue$/},args=>{
    const {descriptor}=parse(readFileSync(args.path,'utf8'))
    return {contents:compileScript(descriptor,{id:'fixture',inlineTemplate:true}).content,loader:'ts',resolveDir:dirname(args.path)}
   })}}], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
   resolveExtensions:['.ts','.js','.vue'],
   define:{'process.env.NODE_ENV':'"production"',__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'} })).outputFiles[0].text
  const dir=mkdtempSync(join(tmpdir(),'stage-response-focus-'))
  try {
   const file=join(dir,'fixture.html');writeFileSync(file,`<!doctype html><div id="app"></div><pre id="result"></pre><script>${code}</script>`)
   const run=spawnSync(chrome!,['--headless=new','--no-first-run','--no-default-browser-check',`--user-data-dir=${join(dir,'profile')}`,'--dump-dom','--virtual-time-budget=1000',`file://${file}`],{encoding:'utf8',timeout:20000,maxBuffer:4*1024*1024})
   expect(run.error,run.stderr).toBeUndefined();expect(run.status,run.stderr).toBe(0)
   const json=run.stdout.match(/<pre id="result"[^>]*>([^<]+)<\/pre>/)?.[1];expect(json,run.stdout.slice(-2000)).toBeTruthy()
   expect(JSON.parse(json!),`sandbox=${sandbox}, sheet=${sheet}`).toEqual({open:true,inert:false,iframeInert:true,closed:true,shellIframeInert:false,shellBackgroundInert:sandbox})
  }finally{rmSync(dir,{recursive:true,force:true})}
 }
},60000)
