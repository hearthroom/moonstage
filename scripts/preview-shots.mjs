#!/usr/bin/env node
/**
 * 離線預覽的截圖與快照：用系統的 Chrome（headless）開 bench/card-preview，等殼就緒，
 * 依序串一則樣本回覆，在幾個視口各拍一張，並把 `__preview.snapshot()` 寫成 JSON。零依賴：
 * 直接走 Chrome DevTools Protocol（Node 內建 WebSocket 與 fetch）。
 *
 *   node scripts/serve-card-preview.mjs <card-dir> --port 4173 &
 *   node scripts/preview-shots.mjs --url http://127.0.0.1:4173/bench/card-preview/?card=/card/ --out ./shots [--sample 1] [--sizes 390x844,900x640,1280x800] [--chrome <path>]
 *
 * 產出：<out>/<WxH>.png 與 <out>/snapshot.json（氣泡數、狀態面板數、殼的 debug 記錄、最後一則正文片段）。
 * 沒有 Chrome 就印出網址，請人開瀏覽器看。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const args = process.argv.slice(2)
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback }
const url = opt('url', 'http://127.0.0.1:4173/bench/card-preview/?card=/card/')
const out = path.resolve(opt('out', './preview-shots'))
const sizes = opt('sizes', '390x844,900x640,1280x800').split(',').map((s) => s.split('x').map(Number))
const sample = Number(opt('sample', '1'))
const chrome = opt('chrome', process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome')
const port = 9222 + Math.floor(Math.random() * 1000)

if (!existsSync(chrome)) { console.log(`no Chrome at ${chrome}; open ${url} in a browser instead`); process.exit(0) }
mkdirSync(out, { recursive: true })
const profile = path.join(os.tmpdir(), `hr-preview-${process.pid}`)
const proc = spawn(chrome, [`--headless=new`, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(fn, ms = 15000, step = 200) { const t0 = Date.now(); for (;;) { try { const v = await fn(); if (v) return v } catch { /* retry */ } if (Date.now() - t0 > ms) throw new Error('timeout'); await sleep(step) } }

try {
  const version = await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).json())
  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let seq = 0
  const pending = new Map()
  const sessions = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result) }
    if (m.method === 'Target.attachedToTarget') sessions.set(m.params.targetInfo.targetId, m.params.sessionId)
  }
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, sessionId })) })

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description)); return r.result.value }

  const results = {}
  for (const [w, h] of sizes) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 }, sessionId)
    // bare=1：預覽頁只剩殼，視口就是殼的視口（截圖才是玩家看到的那一塊）。
    const extra = 'bare=1' + (args.includes('--text-only') ? '&rules=off' : '')
    await send('Page.navigate', { url: url + (url.includes('?') ? '&' : '?') + extra }, sessionId)
    await waitFor(() => evaluate('typeof __preview === "object" && __preview.sent.some(m => m.type === "ready")'), 20000)
    await sleep(300)
    if (sample > 0) {
      await evaluate(`(async () => { const s = __preview.state.samples[${sample - 1}]; if (s) await __preview.stream(s, 8); return true })()`)
      await sleep(600)
    }
    const snap = await evaluate('JSON.stringify(__preview.snapshot())')
    results[`${w}x${h}`] = JSON.parse(snap)
    // --probe：探針卡把每條契約主張的結果寫在殼的 window.__probe；一併抄進 snapshot。
    if (args.includes('--probe')) {
      await sleep(800)
      results[`${w}x${h}`].probe = JSON.parse(await evaluate('JSON.stringify(document.getElementById("frame").contentWindow.__probe || null)'))
      const r = (results[`${w}x${h}`].probe && results[`${w}x${h}`].probe.results) || {}
      for (const [k, v] of Object.entries(r)) console.log(`  ${v.ok === true ? '✔' : v.ok === false ? '✖' : '·'} ${k}${v.note ? `  (${v.note.slice(0, 60)})` : ''}`)
    }
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId)
    writeFileSync(path.join(out, `${w}x${h}.png`), Buffer.from(shot.data, 'base64'))
    const sf = results[`${w}x${h}`].storyFirst || {}
    console.log(`${w}x${h}: bubbles ${results[`${w}x${h}`].bubbles}, status panels ${results[`${w}x${h}`].statusPanels}, raw ${results[`${w}x${h}`].rawPanels}; story text ${sf.storyTextShare}% of screen, ui ${sf.uiShare}%, interactive ${sf.interactiveAboveFold}, first choice above fold ${sf.firstChoiceAboveFold}, free input ${sf.freeInputVisible}${sf.rulesOff ? ' (rules off)' : ''}`)
    // --count a,b,c：數幾個選擇器在殼裡的節點數，寫進 snapshot（釘選列、頁面模式、任何 kit 元素）。
    if (opt('count', '')) {
      results[`${w}x${h}`].counts = JSON.parse(await evaluate(`JSON.stringify(Object.fromEntries(${JSON.stringify(opt('count', '').split(','))}.map(s => [s, document.getElementById('frame').contentDocument.querySelectorAll(s).length])))`))
      console.log(`  counts: ${JSON.stringify(results[`${w}x${h}`].counts)}`)
    }
    // --html sel：印出殼裡最後一個符合元素的 outerHTML（前 800 字），除錯用。
    if (opt('html', '')) console.log('  html: ' + (await evaluate(`(() => { const d = document.getElementById('frame').contentDocument; const els = d.querySelectorAll(${JSON.stringify(opt('html', ''))}); const el = els[els.length - 1]; return el ? el.outerHTML.slice(0, 800) : 'not found' })()`)))
    // --taps sel1,sel2：依序用真實輸入事件點這些元素，每點完回報 request 數、composer 內容與舞台狀態。
    if (opt('taps', '')) {
      const tapOne = async (selector, label) => {
        const rect = await evaluate(`(() => { const d = document.getElementById('frame').contentDocument; const el = Array.from(d.querySelectorAll(${JSON.stringify(selector)})).filter(e => e.getBoundingClientRect().height > 0).pop(); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const f = document.getElementById('frame').getBoundingClientRect(); return { x: f.left + r.left + r.width / 2, y: f.top + r.top + r.height / 2 } })()`)
        if (!rect) { console.log(`  tap ${label}: not found`); return }
        await sleep(200)
        for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sessionId)
        await sleep(1200)
        const snap = JSON.parse(await evaluate('JSON.stringify(__preview.snapshot())'))
        const s = await send('Page.captureScreenshot', { format: 'png' }, sessionId)
        writeFileSync(path.join(out, `${w}x${h}-tap-${label}.png`), Buffer.from(s.data, 'base64'))
        console.log(`  tap ${label}: requests ${snap.logTail.filter((l) => l.startsWith('request')).length}, composer "${(snap.composerValue || '').slice(0, 40)}", stage ${snap.stage}, bubbles ${snap.bubbles}`)
      }
      const taps = opt('taps', '').split(',')
      for (let i = 0; i < taps.length; i++) await tapOne(taps[i], String(i + 1))
    }
    // --interact：用真的輸入事件（isTrusted）點殼裡的元素，走跟玩家一樣的手勢路徑；合成的 click 不算手勢。
    if (args.includes('--interact')) {
      const tap = async (selector, label) => {
        const rect = await evaluate(`(() => { const d = document.getElementById('frame').contentDocument; const el = Array.from(d.querySelectorAll(${JSON.stringify(selector)})).filter(e => e.getBoundingClientRect().height > 0).pop(); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const f = document.getElementById('frame').getBoundingClientRect(); return { x: f.left + r.left + r.width / 2, y: f.top + r.top + r.height / 2 } })()`)
        if (!rect) { console.log(`  ${label}: not found`); return false }
        await sleep(200)
        for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sessionId)
        await sleep(900)
        const s = await send('Page.captureScreenshot', { format: 'png' }, sessionId)
        writeFileSync(path.join(out, `${w}x${h}-${label}.png`), Buffer.from(s.data, 'base64'))
        return true
      }
      if (await tap('.hr-choice:not(.hr-choice--own), .lt-choice:not(.lt-choice--own)', 'choice')) {
        // 帶確認的選項組第一次只是「待確認」，再點一次才送；已送出的鈕再點沒反應，所以一律點兩次。
        await tap('.hr-choice--armed', 'choice-confirm')
        await sleep(2500)
        results[`${w}x${h}`].afterChoice = JSON.parse(await evaluate('JSON.stringify(__preview.snapshot())'))
        const a = results[`${w}x${h}`].afterChoice
        console.log(`  choice tapped: requests ${a.logTail.filter((l) => l.startsWith('request')).length}, bubbles ${a.bubbles}, composer "${(a.composerValue || '').slice(0, 40)}"`)
      }
      if (await tap('.hr-dock__tab', 'dock')) results[`${w}x${h}`].dockOpen = await evaluate(`!!document.getElementById('frame').contentDocument.querySelector('.hr-dock--open')`)
    }
  }
  writeFileSync(path.join(out, 'snapshot.json'), JSON.stringify(results, null, 2))
  console.log(`✔ ${out}`)
  ws.close()
} catch (e) {
  console.error('✖', e.message)
  process.exitCode = 1
} finally {
  proc.kill()
}
