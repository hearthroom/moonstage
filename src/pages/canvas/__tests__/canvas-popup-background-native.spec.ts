// @vitest-environment node
import { expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildSync } from 'esbuild'

it('keeps author background sizing, positioning and repetition on the opaque popup surface', () => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome).toBeTruthy()
  const component = readFileSync('src/pages/canvas/components/canvas-popup.vue', 'utf8')
  const style = component.match(/class="lt-dialog-backplate"[^>]*style="([^"]+)"/)?.[1]
  expect(style).toBeTruthy()
  const tone = buildSync({ entryPoints: ['src/pages/canvas/canvas-chrome-tone.ts'], bundle: true, write: false, format: 'iife', globalName: 'chromeTone', platform: 'browser', target: 'es2022' }).outputFiles[0].text
  const dir = mkdtempSync(join(tmpdir(), 'stage-popup-background-'))
  try {
    const file = join(dir, 'fixture.html')
    writeFileSync(file, `<style>.u-popup__content{position:relative;isolation:isolate;width:240px;height:180px;background:linear-gradient(red,blue) right bottom / 20px 20px no-repeat rgba(20,30,40,.2);--lt-canvas-sheet-bg:#faf7f2}</style><div class="u-popup__content"><div class="lt-dialog-backplate" style="${style}"></div></div><pre id="result"></pre><script>${tone};chromeTone.syncChromeTone(document);const p=document.querySelector('.u-popup__content'),s=p.firstElementChild;document.querySelector('#result').textContent=JSON.stringify([p,s].map(e=>{const c=getComputedStyle(e);return {image:c.backgroundImage,size:c.backgroundSize,position:c.backgroundPosition,repeat:c.backgroundRepeat,color:c.backgroundColor}}))</script>`)
    const run = spawnSync(chrome!, ['--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=1000', `file://${file}`], { encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024 })
    expect(run.error, run.stderr).toBeUndefined(); expect(run.status, run.stderr).toBe(0)
    const json = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
    expect(json, run.stdout + run.stderr).toBeTruthy()
    const [parent, surface] = JSON.parse(json!)
    for (const key of ['image', 'size', 'position', 'repeat']) expect(surface[key], key).toBe(parent[key])
    expect(surface.color).toMatch(/^rgb\(/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}, 30000)
