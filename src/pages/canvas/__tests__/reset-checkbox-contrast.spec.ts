// @vitest-environment node
import { expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

it('keeps reset checkbox boundaries, selected marks and keyboard focus distinguishable in light and dark', () => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome, 'Native Chrome is required for computed color-mix contrast').toBeTruthy()
  const css = ['src/common/canvas-theme-vars.css', 'src/pages/canvas/canvas.css'].map(file => readFileSync(file, 'utf8')).join('\n')
  const modes = [{ name: 'light', bg: '#ffffff', fg: '#17171c', accent: '#ef4f6f' }, { name: 'dark', bg: '#191c20', fg: '#e8eaed', accent: '#ffd452' }]
  const markup = modes.map(mode => `<section class="canvas-root chat" data-mode="${mode.name}" style="color:${mode.fg};--lt-canvas-fg:${mode.fg};--lt-canvas-sheet-pop-bg:${mode.bg};--lt-canvas-accent:${mode.accent};--lt-canvas-accent-bg:color-mix(in srgb,${mode.accent} 14%,${mode.bg})"><div class="u-popup__content" style="background:${mode.bg}"><div class="confirm-scope"><div class="confirm-option" role="checkbox" tabindex="0"><span class="confirm-check-box"></span>Notebook</div><div class="confirm-option" role="checkbox" tabindex="0"><span class="confirm-check-box is-on">✓</span>Instructions</div></div></div></section>`).join('')
  const dir = mkdtempSync(join(tmpdir(), 'reset-checkbox-contrast-'))
  try {
    const file = join(dir, 'fixture.html')
    writeFileSync(file, `<style>${css}</style>${markup}<pre id="result"></pre><script>
      const ctx=document.createElement('canvas').getContext('2d');
      function rgba(value){ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]}
      function blend(front,back){return front.slice(0,3).map((v,i)=>v*front[3]/255+back[i]*(1-front[3]/255))}
      function luminance(rgb){return rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)}
      function contrast(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
      const rows=[...document.querySelectorAll('section')].map(section=>{
        const bg=rgba(getComputedStyle(section.querySelector('.u-popup__content')).backgroundColor);
        const unchecked=section.querySelector('.confirm-check-box'),checked=section.querySelector('.is-on');
        const un=getComputedStyle(unchecked),on=getComputedStyle(checked);
        const fill=blend(rgba(on.backgroundColor),bg);
        const option=section.querySelector('.confirm-option');option.focus();const focus=getComputedStyle(option);
        return {mode:section.dataset.mode,unchecked:contrast(blend(rgba(un.borderTopColor),bg),bg),checked:contrast(blend(rgba(on.borderTopColor),bg),bg),mark:contrast(blend(rgba(on.color),fill),fill),focus:contrast(blend(rgba(focus.outlineColor),bg),bg),focusStyle:focus.outlineStyle,focusWidth:parseFloat(focus.outlineWidth)};
      });document.querySelector('#result').textContent=JSON.stringify(rows);
    </script>`)
    const run = spawnSync(chrome!, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=1000', `file://${file}`], { encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024 })
    expect(run.error, run.stderr).toBeUndefined()
    expect(run.status, run.stderr).toBe(0)
    const json = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
    expect(json, run.stdout).toBeTruthy()
    const rows = JSON.parse(json!)
    expect(rows).toHaveLength(2)
    console.info("Reset checkbox contrast", JSON.stringify(rows))
    for (const row of rows) {
      for (const state of ['unchecked', 'checked', 'mark', 'focus']) expect.soft(row[state], `${row.mode} ${state}: ${JSON.stringify(row)}`).toBeGreaterThanOrEqual(3)
      expect(row.focusStyle).toBe('solid')
      expect(row.focusWidth).toBeGreaterThanOrEqual(2)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}, 30000)
