import { expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

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
    const run = spawnSync(chrome!, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=1000', `file://${file}`], { encoding:'utf8', timeout:20000, maxBuffer:2*1024*1024 })
    expect(run.error, run.stderr).toBeUndefined()
    expect(run.status, run.stderr).toBe(0)
    const rows = JSON.parse(run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)![1])
    expect(rows).toHaveLength(8)
    for (const row of rows) expect(row.color, `${row.name}: ${row.image}`).toBe('rgb(15, 18, 23)')
  } finally { rmSync(dir, {recursive:true, force:true}) }
}, 30000)
