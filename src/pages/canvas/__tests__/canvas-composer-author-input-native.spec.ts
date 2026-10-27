// @vitest-environment node
import { expect, it } from 'vitest'
import { build } from 'esbuild'
import { compileScript, parse } from '@vue/compiler-sfc'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

it('lets legacy visible-input choices fill and focus the collapsed composer without touching author fields', async () => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome, 'Native Chrome is required for offsetParent and focus').toBeTruthy()
  const styles = ['src/common/canvas-theme-vars.css', 'src/pages/canvas/canvas.css', 'src/pages/canvas/canvas-chrome-box.css'].map(file => readFileSync(resolve(file), 'utf8'))
  const code = (await build({ stdin: { contents: `
    import {createApp,h,ref,nextTick} from 'vue'
    import Composer from './src/pages/canvas/components/canvas-composer.vue'
    const value=ref(''),author=document.querySelector('#author')
    createApp({render:()=>h('div',{class:'canvas-root chat'},[h(Composer,{value:value.value,'onUpdate:value':v=>value.value=v,placeholder:'Synthetic draft',sendState:'send',generating:false})])}).mount('#app')
    const fill=text=>{
      const candidates=[...document.querySelectorAll('.chat-bottom textarea,.uni-textarea textarea,.chat-input-scope textarea')]
      const target=candidates.reverse().find(el=>el.offsetParent!==null)||[...document.querySelectorAll('textarea,input[type=text]')].filter(el=>el.offsetParent!==null).at(-1)
      if(!target)return
      target.focus();Object.getOwnPropertyDescriptor(target instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(target,text)
      target.dispatchEvent(new Event('input',{bubbles:true}))
    }
    window.addEventListener('load',async()=>{
      await nextTick();await new Promise(resolve=>setTimeout(resolve,50))
      const box=document.querySelector('.chatMsgTextarea'),textarea=document.querySelector('#send_textarea')
      const before={preview:!!document.querySelector('.chat-input-collapsed-display').offsetParent,box:box.getBoundingClientRect().toJSON(),tabindex:textarea.tabIndex}
      // Positive control: the former display:none state loses the target and writes the author field.
      const old=box.style.display;box.style.display='none';fill('Control');await nextTick()
      const control={draft:value.value,author:author.value};author.value='';box.style.display=old
      document.querySelector('#choice').onclick=()=>fill('Synthetic choice')
      document.querySelector('#choice').click();await nextTick();await new Promise(resolve=>setTimeout(resolve,50));await nextTick()
      const result={before,control,draft:value.value,author:author.value,focused:document.activeElement===textarea,expanded:document.querySelector('.chat-input-scope').classList.contains('is-expanded'),tabindex:textarea.tabIndex}
      parent.postMessage(result,'*')
    })
  `, loader:'ts', resolveDir:process.cwd() }, plugins:[{name:'composer-fixture',setup(builder){builder.onLoad({filter:/\.vue$/},args=>{
    const {descriptor}=parse(readFileSync(args.path,'utf8'));styles.push(...descriptor.styles.map(style=>style.content))
    return {contents:compileScript(descriptor,{id:'fixture',inlineTemplate:true}).content,loader:'ts',resolveDir:dirname(args.path)}
  })}}],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',resolveExtensions:['.ts','.js','.vue'],define:{'process.env.NODE_ENV':'"production"',__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'}})).outputFiles[0].text
  const dir=mkdtempSync(join(tmpdir(),'stage-author-input-'))
  try {
    const css=styles.join('\n').replace(/(-?\d*\.?\d+)rpx/g,'calc($1 * var(--ms-rpx))')
    const fixture=`<!doctype html><script>addEventListener('error',e=>parent.postMessage({error:e.message},'*'));addEventListener('unhandledrejection',e=>parent.postMessage({error:String(e.reason)},'*'))</script><style>:root{--ms-rpx:.5px}body{margin:0}${css}</style><input id="author" type="text"><button id="choice">Synthetic choice</button><div id="app"></div><script>${code.replace(/<\/script/gi,'<\\/script')}</script>`
    {
      const file=join(dir,'fixture.html')
      const receiver='<pre id="result"></pre><script>addEventListener("message",e=>document.querySelector("#result").textContent=JSON.stringify(e.data))</script>'
      writeFileSync(file,fixture+receiver)
      const run=spawnSync(chrome!,['--headless=new','--no-first-run','--no-default-browser-check',`--user-data-dir=${join(dir,'profile')}`,'--dump-dom','--virtual-time-budget=1500',`file://${file}`],{encoding:'utf8',timeout:20000,maxBuffer:4*1024*1024})
      expect(run.error,run.stderr).toBeUndefined();expect(run.status,run.stderr).toBe(0)
      const json=run.stdout.match(/<pre id="result"[^>]*>([^<]+)<\/pre>/)?.[1]
      expect(json,run.stdout.slice(-1500)).toBeTruthy()
      const result=JSON.parse(json!)
      expect(result.error).toBeUndefined()
      expect(result.control).toEqual({draft:'',author:'Control'})
      expect(result.before.preview).toBe(true)
      expect(result.draft,'legacy choice must reach the platform draft').toBe('Synthetic choice')
      expect(result.author).toBe('')
      expect(result.focused).toBe(true)
      expect(result.expanded).toBe(true)
      expect(result.before.tabindex).toBe(-1)
      expect(result.tabindex).toBe(0)
      expect(result.before.box.width).toBeLessThanOrEqual(1)
      expect(result.before.box.height).toBeLessThanOrEqual(1)
    }
  }finally{rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
},60000)
