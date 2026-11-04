// @vitest-environment node
import { expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import postcss from 'postcss'

it('keeps native MMD choice buttons inside their track while retaining author box-model overrides', () => {
  const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  expect(chrome, 'Install Chrome or set CHROME_BIN').toBeTruthy()
  const policy: string[] = []
  postcss.parse(readFileSync(resolve('src/pages/canvas/canvas.css'), 'utf8')).walkRules(rule => {
    if ((rule.selector.includes('data-stage-author-format="mmd"') || rule.selector.includes('.canvas-root.lt-format-mmd .lt-bubble-body')) && rule.nodes.some(n => n.type === 'decl' && n.prop === 'box-sizing')) policy.push(rule.toString())
  })
  expect(policy.length).toBeGreaterThan(0)
  const dir = mkdtempSync(join(tmpdir(), 'stage-mmd-native-button-'))
  try {
    const file = join(dir, 'choices.html')
    writeFileSync(file, `<meta charset="utf-8"><style>
      :where(.host-reset) *{box-sizing:border-box}
      ${policy.join('\n')}
      .options{width:302px;display:grid;grid-template-columns:minmax(0,1fr)}
      button{width:100%;padding:13px 42px;border:1px solid;display:grid;grid-template-columns:minmax(0,1fr)}
      .plain{width:12px;padding:0 6px}
      .author-content button{box-sizing:content-box}
      .author-border *{box-sizing:border-box}
    </style>
    <div class="host-reset"><div data-stage-author-layer data-stage-author-format="mmd" data-case="mount">
      <div class="options"><button>Choose a path with a long synthetic description that wraps.</button></div><div class="plain"></div>
      <div class="author-content"><button>Author content box</button></div><div class="author-border"><button>Author border box</button></div>
    </div></div>
    <div class="canvas-root lt-format-mmd"><div class="lt-bubble-body" data-case="message">
      <div class="options"><button>Choose a path with a long synthetic description that wraps.</button></div><div class="plain"></div>
      <div class="author-content"><button>Author content box</button></div><div class="author-border"><button>Author border box</button></div>
    </div></div><pre id="result"></pre><script>
      document.querySelector('#result').textContent=JSON.stringify([...document.querySelectorAll('[data-case]')].map(root=>{
        const track=root.querySelector('.options'),button=track.querySelector('button');const r=button.getBoundingClientRect(),t=track.getBoundingClientRect();const range=document.createRange();range.selectNodeContents(button);
        return {kind:root.dataset.case,box:getComputedStyle(button).boxSizing,right:r.right,trackRight:t.right,textRight:Math.max(...[...range.getClientRects()].map(x=>x.right)),plainWidth:root.querySelector('.plain').getBoundingClientRect().width,authorContent:getComputedStyle(root.querySelector('.author-content button')).boxSizing,authorBorder:getComputedStyle(root.querySelector('.author-border button')).boxSizing};
      }));
    </script>`)
    const run = spawnSync(chrome!, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=1000', pathToFileURL(file).href], { encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024 })
    expect(run.error, run.stderr).toBeUndefined()
    expect(run.status, run.stderr).toBe(0)
    const json = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
    expect(json, run.stdout.slice(-1000)).toBeTruthy()
    const rows = JSON.parse(json!)
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.right, JSON.stringify(row)).toBeLessThanOrEqual(row.trackRight + 1)
      expect(row.textRight, JSON.stringify(row)).toBeLessThanOrEqual(row.trackRight + 1)
      expect(row.box).toBe('border-box')
      expect(row.plainWidth).toBe(24)
      expect(row.authorContent).toBe('content-box')
      expect(row.authorBorder).toBe('border-box')
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}, 30000)
