import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildShell } from '../render/shell-dom'
import { shellStrings } from '../strings'

// jsdom has no layout. Measure the actual shell DOM/CSS in the installed browser;
// CI's ubuntu image includes Chrome. CHROME_BIN supports other installations.
const chrome = process.env.CHROME_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(existsSync)
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

const css = readFileSync(join(process.cwd(), 'src/sandbox/shell.css'), 'utf8')
function geometry(width: number, height: number) {
  expect(chrome, 'Install Chrome or set CHROME_BIN to run the real layout regression').toBeTruthy()
  document.body.innerHTML = '<div id="app"></div>'
  const refs = buildShell(document, document.querySelector('#app')!, {
    theme: 'dark', strings: shellStrings('en'), roleName: 'Layout regression', roleAvatar: '',
    hasStatusbar: true, composerVisible: true,
  })
  refs.root.setAttribute('data-chrome', 'shell')
  refs.statusbar!.innerHTML = '<div style="height:4000px">Mount form copy</div><button id="dock" style="position:fixed;z-index:1;right:0;top:100px;width:60px;height:44px">Dock</button>'
  refs.list.innerHTML = '<article style="height:4000px">Opening form in the message</article>'
  const markup = `<!doctype html><style>${css}\n[data-chat="messages"]{overflow:auto}</style>${document.body.innerHTML}`
  const dir = mkdtempSync(join(tmpdir(), 'moonstage-statusbar-layout-')); dirs.push(dir)
  const file = join(dir, 'layout.html')
  writeFileSync(file, `<!doctype html><iframe style="border:0;width:${width}px;height:${height}px" srcdoc="${markup.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" onload="
    const d=this.contentDocument, q=s=>d.querySelector(s), box=s=>q(s).getBoundingClientRect().toJSON();
    const m=q('[data-chat=messages]'), dock=q('#dock'), r=dock.getBoundingClientRect();
    m.scrollTop=1000;
    const result={width:this.contentWindow.innerWidth,messages:box('[data-chat=messages]'),composer:box('[data-chat=composer]'),statusbar:box('[data-slot=statusbar]'),scrollTop:m.scrollTop,dockHit:d.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===dock};
    document.querySelector('pre').textContent=JSON.stringify(result);
  "></iframe><pre id="result"></pre>`)
  const run = spawnSync(chrome!, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=1000', `file://${file}`], { encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024 })
  expect(run.error, run.stderr).toBeUndefined()
  expect(run.status, run.stderr).toBe(0)
  const json = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
  expect(json, run.stdout).toBeTruthy()
  return JSON.parse(json!)
}

describe('mount content leaves the message viewport available', () => {
  it.each([[390, 844], [1440, 900]])('keeps messages scrollable and fixed author controls clickable at %i × %i', (width, height) => {
    const result = geometry(width, height)
    expect(result.width).toBe(width)
    expect(result.messages.height).toBeGreaterThan(height / 2)
    expect(result.composer.bottom).toBeLessThanOrEqual(height)
    expect(result.scrollTop).toBeGreaterThan(0)
    expect(result.dockHit).toBe(true)
  }, 30000)
})
