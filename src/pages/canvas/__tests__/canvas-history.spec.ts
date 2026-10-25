import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHistoryAdapter } from '../canvas-history'

const flush = async () => { for(let n=0;n<12;n++) await Promise.resolve() }
afterEach(()=>vi.useRealTimers())
describe('author history adapter',()=>{
 it('keeps the shared watermark when another listener joins and drops viewport noise',async()=>{
  vi.useFakeTimers()
  let revision='1'
  const request=vi.fn(async(op:string,args:any)=>op==='index'
   ? {conversationKey:'opaque-conversation',revision,items:[],complete:true,cursor:null}
   : {conversationKey:'opaque-conversation',revision,events:args.afterRevision==='1'&&revision==='2'?[{conversationKey:'opaque-conversation',previousRevision:'1',revision:'2',kind:'remove',changes:[{op:'remove',id:'never-mounted'}],part:0,final:true}]:[],reset:false,complete:true,cursor:null})
  const a=createHistoryAdapter({scope:()=>({roleId:'host-card',conversationId:'host-conversation',identity:'owner'}),request,doc:document})
  const old=vi.fn(),later=vi.fn()
  const off=a.onChange(old);await flush()
  revision='2';const off2=a.onChange(later);await flush()
  await a.check();await flush()
  expect(old.mock.calls.some(([event])=>event.kind==='remove'&&event.changes[0].id==='never-mounted')).toBe(true)
  expect(later.mock.calls.filter(([event])=>event.kind==='remove')).toHaveLength(0)
  expect(request.mock.calls.find(([op])=>op==='changes')?.[1].afterRevision).toBe('1')
  off();off2();const calls=request.mock.calls.length;await vi.advanceTimersByTimeAsync(30000)
  expect(request).toHaveBeenCalledTimes(calls);a.dispose()
 })
 it('rejects a late list and never publishes old errors after a scope switch',async()=>{
  let id='one';let resolve:any
  const request=vi.fn(()=>new Promise(r=>{resolve=r}))
  const a=createHistoryAdapter({scope:()=>({roleId:'card',conversationId:id,identity:'owner'}),request,doc:document})
  const pending=a.list({content:true});await flush();id='two';a.reset()
  resolve({conversationKey:'old',revision:'1',items:[],complete:true,cursor:null})
  await expect(pending).rejects.toMatchObject({code:'HISTORY_UNAVAILABLE'})
  a.dispose()
 })
 it('only forwards read options; the card cannot replace scope or headers',async()=>{
  const request=vi.fn(async()=>({conversationKey:'opaque',revision:'1',items:[],complete:true,cursor:null}))
  const a=createHistoryAdapter({scope:()=>({roleId:'host-role',conversationId:'host-conv',identity:'owner'}),request,doc:document})
  await a.list({content:true,roleId:'attacker',conversationId:'attacker',headers:{Authorization:'attacker'}} as any)
  expect(request.mock.calls[0][1]).toEqual({roleId:'host-role',conversationId:'host-conv',content:true})
  a.dispose()
 })
})

describe('history review regressions',()=>{
 const scope=()=>({roleId:'card',conversationId:'conversation',identity:'owner'})
 const page=(revision:string)=>({conversationKey:'opaque',revision,items:[],complete:true,cursor:null})
 it('rejects a delayed snapshot older than an already observed same-conversation head',async()=>{
  let resolve:any
  const a=createHistoryAdapter({scope,request:(_op,args)=>args.limit===1?new Promise(r=>{resolve=r}):Promise.resolve(page('2'))})
  const old=a.list({limit:1});await flush();await a.list({limit:2})
  const rejected=expect(old).rejects.toMatchObject({code:'HISTORY_STALE'});resolve(page('1'));await rejected;a.dispose()
 })
 it('revocation fences every in-flight success even when the visible scope has not changed',async()=>{
  let resolve:any,reject:any
  const a=createHistoryAdapter({scope,request:(_op,args)=>new Promise((yes,no)=>{if(args.limit===1)resolve=yes;else reject=no})})
  const slow=a.list({limit:1}),fast=a.list({limit:2});const fastDone=fast.catch(()=>{});await flush()
  reject({status:403});await fastDone
  const rejected=expect(slow).rejects.toMatchObject({code:'HISTORY_UNAVAILABLE'});resolve({...page('1'),items:[{content:'synthetic old body'}]});await rejected
  expect(a.capabilities()).toMatchObject({available:false,reason:'revoked'});a.dispose()
 })
 it('retries a newly subscribed listener after its first head request fails',async()=>{
  vi.useFakeTimers();let revision='1',fail=false
  const request=vi.fn(async(op:string,args:any)=>{
   if(op==='index'){if(fail){fail=false;throw{status:503}};return page(revision)}
   return {...page(revision),reset:false,events:args.afterRevision===revision?[]:[{conversationKey:'opaque',previousRevision:args.afterRevision,revision,kind:'remove',changes:[{op:'remove',id:'opaque-item'}],part:0,final:true}]}
  })
  const a=createHistoryAdapter({scope,request})
  const old=vi.fn(),later=vi.fn();a.onChange(old);await flush();fail=true;a.onChange(later);await flush()
  revision='2';await a.check();await flush();revision='3';await a.check();await flush()
  expect(later.mock.calls.some(([e])=>e.kind==='reset'&&e.revision==='2')).toBe(true)
  expect(later.mock.calls.some(([e])=>e.kind==='remove'&&e.revision==='3')).toBe(true);a.dispose()
 })
})
