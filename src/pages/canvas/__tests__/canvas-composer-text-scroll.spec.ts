// @vitest-environment node
import { expect, it } from 'vitest'
import { buildSync } from 'esbuild'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

it('paints different lines after scrolling solid background-clipped composer text', () => {
  const chrome = process.env.CHROME_BIN || [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].find(existsSync)
  expect(chrome, 'Install Chrome or set CHROME_BIN for the text-paint regression').toBeTruthy()
  const code = buildSync({
    stdin: { contents: `
      import { fixSolidClippedText } from './src/pages/canvas/canvas-composer-text-paint'
      const el=document.querySelector('textarea'), params=new URLSearchParams(location.search)
      el.value=Array.from({length:24},(_,i)=>'Synthetic line '+(i+1)).join('\\n')
      if(params.has('fix'))fixSolidClippedText(el)
      el.scrollTop=params.has('scroll')?150:0
      document.querySelector('pre').textContent=JSON.stringify({scroll:el.scrollTop,color:getComputedStyle(el).color})
    `, resolveDir: process.cwd(), loader: 'ts' },
    bundle:true, write:false, format:'iife', platform:'browser', target:'es2022',
  }).outputFiles[0].text
  const dir = mkdtempSync(join(tmpdir(), 'stage-composer-text-scroll-'))
  try {
    const file = join(dir, 'fixture.html')
    writeFileSync(file, `<!doctype html><style>
      textarea{width:220px;height:120px;resize:none;font:16px/20px monospace;caret-color:transparent;
      background:rgb(220,160,60)!important;background-clip:text!important;-webkit-background-clip:text!important;
      color:transparent!important;-webkit-text-fill-color:transparent!important}
      pre{display:none}
      </style><textarea></textarea><pre id="result"></pre><script>${code}</script>`)
    const shot = (query:string, name:string) => {
      const png=join(dir,name+'.png')
      const run=spawnSync(chrome!, ['--headless=new','--no-first-run','--no-default-browser-check',
        '--hide-scrollbars',`--user-data-dir=${join(dir,name)}`,`--screenshot=${png}`,
        '--dump-dom','--virtual-time-budget=1000',`file://${file}?${query}`],
      {encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024})
      expect(run.error,run.stderr).toBeUndefined()
      expect(run.status,run.stderr).toBe(0)
      const result=JSON.parse(run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)![1])
      return { pixels:readFileSync(png), ...result }
    }
    // Positive control: Chromium moves the scroll position but leaves the clipped mask fixed.
    const brokenTop=shot('', 'broken-top'), brokenScrolled=shot('scroll=1','broken-scrolled')
    expect(brokenScrolled.scroll).toBe(150)
    expect(brokenScrolled.pixels.equals(brokenTop.pixels)).toBe(true)
    const top=shot('fix=1','top'), scrolled=shot('fix=1&scroll=1','scrolled')
    expect(scrolled.scroll).toBe(150)
    expect(scrolled.color).toBe('rgb(220, 160, 60)')
    expect(scrolled.pixels.equals(top.pixels)).toBe(false)
  } finally { rmSync(dir,{recursive:true,force:true}) }
}, 90000)
