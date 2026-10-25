import { describe, expect, it, vi } from 'vitest'
import { createRemoteHistory } from '../sdk/history'
const flush=async()=>{for(let n=0;n<8;n++)await Promise.resolve()}
const event={conversationKey:'opaque',previousRevision:'1',revision:'2',kind:'remove' as const,changes:[{op:'remove' as const,id:'opaque-message'}],part:0,final:true}
describe('remote history facade',()=>{
 it('subscribes independently and unsubscribes only the selected listener',async()=>{
  const request=vi.fn(async()=>null)
  const h=createRemoteHistory(true,{version:1,available:true,reason:'ready'},request)
  const a=vi.fn(),b=vi.fn();const off=h.api.onChange(a);h.api.onChange(b);await flush()
  h.receive(1,event);expect(a).toHaveBeenCalledTimes(1);expect(b).not.toHaveBeenCalled()
  off();h.receive(1,event);h.receive(2,event)
  expect(a).toHaveBeenCalledTimes(1);expect(b).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledWith('history.unsubscribe',[1])
  h.dispose();h.receive(2,event);expect(b).toHaveBeenCalledTimes(1)
 })
 it('reports unsupported on v1 without sending history operations',async()=>{
  const request=vi.fn();const h=createRemoteHistory(false,undefined,request)
  expect(h.api.capabilities()).toMatchObject({available:false,reason:'unsupported'})
  await expect(h.api.list()).rejects.toMatchObject({code:'HOST_DENIED'})
  const cb=vi.fn();h.api.onChange(cb);await flush();expect(cb).toHaveBeenCalledWith(expect.objectContaining({kind:'unavailable'}))
  expect(request).not.toHaveBeenCalled();h.dispose()
 })
 it('rejects a list that completes after shell disposal',async()=>{
  let resolve:any;const h=createRemoteHistory(true,{version:1,available:true,reason:'ready'},()=>new Promise(r=>{resolve=r}))
  const pending=h.api.list();h.dispose();resolve({items:[]})
  await expect(pending).rejects.toMatchObject({code:'HISTORY_UNAVAILABLE'})
 })
})
