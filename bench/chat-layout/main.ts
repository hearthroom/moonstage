import { createApp, h } from 'vue'
import { createShell } from '../../src/sandbox/shell'
import { bindBubbleFit } from '../../src/pages/canvas/canvas-bubble-fit'
import { bindAuthorSideDock, collectFixedRoots } from '../../src/pages/canvas/canvas-author-side-dock'
import { mountFrontendBlocks } from '../../src/common/frontend-block'
import type { SandboxMessage } from '../../src/sandbox/protocol'
import CanvasStage from '../../src/pages/canvas/components/canvas-stage.vue'
import CanvasHeader from '../../src/pages/canvas/components/canvas-header.vue'
import CanvasMessage from '../../src/pages/canvas/components/canvas-message.vue'
import '../../src/common/canvas-theme-vars.css'
import '../../src/pages/canvas/canvas.css'
import '../../src/sandbox/shell.css'

// Synthetic MMD-style author CSS, not copied player content. The same markup and
// CSS run in both modes. No author width override is applied to platform bubbles.
const params = new URLSearchParams(location.search)
const header = { roleName: 'Chat layout regression', avatar: '', badge: '', backLabel: 'Back' }

const ordinaryPanel = '<div class="opening-panel"><h3>Journey panel</h3><p>Choose the first scene.</p></div>'
const panel = params.has('frontend') ? '<pre class="lt-frontend"><code>&lt;!DOCTYPE html&gt;&lt;html&gt;&lt;body&gt;&lt;h3&gt;Journey panel&lt;/h3&gt;&lt;p&gt;Choose the first scene.&lt;/p&gt;&lt;/body&gt;&lt;/html&gt;</code></pre>' : ordinaryPanel
const dockMarkup = params.has('docks') ? '<div class="legacy-dock left">Map</div><div class="legacy-dock right">Info</div>' : ''
const longText = '<p>' + 'The road ahead winds through the forest. '.repeat(params.has('long') ? 40 : 4) + '</p>'
const messages: SandboxMessage[] = [
  {id:'greeting', role:'ai', content:panel+dockMarkup, serverId:null},
  {id:'ai', role:'ai', content:longText, serverId:null},
  {id:'user', role:'user', content:longText, serverId:null},
]
messages.forEach((m, i) => {m.view={mesid:i,role:m.role,name:m.role==='user'?'Player':'Example',html:m.content,finished:true,latestAI:params.has('actions')&&i===1}})
const style = document.createElement('style')
style.textContent = `
  .content { width:100%; }
  .opening-panel { box-sizing:border-box; width:100%; padding:8px; border:1px solid #8cb1c9; }
  ${params.get('pad') === '0' ? '.mes_text { padding:0; }' : ''}
  ${params.has('wide') ? '.opening-panel { min-width:100vw; }' : ''}
  .legacy-dock { position:fixed; top:160px; width:16px; height:100px; background:#8cb1c9; color:#111; writing-mode:vertical-rl; }
  ${params.get('dock-z') === '10' ? '.legacy-dock { z-index:10; }' : ''}
  .legacy-dock.left { left:0; } .legacy-dock.right { right:0; }

`
document.head.append(style)
if (params.get('mode') === 'traditional') {
  // The community host supplies this reset outside lt-base. MMD author
  // descendants are subsequently restored by canvas.css, as in real /play.
  const hostReset = document.createElement('style')
  hostReset.textContent = '*,*::before,*::after{box-sizing:border-box}'
  document.head.prepend(hostReset)
  createApp({ render: () => h('div', { class:'canvas-root chat lt-format-mmd' }, [
    h(CanvasHeader, header),
    h(CanvasStage, {}, () => messages.map(m => h(CanvasMessage, { message:m.view, menuLabel:'Menu' }))),
  ]) }).mount('#app')
  const chat = document.querySelector('#chat') as HTMLElement
  const scroll = document.querySelector('#scrollview') as HTMLElement
  mountFrontendBlocks(chat)
  bindBubbleFit({doc:document,win:window,chat,observe:chat})
  bindAuthorSideDock({doc:document,win:window,lane:chat,scroll,candidates:()=>collectFixedRoots([chat],window),observe:[chat],target:document.documentElement})
} else {
  const shell = createShell({
    doc:document, win:window, mount:document.querySelector('#app')!,
    config: {
      theme:'dark', locale:'en', role:{ name:'Example', avatarUrl:'' }, user:{ nickname:'Player', avatarUrl:'' },
      card:{ rules:[], statusbar:params.has('bom') ? 'mount' : '', statusbarHtml:params.has('bom') ? '\n\ufeff<div style="position:fixed;left:0;top:160px"></div>' : undefined }, capabilities:{ saves:false, edit:false, send:false }, composer:false,
      chromeState: {
        header,
        composer: { placeholder:'Message', sendState:'send', generating:false, enterSends:true, shortcuts:[], moreOpen:false, moreItems:[], modelScore:'', assistBusy:false, assistCost:'', labels:{ stop:'Stop', more:'More', send:'Send', paste:'Paste', clear:'Clear', model:'Model', assist:'Assist', perTurn:'Per turn' } },
      },
    },
    transport:{ send:() => {} },
  })
  shell.handle({ type:'messages', messages })
  if(params.has('broken')&&shell.refs.statusbar) shell.refs.statusbar.prepend(document.createTextNode('\ufeff'))
}

// Geometry is read separately from interaction. No backend, auth, spending or
// player data is involved. Scroll manually, then call this at each checkpoint.
Object.assign(window, { legacyStageSnapshot: () => {
  const rect = (selector:string) => document.querySelector(selector)!.getBoundingClientRect()
  const stage = rect('#bg1'), header = rect('#top-bar'), bubble = rect('.mes_text')
  const scroll = document.querySelector('#scrollview') as HTMLElement
  return {
    mode:params.get('mode') || 'sandbox', statusbar:document.querySelector('[data-slot="statusbar"]')?.getBoundingClientRect().height || 0,
    bubbles:Array.from(document.querySelectorAll('.mes_text[data-lt-role]')).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {role:e.getAttribute('data-lt-role'),left:r.left,right:innerWidth-r.right,width:r.width,box:s.boxSizing,padding:s.padding,background:s.backgroundColor,fit:e.hasAttribute('data-lt-fit')}}),
    chatPadding:getComputedStyle(document.querySelector('#chat')!).padding,
    panel:document.querySelector('.opening-panel')?.getBoundingClientRect().toJSON(),
    width:innerWidth, headerBottom:header.bottom, stageTop:stage.top, gap:stage.top-header.bottom,
    bubbleLeft:bubble.left, bubbleRight:innerWidth-bubble.right,
    overflow:scroll.scrollWidth-scroll.clientWidth, scrollTop:scroll.scrollTop,
    dockLeft:document.documentElement.style.getPropertyValue('--lt-canvas-dock-left'),
    dockRight:document.documentElement.style.getPropertyValue('--lt-canvas-dock-right'),
  }
} })
