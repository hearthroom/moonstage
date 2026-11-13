import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createAuthorScope } from '@/utils/author-asset-scope.js'
import * as historyModule from '../canvas-history'

const source=readFileSync('src/pages/canvas/canvas.vue','utf8')
const start=source.indexOf('function hostOutsideAuthorScope(')
const extracted=source.slice(start,source.indexOf('\n//',start))
describe('classic history author lifecycle',()=>{
 it('runs asynchronous history callbacks in the author scope and cleans their HUD and timers',()=>{
  vi.useFakeTimers();document.body.innerHTML=''
  const scope=createAuthorScope({doc:document,win:window});let callback:any
  const history={capabilities:()=>({version:1,available:true,reason:'ready'}),list:async()=>({items:[]}),onChange:(cb:any)=>{callback=cb;return()=>{}}}
  const outside=new Function('bindHistoryAuthorScope',extracted+';return hostOutsideAuthorScope;')((historyModule as any).bindHistoryAuthorScope)
  const wrapped=outside({history},scope)
  try{
   scope.run(()=>wrapped.history.onChange(()=>{const node=document.createElement('div');node.id='synthetic-history-hud';document.body.append(node);window.setInterval(()=>{},1000)}))
   callback({kind:'reset'});expect(document.getElementById('synthetic-history-hud')).not.toBeNull()
   scope.dispose();expect(document.getElementById('synthetic-history-hud')).toBeNull();expect(scope.timerCount()).toBe(0)
  }finally{scope.dispose();vi.clearAllTimers();vi.useRealTimers();document.body.innerHTML=''}
 })
 it('收掉作者範圍（離場或擴充重建）時，卡片訂閱的歷史監聽一併退訂，不留在宿主那邊輪詢',()=>{
  const scope=createAuthorScope({doc:document,win:window})
  const off=vi.fn()
  const history={capabilities:()=>({version:1,available:true,reason:'ready'}),list:async()=>({items:[]}),onChange:vi.fn(()=>off)}
  const bound=(historyModule as any).bindHistoryAuthorScope(history,scope)
  bound.onChange(()=>{});bound.onChange(()=>{})
  expect(off).not.toHaveBeenCalled()
  scope.dispose()
  expect(off).toHaveBeenCalledTimes(2)
  document.body.innerHTML=''
 })
})
