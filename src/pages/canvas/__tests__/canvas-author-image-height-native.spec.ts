// @vitest-environment node
import { expect, it } from 'vitest'
import { build } from 'esbuild'
import { compileScript, parse } from '@vue/compiler-sfc'
import postcss from 'postcss'
import stageConfig from '../../../../vite.stage.config'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

it.each(['classic-package', 'sandbox'])('%s respects author image height and keeps ordinary wide images within bubbles', async surface => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome, 'Install Chrome or set CHROME_BIN').toBeTruthy()
  const styles = ['src/common/canvas-theme-vars.css', 'src/pages/canvas/canvas.css'].map(file => readFileSync(file, 'utf8'))
  if (surface === 'sandbox') styles.push(readFileSync('src/sandbox/shell.css', 'utf8'))
  const bundle = await build({ stdin: { contents: `
    import {createApp,h,nextTick} from 'vue'
    import Message from './src/pages/canvas/components/canvas-message.vue'
    import {buildShell} from './src/sandbox/render/shell-dom'
    const surface=${JSON.stringify(surface)},cases=[]
    const svg=(w,h)=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="50%" fill="#ca453f"/><rect y="50%" width="100%" height="50%" fill="#397ca8"/></svg>')
    const portrait='<div class="portrait-panel"><div class="portrait-frame" onclick="this.firstElementChild.classList.toggle(&quot;lower&quot;)"><img src="'+svg(400,2400)+'"></div><div class="portrait-info">Synthetic author status panel</div></div>'
    for(const width of [390,1440])for(const mode of ['dark','light']){
      const section=document.createElement('section');section.className='fixture';section.style.width=width+'px';section.dataset.mode=mode;document.body.append(section)
      let mount=section
      if(surface==='sandbox'){const refs=buildShell(document,section,{theme:mode,roleName:'Synthetic',roleAvatar:'',hasStatusbar:false,composerVisible:false,strings:{back:'Back',send:'Send',more:'More',placeholder:'Message'}});refs.root.classList.add('canvas-root','chat','lt-format-mmd');mount=refs.list}
      else {section.classList.add('ms-stage');mount=document.createElement('div');mount.className='canvas-root';mount.style.cssText='position:relative;height:auto';section.append(mount)}
      createApp({render:()=>h(Message,{message:{mesid:cases.length,role:'ai',name:'Synthetic',avatar:'',html:portrait+'<p><img class="wide-image" src="'+svg(2400,1200)+'"></p>',finished:true},chat:surface==='sandbox'?{from:'ai',state:'done',generating:false}:undefined,labels:{}})}).mount(mount)
      cases.push({width,mode,section})
    }
    window.addEventListener('load',async()=>{await nextTick();await Promise.all([...document.images].map(i=>i.decode()));
      const data=cases.map(({width,mode,section})=>{const frame=section.querySelector('.portrait-frame'),img=frame.querySelector('img'),wide=section.querySelector('.wide-image'),bubble=section.querySelector('.mes_text');
        const box=n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right}};
        const before=getComputedStyle(img).objectPosition;frame.click();const after=getComputedStyle(img).objectPosition;frame.click();
        return {width,mode,frame:box(frame),img:box(img),wide:box(wide),bubble:box(bubble),before,after,restored:getComputedStyle(img).objectPosition,coverHeight:img.naturalHeight*img.clientWidth/img.naturalWidth}
      });document.querySelector('#result').textContent=JSON.stringify(data)
    })
  `, loader: 'ts', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
    alias: { '@': resolve('src') }, resolveExtensions: ['.ts', '.js', '.vue'],
    plugins: [{ name: 'real-message', setup(builder) { builder.onLoad({ filter: /\.vue$/ }, args => {
      const { descriptor } = parse(readFileSync(args.path, 'utf8'))
      styles.push(...descriptor.styles.map(style => style.content))
      return { contents: compileScript(descriptor, { id: 'author-image', inlineTemplate: true }).content, loader: 'ts', resolveDir: dirname(args.path) }
    }) } }], define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } })
  // Use the real package CSS transform: its .ms-stage prefix changes specificity.
  const config = await (stageConfig as any)({ command: 'build', mode: 'production' })
  const rawCss = styles.join('\n')
  const css = surface === 'classic-package'
    ? (await postcss(config.css.postcss.plugins).process(rawCss, { from: undefined })).css
    : rawCss.replace(/(-?\d*\.?\d+)rpx/g, 'calc($1 * var(--ms-rpx))')
  const dir = mkdtempSync(join(tmpdir(), 'stage-author-image-'))
  try {
    const file = join(dir, 'images.html')
    // Classic covers author CSS before the package; the sandbox matches runtime
    // insertion after platform CSS. The host reset never crosses into its iframe.
    const authorCss = `
      .portrait-panel{display:flex;width:100%}.portrait-frame{position:relative;width:40%;flex-shrink:0;overflow:hidden}
      .portrait-panel .portrait-frame img{position:absolute;width:100%;height:100%;object-fit:cover;object-position:50% 0%}
      .portrait-panel .portrait-frame img.lower{object-position:50% 100%}
      .portrait-info{height:620px;flex:1}@media(min-width:768px){.portrait-info{height:360px}}
    `
    writeFileSync(file, `<meta charset="utf-8"><style>
      ${surface === 'classic-package' ? 'body:has(.fixture) img{max-width:none}' : ''} :root{--ms-rpx:.5px} body{margin:0}
      ${surface === 'classic-package' ? authorCss : ''}
      .fixture [data-chat="root"]{position:relative;height:auto;display:block}.fixture [data-chat="messages"]{position:relative}
      ${css}${surface === 'sandbox' ? authorCss : ''}</style><pre id="result"></pre><script>${bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`)
    const run = spawnSync(chrome!, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=2000', pathToFileURL(file).href], { encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024 })
    expect(run.error, run.stderr).toBeUndefined(); expect(run.status, run.stderr).toBe(0)
    const json = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
    expect(json, run.stdout.slice(-2000)).toBeTruthy()
    const cases = JSON.parse(json!)
    expect(cases).toHaveLength(4)
    for (const c of cases) {
      const note = JSON.stringify(c)
      expect(c.frame.height, note).toBeGreaterThan(300)
      expect(c.img.height, note).toBeCloseTo(c.frame.height, 0)
      expect(c.coverHeight, note).toBeGreaterThan(c.frame.height + 10)
      expect(c.before, note).toBe('50% 0%'); expect(c.after, note).toBe('50% 100%'); expect(c.restored, note).toBe(c.before)
      expect(c.wide.width, note).toBeGreaterThan(0)
      expect(c.wide.right, note).toBeLessThanOrEqual(c.bubble.right + 1)
      expect(c.wide.left, note).toBeGreaterThanOrEqual(c.bubble.left - 1)
      expect(c.wide.height / c.wide.width, note).toBeCloseTo(.5, 2)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}, 30000)
