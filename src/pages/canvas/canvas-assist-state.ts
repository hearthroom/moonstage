import { reactive } from 'vue'

/** Opening a panel is not permission to spend. Only confirm() invokes the provider. */
export function createAssistSession(request: (key:string, regenerate:boolean)=>Promise<string[]>, fill:(text:string)=>void) {
  const state=reactive({ visible:false, confirming:false, busy:false, choices:[] as string[], error:'' })
  const cache=new Map<string,string[]>()
  const pending=new Set<string>()
  let key='', refresh=false
  function show() {
    state.choices=[...(cache.get(key)||[])]; state.busy=pending.has(key)
    state.confirming=!state.choices.length&&!state.busy
  }
  return {
    state,
    context(next:string) { if(next===key)return; key=next; refresh=false; state.visible=false; state.error=''; show() },
    open() { if(!key)return; refresh=false; state.visible=true; state.error=''; show() },
    close() { state.visible=false },
    refresh() { if(state.busy)return; refresh=true; state.confirming=true; state.error='' },
    cancel() { refresh=false; state.confirming=false; if(!state.choices.length)state.visible=false },
    pick(index:number) { const text=state.choices[index]; if(text&&!state.busy&&!state.confirming){fill(text);state.visible=false} },
    async confirm() {
      if(!key||!state.visible||!state.confirming||pending.has(key))return
      const target=key, regenerate=refresh
      pending.add(target); state.busy=true; state.confirming=false; state.error=''
      try {
        const choices=(await request(target,regenerate)).filter(s=>typeof s==='string'&&s.trim()).slice(0,3)
        if(!choices.length)throw new Error('empty_reply')
        cache.set(target,choices)
        if(cache.size>20)cache.delete(cache.keys().next().value!)
        if(key===target)state.choices=choices
      } catch(e) { if(key===target)state.error=e instanceof Error?e.message:'failed' }
      finally { pending.delete(target); if(key===target){state.busy=false;refresh=false} }
    },
  }
}
