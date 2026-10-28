// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { buildSync } from 'esbuild'
import { panelIconMarkup, panelIconSvg } from '../../pages/canvas/canvas-panel-icons'

const chrome = process.env.CHROME_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(existsSync)
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function render(theme: 'dark' | 'light') {
  expect(chrome, 'Install Chrome or set CHROME_BIN').toBeTruthy()
  const code = buildSync({ entryPoints: ['src/sandbox/theme-bridge.ts'], bundle: true, write: false, format: 'iife', globalName: 'Bridge' }).outputFiles[0].text
  const icon = panelIconMarkup('model')
  const mask = `url("data:image/svg+xml,${encodeURIComponent(panelIconSvg('model'))}")`.replace(/"/g, '&quot;')
  const css = ['src/sandbox/shell.css', 'src/pages/canvas/canvas.css'].map(p => readFileSync(p, 'utf8')).join('\n')
  const dir = mkdtempSync(join(tmpdir(), 'sandbox-theme-')); dirs.push(dir)
  const file = join(dir, 'index.html')
  writeFileSync(file, `<!doctype html><style>${css}</style>
    <div class="canvas-root chat" data-chat="root" data-chrome="standard" data-theme="${theme}">
      <header class="topTabbar">Header</header><div class="mes_text">Message</div>
      <div class="shortcut-btn"><span class="sb-icon" style="--ms-panel-icon-image:${mask}"><uni-image>${icon}</uni-image></span>Shortcut</div>
      <div class="send-msg"><div class="uni-textarea-placeholder">Expanded hint</div><span class="chat-input-collapsed-placeholder">Collapsed hint</span></div>
    </div><pre id="result"></pre><script>${code}</script><script>
    const root=document.querySelector('[data-chat=root]');
    const style=document.createElement('style');document.head.appendChild(style);
    const bridge=Bridge.createThemeBridge(root,window,style);
    const host={'--lt-canvas-bg':'rgb(25, 30, 35)','--lt-canvas-fg':'rgb(220, 221, 222)',
      '--lt-canvas-header-bg':'rgba(25, 30, 35, 0.72)',
      '--lt-canvas-header-fg':'rgb(220, 221, 222)',
      '--lt-canvas-bubble-ai-bg':'rgba(10, 20, 30, 0.72)',
      '--lt-canvas-bubble-fg':'rgb(210, 211, 212)'};
    bridge.update(host);
    const color=el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el).color});
    const read=()=>({root:color(root),header:color(root.querySelector('header')),bubble:color(root.querySelector('.mes_text')),placeholder:color(root.querySelector('.chat-input-collapsed-placeholder')),expandedPlaceholder:color(root.querySelector('.uni-textarea-placeholder')),icon:{...color(root.querySelector('.sb-icon')),mask:getComputedStyle(root.querySelector('.sb-icon')).maskImage,visibility:getComputedStyle(root.querySelector('.sb-icon uni-image')).visibility}});
    const pause=()=>new Promise(r=>setTimeout(r,80));
    (async()=>{
      await pause();const baseline=read();
      style.textContent='[data-chat="root"].day {--chat-bg:rgb(190, 230, 225);--chat-text:rgb(15, 45, 55);--chat-bubble-ai-bg:rgb(255, 245, 235);--chat-bubble-text:rgb(50, 30, 20);--chat-input-placeholder:rgb(55, 100, 110);--chat-shortcut-text:rgb(50, 90, 100)}';
      root.classList.add('day');await pause();const day=read();
      style.firstChild.data+='[data-chat="root"].night {--chat-bg:rgb(10, 20, 40);--chat-text:rgb(240, 241, 242)}';
      root.classList.replace('day','night');await pause();const night=read();
      bridge.update({...host,'--lt-canvas-bg':'rgb(35, 40, 45)'});await pause();const hostUpdate=read();
      root.classList.remove('night');await pause();const native=read();
      root.style.setProperty('--chat-bg','rgb(35, 40, 45)');await pause();const equalHost=read();
      root.style.setProperty('--chat-bg','rgb(100, 110, 120)');await pause();const inline=read();
      root.style.removeProperty('--chat-bg');style.remove();await pause();const removed=read();
      root.style.setProperty('--lt-canvas-bg','rgb(80, 90, 100)');await pause();const nativeOverride=read();
      root.style.removeProperty('--lt-canvas-bg');await pause();
      const bubbleStyle=document.createElement('style');bubbleStyle.textContent='[data-chat=root]{--chat-bg:rgb(65, 75, 85)}';root.querySelector('.mes_text').appendChild(bubbleStyle);await pause();const bubbleStyleTheme=read();
      bubbleStyle.remove();await pause();
      bridge.dispose();root.style.setProperty('--chat-bg','rgb(1, 2, 3)');await pause();const disposed=read();
      document.querySelector('pre').textContent=JSON.stringify({baseline,day,night,hostUpdate,native,equalHost,inline,removed,nativeOverride,bubbleStyleTheme,disposed});
    })();</script>`)
  const run = spawnSync(chrome!, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=1500', `file://${file}`], { encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024 })
  expect(run.error, run.stderr).toBeUndefined();expect(run.status, run.stderr).toBe(0)
  const json = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
  expect(json, run.stdout).toBeTruthy();return JSON.parse(json!)
}

describe('MMD sandbox author theme on standard canvas', () => {
  it.each(['dark', 'light'] as const)('applies author tokens, follows changes and restores host values in %s', theme => {
    const r=render(theme)
    expect(r.baseline.root).toEqual({bg:'rgb(25, 30, 35)',fg:'rgb(220, 221, 222)'})
    expect(r.baseline.header.bg).toBe('rgba(25, 30, 35, 0.72)')
    expect(r.baseline.bubble.bg).toBe('rgba(10, 20, 30, 0.72)')
    expect(r.day.root).toEqual({bg:'rgb(190, 230, 225)',fg:'rgb(15, 45, 55)'})
    expect(r.day.header).toEqual(r.day.root)
    expect(r.day.placeholder.fg).toBe('rgb(55, 100, 110)')
    expect(r.day.expandedPlaceholder.fg).toBe('rgb(55, 100, 110)')
    expect(r.day.icon.bg).toBe('rgb(50, 90, 100)')
    expect(r.day.icon.mask).not.toBe('none')
    expect(r.day.icon.visibility).toBe('hidden')
    expect(r.day.bubble).toEqual({bg:'rgb(255, 245, 235)',fg:'rgb(50, 30, 20)'})
    expect(r.night.root).toEqual({bg:'rgb(10, 20, 40)',fg:'rgb(240, 241, 242)'})
    expect(r.hostUpdate.root).toEqual(r.night.root)
    expect(r.native.root.bg).toBe('rgb(35, 40, 45)')
    expect(r.native.header).toEqual(r.baseline.header)
    expect(r.native.placeholder).toEqual(r.baseline.placeholder)
    expect(r.native.expandedPlaceholder).toEqual(r.baseline.expandedPlaceholder)
    expect(r.native.icon).toEqual(r.baseline.icon)
    expect(r.native.bubble).toEqual(r.baseline.bubble)
    expect(r.equalHost.header.bg).toBe('rgb(35, 40, 45)')
    expect(r.inline.root.bg).toBe('rgb(100, 110, 120)')
    expect(r.removed).toEqual(r.native)
    expect(r.nativeOverride.root.bg).toBe('rgb(80, 90, 100)')
    expect(r.bubbleStyleTheme.root.bg).toBe('rgb(65, 75, 85)')
    expect(r.disposed).toEqual(r.native)
  }, 30000)
})
