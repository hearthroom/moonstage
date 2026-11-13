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
      const before={preview:!!document.querySelector('.chat-input-collapsed-display').offsetParent,box:box.getBoundingClientRect().toJSON(),textareaBox:textarea.getBoundingClientRect().toJSON(),opacity:getComputedStyle(box).opacity,pointerEvents:getComputedStyle(box).pointerEvents,tabindex:textarea.tabIndex}
      // Positive control: the former display:none state loses the target and writes the author field.
      const old=box.style.display;box.style.display='none';fill('Control');await nextTick()
      const control={draft:value.value,author:author.value};author.value='';box.style.display=old
      // Legacy panels look for an input with a layout box and assign its value directly.
      const injectBySize=s=>{
        const ts=document.querySelectorAll('textarea,[contenteditable],input')
        for(let i=0;i<ts.length;i++){
          const t=ts[i]
          if(t.closest&&t.closest('#gcw'))continue
          const r=t.getBoundingClientRect()
          if(r.width>40&&r.height>8){
            if(typeof t.value==='string'){t.value=(t.value||'')+s}
            return true
          }
        }
        return false
      }
      const injectOk=injectBySize('Synthetic opening');await nextTick()
      const afterDirectInjection={ok:injectOk,draft:value.value,author:author.value,collapsedText:document.querySelector('.chat-input-collapsed-text')?.textContent||'',expanded:document.querySelector('.chat-input-scope').classList.contains('is-expanded')}
      value.value='';await nextTick()
      document.querySelector('#choice').onclick=()=>fill('Synthetic choice')
      document.querySelector('#choice').click();await nextTick();await new Promise(resolve=>setTimeout(resolve,50));await nextTick()
      const result={before,control,afterDirectInjection,draft:value.value,author:author.value,focused:document.activeElement===textarea,expanded:document.querySelector('.chat-input-scope').classList.contains('is-expanded'),tabindex:textarea.tabIndex}
      parent.postMessage(result,'*')
    })
  `, loader:'ts', resolveDir:process.cwd() }, plugins:[{name:'composer-fixture',setup(builder){builder.onLoad({filter:/\.vue$/},args=>{
    const {descriptor}=parse(readFileSync(args.path,'utf8'));styles.push(...descriptor.styles.map(style=>style.content))
    return {contents:compileScript(descriptor,{id:'fixture',inlineTemplate:true}).content,loader:'ts',resolveDir:dirname(args.path)}
  })}}],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',resolveExtensions:['.ts','.js','.vue'],define:{'process.env.NODE_ENV':'"production"',__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'}})).outputFiles[0].text
  const dir=mkdtempSync(join(tmpdir(),'stage-author-input-'))
  try {
    const css=styles.join('\n').replace(/(-?\d*\.?\d+)rpx/g,'calc($1 * var(--ms-rpx))')
    const fixture=`<!doctype html><script>addEventListener('error',e=>parent.postMessage({error:e.message},'*'));addEventListener('unhandledrejection',e=>parent.postMessage({error:String(e.reason)},'*'))</script><style>:root{--ms-rpx:.5px}body{margin:0}${css}</style><div id="gcw"><input id="author" type="text"></div><button id="choice">Synthetic choice</button><div id="app"></div><script>${code.replace(/<\/script/gi,'<\\/script')}</script>`
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
      expect(result.before.opacity).toBe('0')
      expect(result.before.pointerEvents).toBe('none')
      // Some MMD panels filter inputs by size even while the composer is collapsed.
      expect(result.before.box.width).toBeGreaterThan(40)
      expect(result.before.box.height).toBeGreaterThan(8)
      expect(result.before.textareaBox.width).toBeGreaterThan(40)
      expect(result.before.textareaBox.height).toBeGreaterThan(8)
      expect(result.afterDirectInjection).toEqual({
        ok: true,
        draft: 'Synthetic opening',
        author: '',
        collapsedText: 'Synthetic opening',
        expanded: false,
      })
      expect(result.draft,'legacy choice must reach the platform draft').toBe('Synthetic choice')
      expect(result.author).toBe('')
      expect(result.focused).toBe(true)
      expect(result.expanded).toBe(true)
      expect(result.before.tabindex).toBe(-1)
      expect(result.tabindex).toBe(0)
    }
  }finally{rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
},60000)

it('lets a legacy opening wizard fill the collapsed composer on the Classic page and Sandbox shell', async () => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome, 'Native Chrome is required for getBoundingClientRect and onerror wizard boot').toBeTruthy()
  const styles = ['src/common/canvas-theme-vars.css', 'src/pages/canvas/canvas.css', 'src/pages/canvas/canvas-chrome-box.css', 'src/sandbox/shell.css'].map(file => readFileSync(resolve(file), 'utf8'))
  // Keep boot later than the former 80ms click to cover asynchronous author initialization.
  // The real image error must still run before the widget can install its handler.
  const wizardHtml = `<div id="wizard">
    <textarea aria-label="Character notes"></textarea>
    <button type="button">Apply</button><span role="status"></span>
    <img src="invalid-image" hidden alt="" onerror="
      const panel = this.closest('#wizard');
      setTimeout(() => {
        panel.querySelector('button').onclick = () => {
          for (const input of document.querySelectorAll('textarea,[contenteditable],input')) {
            if (panel.contains(input)) continue;
            const rect = input.getBoundingClientRect();
            if (rect.width <= 40 || rect.height <= 8) continue;
            if (typeof input.value === 'string') input.value = (input.value || '') + 'Synthetic opening';
            panel.querySelector('[role=status]').textContent = 'Draft filled';
            return;
          }
          panel.querySelector('[role=status]').textContent = 'Input missing';
        };
      }, 160);
    ">
  </div>`
  const code = (await build({
    stdin: {
      contents: `
        import {createApp,h,ref,nextTick} from 'vue'
        import Composer from './src/pages/canvas/components/canvas-composer.vue'
        import {createShell} from './src/sandbox/shell.ts'

        const wizardHtml = ${JSON.stringify(wizardHtml)}

        async function applyWizard(surface: string) {
          const btn = document.querySelector('#wizard button') as HTMLButtonElement | null
          if (!btn) throw new Error(surface + ': wizard button missing')
          // Vue flush and elapsed virtual time do not imply that image onerror has booted.
          const deadline = performance.now() + 1000
          while (typeof btn.onclick !== 'function') {
            if (performance.now() >= deadline) throw new Error(surface + ': wizard onclick was not installed')
            await new Promise(r => setTimeout(r, 10))
          }
          btn.click()
          await nextTick()
        }

        async function runClassic() {
          const root = document.getElementById('app')!
          root.innerHTML = '<div class="canvas-root chat"><div class="chat-body"><div class="mes item Ai"><div class="mes_block"><div class="mes_text content left" id="classic-msg"></div></div></div></div><div id="classic-composer"></div></div>'
          const value = ref('')
          const app = createApp({
            render: () => h(Composer, {
              value: value.value,
              'onUpdate:value': (v: string) => { value.value = v },
              placeholder: '說點什麼',
              sendState: value.value ? 'send' : 'send-disabled',
              generating: false,
            })
          })
          app.mount('#classic-composer')
          document.getElementById('classic-msg')!.innerHTML = wizardHtml
          await nextTick()
          await applyWizard('Classic')
          const out = {
            msg: document.querySelector('#wizard [role="status"]')?.textContent || '',
            draft: value.value,
            collapsedText: document.querySelector('.chat-input-collapsed-text')?.textContent || '',
            sendEnabled: !!document.querySelector('.lt-send.is-send'),
          }
          app.unmount()
          root.innerHTML = ''
          return out
        }

        async function runSandbox() {
          const root = document.getElementById('app')!
          root.innerHTML = '<div id="sandbox-mount" style="width:100vw;height:100vh"></div>'
          const sent: any[] = []
          const shell = createShell({
            doc: document,
            win: window as any,
            mount: document.getElementById('sandbox-mount')!,
            config: {
              theme: 'dark',
              locale: 'zh-Hant',
              role: { name: 'Synthetic role', avatarUrl: '' },
              user: { nickname: 'Synthetic user', avatarUrl: '' },
              card: {
                rules: [{ id: 'r2', name: 'Opening wizard', find: '<OPENING_WIZARD>', replace: wizardHtml, enabled: true }],
                statusbar: '',
              },
              capabilities: { saves: false, edit: false, send: true },
              composer: true,
              chromeState: {
                header: { roleName: 'Synthetic role', avatar: '', badge: '', backLabel: 'Back' },
                composer: {
                  placeholder: '說點什麼',
                  sendState: 'send-disabled',
                  generating: false,
                  enterSends: true,
                  shortcuts: [],
                  moreOpen: false,
                  moreItems: [],
                  modelScore: '10',
                  assistBusy: false,
                  assistCost: '',
                  labels: { stop: 'Stop', more: 'More', send: 'Send', paste: 'Paste', clear: 'Clear', model: 'Model', assist: 'Assist', perTurn: 'Per turn' },
                },
              },
            },
            transport: { send: (m) => sent.push(m) },
          })
          shell.handle({
            type: 'messages',
            messages: [{
              id: 'm1',
              role: 'ai',
              content: '<OPENING_WIZARD>',
              serverId: '1',
              state: 'done',
              view: { name: 'Synthetic role', html: wizardHtml, finished: true },
            }],
          })
          await nextTick()
          await applyWizard('Sandbox')
          const out = {
            msg: document.querySelector('#wizard [role="status"]')?.textContent || '',
            sdkInput: shell.sdk.input.get(),
            collapsedText: document.querySelector('.chat-input-collapsed-text')?.textContent || '',
            sentInputs: sent.filter(m => m.type === 'input').map(m => m.value),
          }
          shell.dispose()
          return out
        }

        window.addEventListener('load', async () => {
          const classic = await runClassic()
          const sandbox = await runSandbox()
          parent.postMessage({ classic, sandbox }, '*')
        })
      `,
      loader: 'ts',
      resolveDir: process.cwd(),
    },
    alias: { '@': resolve('src') },
    plugins: [{
      name: 'composer-fixture-2',
      setup(builder) {
        builder.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }))
        builder.onLoad({ filter: /\.vue$/ }, args => {
          const { descriptor } = parse(readFileSync(args.path, 'utf8'))
          styles.push(...descriptor.styles.map(style => style.content))
          return { contents: compileScript(descriptor, { id: 'fixture2', inlineTemplate: true }).content, loader: 'ts', resolveDir: dirname(args.path) }
        })
      },
    }],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    resolveExtensions: ['.ts', '.js', '.vue'],
    define: {
      'process.env.NODE_ENV': '"production"',
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
  })).outputFiles[0].text
  const dir = mkdtempSync(join(tmpdir(), 'stage-opening-wizard-'))
  try {
    const css = styles.join('\n').replace(/(-?\d*\.?\d+)rpx/g, 'calc($1 * var(--ms-rpx))')
    const file = join(dir, 'fixture.html')
    const receiver = '<pre id="result"></pre><script>let failed=false;addEventListener("message",e=>{if(failed)return;failed=!!e.data.error;document.querySelector("#result").textContent=JSON.stringify(e.data)})</script>'
    const fixture = `<!doctype html><script>addEventListener('error',e=>parent.postMessage({error:e.message},'*'));addEventListener('unhandledrejection',e=>parent.postMessage({error:String(e.reason)},'*'))</script><style>:root{--ms-rpx:.5px}body{margin:0}${css}</style><div id="app"></div><script>${code.replace(/<\/script/gi, '<\\/script')}</script>`
    writeFileSync(file, fixture + receiver)
    const run = spawnSync(chrome!, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=2000', `file://${file}`], { encoding: 'utf8', timeout: 25000, maxBuffer: 4 * 1024 * 1024 })
    expect(run.error, run.stderr).toBeUndefined()
    expect(run.status, run.stderr).toBe(0)
    const json = run.stdout.match(/<pre id="result"[^>]*>([^<]+)<\/pre>/)?.[1]
    expect(json, run.stdout.slice(-1500)).toBeTruthy()
    const result = JSON.parse(json!)
    expect(result.error).toBeUndefined()
    expect(result.classic.msg, JSON.stringify(result.classic)).toBe('Draft filled')
    expect(result.classic.draft).toContain('Synthetic opening')
    expect(result.classic.collapsedText).toContain('Synthetic opening')
    expect(result.classic.sendEnabled).toBe(true)
    expect(result.sandbox.msg).toBe('Draft filled')
    expect(result.sandbox.sdkInput).toContain('Synthetic opening')
    expect(result.sandbox.collapsedText).toContain('Synthetic opening')
    expect(result.sandbox.sentInputs.at(-1)).toContain('Synthetic opening')
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}, 60000)
