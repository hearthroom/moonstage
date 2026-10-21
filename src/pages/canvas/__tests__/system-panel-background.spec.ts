// @vitest-environment node
import { expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildSync } from 'esbuild'

it('keeps all system panels opaque when inherited author background tokens contain alpha or gradients', () => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync)
  expect(chrome, 'Chrome is required for computed custom-property background validation').toBeTruthy()
  const sources = [
    ['sys-msg-card', 'src/components/chat-system-message/chat-system-message.vue'],
    ['sys-link', 'src/components/chat-system-message/chat-system-message.vue'],
    ['agent-resume-card', 'src/pages/canvas/canvas.css'],
    ['chat-balance-hint', 'src/pages/canvas/components/canvas-composer.vue'],
  ]
  const rules = sources.map(([name, file]) => {
    const declarations = readFileSync(file, 'utf8').match(new RegExp(`\\.${name}\\s*\\{([^}]+)\\}`))?.[1]
    expect(declarations, name).toBeTruthy()
    return `.${name}{${declarations}}`
  }).join('\n')
  const vars = readFileSync('src/common/canvas-theme-vars.css', 'utf8')
  const dir = mkdtempSync(join(tmpdir(), 'stage-system-background-'))
  try {
    const html = `<style>${vars}\n${rules}</style>${['rgba(255,255,255,.05)', 'linear-gradient(white,black)'].map(value => `<section class="canvas-root lt-theme-dark" style="--background-color:${value};--card-background-color:${value}">${sources.map(([name]) => `<div class="${name}">Fixture</div>`).join('')}</section>`).join('')}<pre id="result"></pre><script>document.querySelector('#result').textContent=JSON.stringify(Array.from(document.querySelectorAll('section > div')).map(el=>({name:el.className,color:getComputedStyle(el).backgroundColor,image:getComputedStyle(el).backgroundImage})))</script>`
    const file = join(dir, 'fixture.html'); writeFileSync(file, html)
    const run = spawnSync(chrome!, ['--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=1000', `file://${file}`], { encoding:'utf8', timeout:20000, maxBuffer:2*1024*1024 })
    expect(run.error, run.stderr).toBeUndefined()
    expect(run.status, run.stderr).toBe(0)
    const json = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
    expect(json, run.stdout + run.stderr).toBeTruthy()
    const rows = JSON.parse(json!)
    expect(rows).toHaveLength(8)
    for (const row of rows) expect(row.color, `${row.name}: ${row.image}`).toBe('rgb(15, 18, 23)')
  } finally { rmSync(dir, {recursive:true, force:true}) }
}, 30000)

it('keeps a balance hint readable with dark author text and pale glass over its fixed backing', () => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync)
  expect(chrome, 'Chrome is required for the balance hint contrast regression').toBeTruthy()
  const component = readFileSync('src/pages/canvas/components/canvas-composer.vue', 'utf8')
  const styles = [...component.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n')
  const vars = readFileSync('src/common/canvas-theme-vars.css', 'utf8')
  const tone = buildSync({entryPoints:['src/pages/canvas/canvas-chrome-tone.ts'],bundle:true,write:false,format:'iife',globalName:'chromeTone',platform:'browser',target:'es2022'}).outputFiles[0].text
  const dir = mkdtempSync(join(tmpdir(), 'stage-balance-contrast-'))
  try {
    const file = join(dir, 'fixture.html')
    writeFileSync(file, `<style>${vars}\n${styles}</style>${['rgba(255,255,255,.05)', 'rgb(128,128,128)', 'white'].map(bg=>`<section class="canvas-root lt-theme-dark" style="--primary-font-color:#17171c;--card-background-color:${bg}"><div class="chat-balance-hint">Synthetic balance hint</div></section>`).join('')}<pre id="result"></pre><script>${tone};chromeTone.syncChromeTone(document);document.querySelector('#result').textContent=JSON.stringify(Array.from(document.querySelectorAll('.chat-balance-hint')).map(el=>{const fg=chromeTone.parseComputedColor(getComputedStyle(el).color),bg=chromeTone.effectiveBackground(el),a=chromeTone.relativeLuminance(fg),b=chromeTone.relativeLuminance(bg);return {tone:el.dataset.ltTone,color:getComputedStyle(el).color,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}}))</script>`)
    const run = spawnSync(chrome!, ['--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=1000', `file://${file}`], {encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024})
    expect(run.error, run.stderr).toBeUndefined()
    expect(run.status, run.stderr).toBe(0)
    const json = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
    expect(json, run.stdout + run.stderr).toBeTruthy()
    const rows = JSON.parse(json!)
    expect(rows).toHaveLength(3)
    for (const row of rows) expect(row.ratio, JSON.stringify(row)).toBeGreaterThanOrEqual(4.5)
  } finally { rmSync(dir,{recursive:true,force:true}) }
}, 30000)
