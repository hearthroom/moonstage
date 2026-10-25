import { historyError, historyOptions, historyRevision, type HistoryApi, type HistoryCapabilities, type HistoryChange, type HistoryChangesPage, type HistoryOptions, type HistoryPage } from '../../common/history'

interface Scope { roleId: string; conversationId: string; identity: string }
interface Deps {
 scope(): Scope|null
 reason?(): string
 request(op: 'index'|'changes', args: Record<string, unknown>): Promise<unknown>
 doc?: Document
}
interface Listener { callback: (event:HistoryChange)=>void; start: string|null; active: boolean; initializing?: Promise<void> }
const copy = <T>(value:T):T => JSON.parse(JSON.stringify(value))
const newer = (a:string,b:string) => a.length>b.length||(a.length===b.length&&a>b)

/** One controller per canvas, shared by classic and the sandbox bridge. */
export function createHistoryAdapter(deps:Deps): HistoryApi & { reset():void; check():Promise<void>; dispose():void } {
 let disposed=false, generation=0, watermark:string|null=null, knownHead:string|null=null, key:string|null=null
 let denied=''
 let timer:ReturnType<typeof setTimeout>|undefined
 let checking:Promise<void>|undefined
 let checkAgain=false
 const listeners=new Set<Listener>()
 const inFlight=new Map<string,Promise<unknown>>()
 const identity=()=>JSON.stringify(deps.scope())
 const capabilities=():HistoryCapabilities=>({version:1,available:!disposed&&!denied&&!!deps.scope(),reason:disposed?'revoked':denied||(!deps.scope()?(deps.reason?.()||'no_conversation'):'ready')})
 const empty=(kind:'reset'|'unavailable',revision:string|null=null):HistoryChange=>({conversationKey:key,previousRevision:null,revision,kind,changes:[],part:0,final:true})
 const deliver=(l:Listener,event:HistoryChange)=>{if(l.active&&!disposed){try{l.callback(copy(event))}catch{/* A card callback cannot break another subscriber. */}}}
 const stopTimer=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined}
 const visible=()=>!deps.doc||deps.doc.visibilityState!=='hidden'
 function schedule(){stopTimer();if(!disposed&&listeners.size&&visible()&&!denied)timer=setTimeout(()=>{timer=undefined;void check()},15000)}
 async function read(op:'index'|'changes',options:Record<string,unknown>):Promise<any>{
  const scope=deps.scope();if(disposed||!scope||denied)throw historyError('HISTORY_UNAVAILABLE')
  const mine=generation,owner=identity()
  const args={...options,roleId:scope.roleId,conversationId:scope.conversationId}
  const requestKey=JSON.stringify([op,args])
  let pending=inFlight.get(requestKey)
  if(!pending){
   if([...inFlight.keys()].filter(k=>k.startsWith('[\"'+op+'\",')).length>=(op==='index'?2:1))throw historyError('HISTORY_LIMIT')
   pending=Promise.resolve().then(()=>deps.request(op,args));inFlight.set(requestKey,pending)
   void pending.then(()=>{if(inFlight.get(requestKey)===pending)inFlight.delete(requestKey)},()=>{if(inFlight.get(requestKey)===pending)inFlight.delete(requestKey)})
  }
  let value:any
  try{value=await pending}catch(e:any){
   if(disposed||mine!==generation||owner!==identity())throw historyError('HISTORY_UNAVAILABLE')
   if(e?.status===401||e?.status===403||e?.status===404){
    denied=e.status===401?'not_authenticated':e.status===404&&!e.code?'unsupported':'revoked'
    generation++;inFlight.clear();checking=undefined;checkAgain=false
    key=null;watermark=null;knownHead=null;stopTimer()
    for(const l of listeners)deliver(l,empty('unavailable'))
   }
   throw historyError(['HISTORY_STALE','HISTORY_CURSOR_INVALID','HISTORY_LIMIT','HOST_DENIED','HISTORY_UNAVAILABLE'].includes(e?.code)?e.code:'NETWORK')
  }
  if(disposed||denied||mine!==generation||owner!==identity())throw historyError('HISTORY_UNAVAILABLE')
  if(!value||!historyRevision(value.revision)||typeof value.conversationKey!=='string')throw historyError('NETWORK')
  if(key&&key!==value.conversationKey){reset();throw historyError('HISTORY_UNAVAILABLE')}
  if(op==='index'&&knownHead&&newer(knownHead,value.revision))throw historyError('HISTORY_STALE')
  key=value.conversationKey
  if(!knownHead||newer(value.revision,knownHead))knownHead=value.revision
  return copy(value)
 }
 async function list(options:HistoryOptions={}):Promise<HistoryPage>{
  const page=await read('index',historyOptions(options) as Record<string,unknown>) as HistoryPage
  if(!Array.isArray(page.items)||typeof page.complete!=='boolean'||(page.complete?page.cursor!==null:typeof page.cursor!=='string'||!page.cursor))throw historyError('NETWORK')
  return page
 }
 function initialize(l:Listener):Promise<void>{
  if(l.initializing)return l.initializing
  const mine=generation
  const pending=(async()=>{try{
   const page=await list({limit:1})
   if(disposed||mine!==generation||!l.active)return
   if(watermark===null)watermark=knownHead||page.revision
   l.start=knownHead||page.revision
   deliver(l,empty('reset',l.start));schedule()
  }catch{if(mine===generation&&l.active){deliver(l,empty(denied||!deps.scope()?'unavailable':'reset'));schedule()}}})()
  l.initializing=pending
  void pending.finally(()=>{if(l.initializing===pending)l.initializing=undefined})
  return pending
 }
 async function runCheck(){
  const mine=generation
  if(!listeners.size||!deps.scope()||!visible()||denied)return
  await Promise.all([...listeners].filter(l=>l.start===null).map(initialize))
  if(mine!==generation||!listeners.size||denied||watermark===null)return
  const after=watermark
  let cursor:string|null=null
  let target:string|null=null
  let partial:{revision:string;part:number}|null=null
  do{
   const page=await read('changes',{afterRevision:after,...(cursor?{cursor}:{})}) as HistoryChangesPage
   if(mine!==generation||!listeners.size)return
   if(target!==null&&page.revision!==target)throw historyError('NETWORK')
   target=page.revision
   if(page.reset){
    watermark=page.revision
    for(const l of listeners){l.start=page.revision;deliver(l,empty('reset',page.revision))}
    return
   }
   if(!Array.isArray(page.events))throw historyError('NETWORK')
   for(const event of page.events){
    if(!historyRevision(event.revision)||!historyRevision(event.previousRevision)||!Array.isArray(event.changes)||event.changes.length>200||event.conversationKey!==key)throw historyError('NETWORK')
    if(partial ? event.revision!==partial.revision||event.part!==partial.part+1 : event.previousRevision!==watermark||event.part!==0)throw historyError('NETWORK')
    for(const l of listeners)if(l.start!==null&&newer(event.revision,l.start))deliver(l,event)
    if(mine!==generation||!listeners.size)return
    if(event.final){watermark=event.revision;partial=null}else partial={revision:event.revision,part:event.part}
   }
   if(page.complete){if(page.cursor!==null||partial||watermark!==target)throw historyError('NETWORK');break}
   if(typeof page.cursor!=='string'||!page.cursor||page.cursor===cursor)throw historyError('NETWORK')
   cursor=page.cursor
  }while(cursor)
 }
 function check():Promise<void>{
  if(checking){checkAgain=true;return checking}
  const mine=generation
  checking=runCheck().catch(()=>{
   if(mine!==generation||disposed||denied)return
   // A partial group or an uncertain transport invalidates derived state. Keep
   // the old durable watermark so the complete group can be retried.
   for(const l of listeners)deliver(l,empty('reset'))
  }).finally(()=>{if(mine===generation){checking=undefined;if(checkAgain){checkAgain=false;void check()}else schedule()}})
  return checking
 }
 function reset(){
  generation++;stopTimer();inFlight.clear();checking=undefined;checkAgain=false;watermark=null;knownHead=null;key=null;denied=''
  for(const l of listeners){l.start=null;l.initializing=undefined;deliver(l,empty(deps.scope()?'reset':'unavailable'));void initialize(l)}
 }
 const onVisibility=()=>{if(visible())void check();else stopTimer()}
 deps.doc?.addEventListener('visibilitychange',onVisibility)
 deps.doc?.defaultView?.addEventListener('online',onVisibility)
 return {capabilities,list,
  onChange(callback){
   if(typeof callback!=='function')throw historyError('HISTORY_CURSOR_INVALID')
   if(listeners.size>=64)throw historyError('HISTORY_LIMIT')
   const l:Listener={callback,start:null,active:true};listeners.add(l);void initialize(l)
   return ()=>{l.active=false;listeners.delete(l);if(!listeners.size)stopTimer()}
  },reset,check,
  dispose(){disposed=true;generation++;stopTimer();listeners.clear();inFlight.clear();deps.doc?.removeEventListener('visibilitychange',onVisibility);deps.doc?.defaultView?.removeEventListener('online',onVisibility)},
 }
}

interface AuthorScope {
 suspend(fn:Function, thisArg?:unknown, args?:unknown[]):any
 wrap(fn:Function):Function
 isDisposed():boolean
}

/** Keep host transport outside the author scope, but attribute async card work. */
export function bindHistoryAuthorScope(history:HistoryApi, scope:AuthorScope):HistoryApi {
 const active=()=>{if(scope.isDisposed())throw historyError('HISTORY_UNAVAILABLE')}
 return {
  capabilities(){active();return scope.suspend(history.capabilities,history,[])},
  list(options){active();return scope.suspend(history.list,history,[options])},
  onChange(callback){
   active()
   if(typeof callback!=='function')throw historyError('HISTORY_CURSOR_INVALID')
   const wrapped=scope.wrap(callback)
   return scope.suspend(history.onChange,history,[(event:HistoryChange)=>{if(!scope.isDisposed())wrapped(event)}])
  },
 }
}
