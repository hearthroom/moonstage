// @vitest-environment node
/**
 * 沙箱殼裡一則接一則的訊息列（owner 2026-11-06）：
 *  1. 思考過程要跟作者漆好的 AI 氣泡同一身（上下兩顆氣泡換了色，只有它還是透明淡框）；
 *  2. 玩家那則的 ⋯ 跟下一則（思考過程）之間要有列距，先前是 0；
 *  3. 「重新生成」跟 ⋯ 同一個樣子、同高、中心對齊（先前 24 對 22，顏色一淡一深）。
 *
 * 殼只載 shell.css＋canvas.css、不載 canvas-theme-vars.css，宿主的變數由 themeVars 寫在根上——
 * 這裡照那個條件在真的 Chrome 裡排版、量 bbox，不靠讀 CSS 字串。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { buildSync } from 'esbuild'

const chrome = process.env.CHROME_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(existsSync)
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

const AUTHOR = '.mes_text{background:rgb(58, 31, 77);color:rgb(243, 232, 255);border:1px solid rgb(192, 132, 252);border-radius:18px}'

// 宿主送進殼的變數（themeVars）。刻意不給 --lt-canvas-row-gap 與 --lt-canvas-actions-size：殼要自己有退路。
const HOST_VARS = '--lt-canvas-bg:rgb(16, 16, 19);--lt-canvas-fg:rgb(242, 242, 245);--lt-canvas-bubble-ai-bg:rgb(26, 26, 31);--lt-canvas-bubble-fg:rgb(242, 242, 245);--lt-canvas-bubble-user-bg:rgb(40, 30, 35)'

const ROW = (role: 'user' | 'ai', inner: string) => `<div data-chat="message-frame"><div class="mes item ${role === 'ai' ? 'Ai' : 'User self'}" data-lt-role="${role}">
  <div class="ch_name">${role === 'user' ? '玩家' : ''}</div>
  <div class="touch-scope mes_block">${inner}</div></div></div>`
const HINT = '<div class="extraMesButtonsHint icon" role="button"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></div>'
const REGEN = '<div class="lt-msg-regen hover-pill" role="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 4v5h-5"/></svg><span class="hover-pill-label">重新生成</span></div>'

function render(bind: boolean) {
  expect(chrome, 'Install Chrome or set CHROME_BIN').toBeTruthy()
  const code = bind
    ? buildSync({ entryPoints: ['src/sandbox/card-block-theme.ts'], bundle: true, write: false, format: 'iife', globalName: 'Block', tsconfig: 'tsconfig.json' }).outputFiles[0].text
    : 'var Block={bindCardBlockTheme:function(){return function(){}}}'
  const css = ['src/sandbox/shell.css', 'src/pages/canvas/canvas.css'].map(p => readFileSync(p, 'utf8')).join('\n')
  const dir = mkdtempSync(join(tmpdir(), 'sandbox-row-')); dirs.push(dir)
  const file = join(dir, 'index.html')
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${css}</style><style id="author">${AUTHOR}</style>
    <div class="canvas-root chat lt-format-mmd" data-chat="root" data-chrome="host" data-theme="dark" style="${HOST_VARS};width:600px;height:700px">
      <div data-chat="list">
        ${ROW('user', `<div class="mes_turn"><div class="mes_text right">燈塔今晚還會亮嗎？</div><div class="select-box mes_buttons">${HINT}</div></div>`)}
        ${ROW('ai', `<details class="mes_reasoning_details"><summary>思考過程</summary><div class="mes_reasoning">先回想上一段。</div></details>
          <div class="mes_turn"><div class="mes_text" data-lt-role="ai">燈塔今晚會亮。</div><div class="select-box mes_buttons">${REGEN}${HINT}</div></div>`)}
      </div>
    </div><pre id="result"></pre><script>${code}</script><script>
    const root=document.querySelector('[data-chat=root]');
    const list=root.querySelector('[data-chat=list]');
    const dispose=Block.bindCardBlockTheme(root,list);
    const box=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,h:r.height,cy:r.top+r.height/2}};
    const look=el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,fg:s.color,border:s.borderTopColor,bw:s.borderTopWidth}};
    const pause=()=>new Promise(r=>setTimeout(r,120));
    (async()=>{
      await pause();
      const [userRow,aiRow]=list.querySelectorAll('.mes');
      const read=()=>({
        userHint:box(userRow.querySelector('.extraMesButtonsHint')),
        reasoning:box(aiRow.querySelector('.mes_reasoning_details')),
        regen:box(aiRow.querySelector('.lt-msg-regen')), hint:box(aiRow.querySelector('.extraMesButtonsHint')),
        regenHit:(()=>{const r=aiRow.querySelector('.lt-msg-regen').getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top-4)===aiRow.querySelector('.lt-msg-regen')})(),
        regenLook:look(aiRow.querySelector('.lt-msg-regen')), hintLook:look(aiRow.querySelector('.extraMesButtonsHint')),
        reasoningLook:look(aiRow.querySelector('.mes_reasoning_details')), bubbleLook:look(aiRow.querySelector('.mes_text')),
      });
      const painted=read();
      document.getElementById('author').remove();await pause();
      const unpainted=read();
      // 日夜切換：作者的白天配色掛在 data-theme 上，殼切主題後要重量
      const day=document.createElement('style');day.textContent='[data-chat=root][data-theme=light] .mes_text{background:rgb(250, 240, 230);color:rgb(30, 20, 10)}';document.head.appendChild(day);
      await pause();root.setAttribute('data-theme','light');await pause();
      const themed=read();
      // 漸層當底：量到的底色是透明，塊用淡框，不是預設的深色氣泡底
      day.textContent='[data-chat=root] .mes_text{background:linear-gradient(rgb(250, 240, 230), rgb(240, 220, 200));color:rgb(30, 20, 10)}';
      await pause();
      const gradient=read();
      dispose();
      document.querySelector('pre').textContent=JSON.stringify({painted,unpainted,themed,gradient});
    })();</script>`)
  const run = spawnSync(chrome!, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--window-size=800,900', '--dump-dom', '--virtual-time-budget=2000', `file://${file}`], { encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024 })
  expect(run.error, run.stderr).toBeUndefined(); expect(run.status, run.stderr).toBe(0)
  const json = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
  expect(json, run.stdout).toBeTruthy(); return JSON.parse(json!)
}

describe('沙箱殼的訊息列', () => {
  it('玩家那則的 ⋯ 跟下一則的思考過程之間有 14px 列距', () => {
    const { painted } = render(false)
    expect(Math.round(painted.reasoning.top - painted.userHint.bottom)).toBe(14)
  })

  it('重新生成跟 ⋯ 同高、中心對齊、同一對顏色，點擊區一樣往上下擴', () => {
    const { painted } = render(false)
    expect(painted.regen.h).toBe(22)
    expect(painted.hint.h).toBe(22)
    expect(painted.regen.cy).toBe(painted.hint.cy)
    expect(painted.regenLook).toEqual(painted.hintLook)
    expect(painted.regenHit).toBe(true)
  })

  it('沒量到作者的塊時，思考過程退到 AI 氣泡的 token，不是透明淡框', () => {
    const { painted } = render(false)
    expect(painted.reasoningLook.bg).toBe('rgb(26, 26, 31)')
    expect(painted.reasoningLook.fg).toBe('rgb(242, 242, 245)')
  })

  it('作者漆了 AI 氣泡：思考過程拿到同一個底色、字色與描邊；樣式拿掉後退回宿主的 token', () => {
    const { painted, unpainted } = render(true)
    expect(painted.reasoningLook).toEqual(painted.bubbleLook)
    expect(painted.bubbleLook.bg).toBe('rgb(58, 31, 77)')
    expect(unpainted.reasoningLook.bg).toBe('rgb(26, 26, 31)')
    expect(unpainted.reasoningLook.fg).toBe('rgb(242, 242, 245)')
  })

  it('作者的配色掛在 data-theme 上：殼切了日夜，思考過程跟著重量', () => {
    const { themed } = render(true)
    expect(themed.bubbleLook.bg).toBe('rgb(250, 240, 230)')
    expect(themed.reasoningLook.bg).toBe('rgb(250, 240, 230)')
    expect(themed.reasoningLook.fg).toBe('rgb(30, 20, 10)')
  })

  it('氣泡用漸層當底（量到透明）：思考過程是淡框配氣泡的字色，不是一塊深色', () => {
    const { gradient } = render(true)
    expect(gradient.reasoningLook.bg).not.toBe('rgb(26, 26, 31)')
    expect(gradient.reasoningLook.bg).toMatch(/\/ 0\.07\)$/)
    expect(gradient.reasoningLook.fg).toBe('rgb(30, 20, 10)')
  })
})
