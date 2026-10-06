#!/usr/bin/env node
/**
 * 起一個靜態伺服器，同源提供 dist-sandbox、bench/card-preview 與一個卡資料夾，開瀏覽器就能離線預覽。
 *
 *   node scripts/serve-card-preview.mjs <card-dir> [--port 4173] [--open]
 *
 * 需要先 `npm run build:sandbox`。卡資料夾掛在 /card/；preview 頁在 /bench/card-preview/?card=/card/。
 * 零依賴（node:http）。只給本機用：不做任何驗證。
 */
import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const cardDir = path.resolve(args.find((a) => !a.startsWith('--')) || '.')
const port = Number(args[args.indexOf('--port') + 1]) || 4173
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' }

if (!existsSync(path.join(ROOT, 'dist-sandbox/index.html'))) { console.error('dist-sandbox missing: run `npm run build:sandbox` first'); process.exit(1) }
if (!existsSync(path.join(cardDir, 'rules.json'))) console.warn(`warning: ${cardDir} has no rules.json`)

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  let file
  if (url.pathname.startsWith('/card/')) file = path.join(cardDir, decodeURIComponent(url.pathname.slice('/card/'.length)))
  else file = path.join(ROOT, decodeURIComponent(url.pathname))
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html')
  const base = url.pathname.startsWith('/card/') ? cardDir : ROOT
  if (!path.resolve(file).startsWith(base) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' })
  createReadStream(file).pipe(res)
})
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/bench/card-preview/?card=/card/`
  console.log(`card:    ${cardDir}\npreview: ${url}`)
  if (args.includes('--open')) spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).unref()
})
