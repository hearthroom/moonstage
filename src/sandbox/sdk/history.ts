import { historyError, historyOptions, type HistoryApi, type HistoryCapabilities, type HistoryChange, type HistoryPage } from '../../common/history'

/** The shell never sees host role/conversation IDs or a bearer token. */
export function createRemoteHistory(enabled:boolean, initial:HistoryCapabilities|undefined, request:(op:any,args:unknown[])=>Promise<unknown>) {
 let caps:HistoryCapabilities=initial?{...initial}:{version:1,available:false,reason:'unsupported'}
 let seq=0,disposed=false
 const listeners=new Map<number,(event:HistoryChange)=>void>()
 const invoke=(id:number,event:HistoryChange)=>{const cb=listeners.get(id);if(cb&&!disposed){try{cb(JSON.parse(JSON.stringify(event)))}catch{/* Author errors stay local. */}}}
 const api:HistoryApi={
  capabilities:()=>({...caps,available:!disposed&&caps.available}),
  async list(options={}){
   if(disposed||!enabled)throw historyError('HOST_DENIED')
   if(!caps.available)throw historyError('HISTORY_UNAVAILABLE')
   const page=await request('history.list',[historyOptions(options)]) as HistoryPage
   if(disposed)throw historyError('HISTORY_UNAVAILABLE')
   return page
  },
  onChange(callback){
   if(typeof callback!=='function')throw historyError('HISTORY_CURSOR_INVALID')
   if(listeners.size>=64)throw historyError('HISTORY_LIMIT')
   const id=++seq;listeners.set(id,callback)
   if(enabled&&!disposed){
    void request('history.subscribe',[id]).catch(()=>invoke(id,{conversationKey:null,previousRevision:null,revision:null,kind:'unavailable',changes:[],part:0,final:true}))
   }else queueMicrotask(()=>invoke(id,{conversationKey:null,previousRevision:null,revision:null,kind:'unavailable',changes:[],part:0,final:true}))
   return ()=>{if(!listeners.delete(id))return;if(enabled&&!disposed)void request('history.unsubscribe',[id]).catch(()=>{})}
  },
 }
 return {api,
  receive(id:number,event:HistoryChange){
   if(!listeners.has(id)||disposed)return
   if(event.kind==='reset'&&event.revision!==null)caps={version:1,available:true,reason:'ready'}
   if(event.kind==='unavailable')caps={version:1,available:false,reason:'revoked'}
   invoke(id,event)
  },
  capabilities(next:HistoryCapabilities){caps={...next}},
  dispose(){disposed=true;listeners.clear()},
 }
}
