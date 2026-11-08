import { it, expect } from 'vitest'
import { nextTick } from 'vue'
import { createShell } from '../shell'
import { hideDuplicateStatusbarFlow } from '../render/shell-dom'

it('keeps unrelated tall statusbar content and hides an actual duplicate', () => {
  document.body.innerHTML = '<aside><section id="inventory" style="height:180px">Inventory</section><div class="creation" style="height:400px"><input></div></aside><main><article style="height:160px">Story</article><div class="creation" style="height:400px"><input></div></main>'
  const bar = document.querySelector('aside')!
  hideDuplicateStatusbarFlow(bar, document.querySelector('main')!)
  expect((bar.querySelector('#inventory') as HTMLElement).hidden).toBe(false)
  expect((bar.querySelector('.creation') as HTMLElement).hidden).toBe(true)
})

it('rebinds the executing bubble when two identical scripts are rebuilt', async () => {
  let ready!: (fn: (text: string) => string) => void
  const dictionary = new Promise<(text: string) => string>(resolve => { ready = resolve })
  document.body.innerHTML = '<main id="app"></main>'
  const html = '<button id="form-action">Act</button><script>(function(){document.getElementById("form-action").addEventListener("click",function(){this.textContent += "!"})})()</script>'
  const shell = createShell({
    doc: document, win: window, mount: document.getElementById('app')!,
    config: {theme:'dark',locale:'zh-Hant',cardLanguage:'',role:{name:'Role',avatarUrl:''},user:{nickname:'User',avatarUrl:''},card:{statusbar:'',rules:[{id:'form',find:'form',replace:html,enabled:true}]},capabilities:{saves:false,edit:false,send:true},composer:true},
    transport: {send: () => {}}, displayScript: () => dictionary,
  })
  try {
    shell.handle({type:'messages',messages:['a','b'].map(id => ({id,role:'ai',content:'form',state:'done',serverId:id,view:{name:'Role',html,finished:true}}))})
    await nextTick()
    const button = () => shell.refs.list.querySelector('button')!
    button().click()
    expect(button().textContent).toBe('Act!')
    ready(text => text)
    await dictionary
    await nextTick()
    expect(button().textContent).toBe('Act')
    button().click()
    expect(button().textContent).toBe('Act!')
  } finally { shell.dispose() }
})
