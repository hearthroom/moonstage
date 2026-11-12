// @vitest-environment node
import { expect, it } from 'vitest'
import { build } from 'esbuild'
import { compileScript, parse } from '@vue/compiler-sfc'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { observeNativeBrowser } from '../../../test-support/native-browser'

it('reserves touch message long-press for platform actions while retaining desktop selection and author inputs', async () => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome).toBeTruthy()
  const styles = ['src/common/canvas-theme-vars.css', 'src/pages/canvas/canvas.css', 'src/sandbox/shell.css'].map(file => readFileSync(resolve(file), 'utf8'))
  const result = await build({ stdin: { contents: `
    import {createApp,h,ref,nextTick} from 'vue'
    import Message from './src/pages/canvas/components/canvas-message.vue'
    const sandbox=ref(false);window.menuCount=0;window.actions=[]
    createApp({render:()=>h('main',{class:'canvas-root chat'},[h(Message,{
      message:{id:'fixture',mesid:1,role:'ai',name:'Synthetic speaker',avatar:'',finished:true,html:'<p id="prose">Synthetic message for a sustained touch.</p><input id="author-input" value="Editable author text"><textarea id="author-textarea">Editable textarea</textarea><div id="author-editable" contenteditable="true"><span id="author-child">Editable region</span></div>'},
      chat:sandbox.value?{from:'ai',state:'done',msgId:'saved-fixture',generating:false}:null,
      onMenu:()=>window.menuCount++,onAction:key=>window.actions.push(key)
    })])}).mount('#app')
    window.configure=async mode=>{sandbox.value=mode;window.menuCount=0;window.actions=[];getSelection().removeAllRanges();await nextTick()}
    window.inspect=()=>{const p=document.querySelector('#prose'),r=p.getBoundingClientRect();return {
      coarse:matchMedia('(hover:none) and (pointer:coarse)').matches,
      prose:getComputedStyle(p).userSelect,input:getComputedStyle(document.querySelector('#author-input')).userSelect,
      editable:getComputedStyle(document.querySelector('#author-editable')).userSelect,
      x:r.left+20,y:r.top+10,menuCount:window.menuCount,selection:getSelection().toString()
    }}
    window.contextPrevented=null;document.addEventListener('contextmenu',e=>window.contextPrevented=e.defaultPrevented)
  `, loader:'ts', resolveDir:process.cwd() }, plugins:[{name:'message-fixture',setup(builder){builder.onLoad({filter:/\.vue$/},args=>{
    const {descriptor}=parse(readFileSync(args.path,'utf8'));styles.push(...descriptor.styles.map(style=>style.content))
    return {contents:compileScript(descriptor,{id:'touch-message',inlineTemplate:true}).content,loader:'ts',resolveDir:dirname(args.path)}
  })}}],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',alias:{'@':resolve('src')},resolveExtensions:['.ts','.js','.vue'],
    define:{'process.env.NODE_ENV':'"production"',__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'} })
  const dir=mkdtempSync(join(tmpdir(),'stage-message-touch-'))
  const file=join(dir,'fixture.html')
  writeFileSync(file,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--ms-rpx:.5px}body{margin:0}${styles.join('\n').replace(/(-?\d*\.?\d+)rpx/g,'calc($1 * var(--ms-rpx))')}</style><div id="app"></div><script>${result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script>`)
  const proc=spawn(chrome!,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${join(dir,'profile')}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'})
  const shutdown=observeNativeBrowser(proc)
  let ws:WebSocket|undefined,closeBrowser:(()=>Promise<unknown>)|undefined,primaryError:unknown
  const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
  try {
    const portFile=join(dir,'profile','DevToolsActivePort')
    let endpoint=''
    for(let attempt=0;attempt<100;attempt++){
      if(existsSync(portFile)) { const [port,path]=readFileSync(portFile,'utf8').trim().split('\n');if(/^\d+$/.test(port)&&path?.startsWith('/devtools/browser/')){endpoint=`ws://127.0.0.1:${port}${path}`;break} }
      await pause(50)
    }
    expect(endpoint).not.toBe('')
    ws=new WebSocket(endpoint)
    await new Promise<void>((resolve,reject)=>{ws!.onopen=()=>resolve();ws!.onerror=reject})
    let seq=0
    const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>()
    ws.onmessage=event=>{const m=JSON.parse(String(event.data)),p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}
    ws.onclose=()=>{for(const p of pending.values())p.reject(Error('Chrome closed'));pending.clear()}
    const send=(method:string,params={},sessionId?:string):Promise<any>=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws!.send(JSON.stringify({id,method,params,sessionId}))})
    closeBrowser=()=>send('Browser.close')
    const {targetId}=await send('Target.createTarget',{url:'about:blank'})
    const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
    const evaluate=async(expression:string)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
    await send('Page.enable',{},sessionId)
    await send('Page.navigate',{url:pathToFileURL(file).href},sessionId)
    for(let attempt=0;!await evaluate('typeof window.configure==="function"')&&attempt<100;attempt++)await pause(50)
    for(const mobile of [true,false]){
      await send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1440,height:mobile?844:900,deviceScaleFactor:1,mobile},sessionId)
      await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:1},sessionId)
      for(const sandbox of [false,true]){
        await evaluate(`window.configure(${sandbox})`)
        const before=await evaluate('window.inspect()')
        expect(before.coarse).toBe(mobile)
        expect(before.input).not.toBe('none');expect(before.editable).not.toBe('none')
        if(mobile){
          expect(before.prose,JSON.stringify({sandbox,...before})).toBe('none')
          await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:before.x,y:before.y}]},sessionId)
          await pause(600)
          await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},sessionId)
          const after=await evaluate('window.inspect()')
          expect(after.menuCount).toBe(1);expect(after.selection).toBe('')
          for (const selector of ['#author-input', '#author-textarea', '#author-child']) {
            const point = await evaluate(`(()=>{const el=document.querySelector('${selector}');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return{x:r.left+Math.min(15,r.width/2),y:r.top+r.height/2}})()`)
            await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]},sessionId)
            await pause(600)
            await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},sessionId)
            expect((await evaluate('window.inspect()')).menuCount).toBe(1)
          }
          await evaluate('window.scrollTo(0,0)')
        }else{
          expect(before.prose).not.toBe('none')
          await send('Input.dispatchMouseEvent',{type:'mousePressed',x:before.x,y:before.y,button:'right',clickCount:1},sessionId)
          await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:before.x,y:before.y,button:'right',clickCount:1},sessionId)
          expect(await evaluate('window.contextPrevented')).toBe(false)
          expect((await evaluate('window.inspect()')).menuCount).toBe(0)
        }
        await evaluate('document.querySelector(".mes_copy").click()')
        expect(await evaluate('window.actions')).toEqual(['copy'])
      }
    }
  }catch(error){primaryError=error;throw error}
  finally{
    try{await shutdown(async()=>{if(!closeBrowser)throw Error('Chrome setup incomplete');await closeBrowser()});rmSync(dir,{recursive:true,force:true})}
    catch(error){throw primaryError?new AggregateError([primaryError,error],`Touch test failed; retained ${dir}`):error}
    finally{ws?.close()}
  }
},30000)
