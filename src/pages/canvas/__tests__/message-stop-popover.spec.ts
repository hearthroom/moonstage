// @vitest-environment node
import { expect, it } from 'vitest'
import { buildSync } from 'esbuild'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

it('keeps a newly opened native stop popover usable when its modal was already active', () => {
 const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
 expect(chrome).toBeTruthy()
 const code = buildSync({ stdin: { contents: `
 import { createApp, h, ref, watch, nextTick } from 'vue'
 import { useCanvasModalFocus } from './src/pages/canvas/canvas-modal-focus'
 createApp({setup(){
  const modal=ref(null),stop=ref(null),generating=ref(false)
  useCanvasModalFocus(modal,()=>true)
  watch(generating,async value=>{await nextTick();if(value)stop.value.showPopover()})
  setTimeout(async()=>{
   generating.value=true;await nextTick();await nextTick()
   setTimeout(()=>{
    const el=stop.value
    document.querySelector('#result').textContent=JSON.stringify({open:el.matches(':popover-open'),inert:!!el.closest('[inert]'),display:getComputedStyle(el).display})
   },0)
  },0)
  return()=>h('main',[h('div',{class:'composer'},[h('div',{id:'mes_stop',ref:stop,popover:'manual',hidden:!generating.value,tabindex:0},'Stop')]),h('div',{ref:modal,tabindex:-1},[h('button','Copy')])])
 }}).mount('#app')`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', define: {'process.env.NODE_ENV':'"production"',__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'} }).outputFiles[0].text
 const dir=mkdtempSync(join(tmpdir(),'stage-stop-popover-'))
 try {
  const file=join(dir,'fixture.html');writeFileSync(file,`<!doctype html><div id="app"></div><pre id="result"></pre><script>${code}</script>`)
  const run=spawnSync(chrome!,['--headless=new','--no-first-run','--no-default-browser-check',`--user-data-dir=${join(dir,'profile')}`,'--dump-dom','--virtual-time-budget=1000',`file://${file}`],{encoding:'utf8',timeout:20000,maxBuffer:3*1024*1024})
  expect(run.error,run.stderr).toBeUndefined();expect(run.status,run.stderr).toBe(0)
  const json=run.stdout.match(/<pre id="result"[^>]*>([^<]+)<\/pre>/)?.[1];expect(json,run.stdout).toBeTruthy()
  const result=JSON.parse(json!);expect(result.open).toBe(true);expect(result.display).not.toBe('none');expect(result.inert).toBe(false)
 }finally{rmSync(dir,{recursive:true,force:true})}
},30000)
