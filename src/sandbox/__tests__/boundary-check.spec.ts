/**
 * scripts/check-sandbox-boundary.mjs 是 build:sandbox 的守門：殼的產物不得帶宿主那一側的東西。
 * 唯一的例外是 index.html 的 CSP connect-src 放行媒體素材庫（卡片 fetch 自己的 JSON／WASM）；
 * 這裡量例外剛好只開這一個值，其他 harperharbor.com 字串照樣擋。
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const script = path.resolve(__dirname, '../../../scripts/check-sandbox-boundary.mjs')

function run(csp: string, js = 'console.log(1)'): number {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-'))
  fs.mkdirSync(path.join(root, 'dist-sandbox'))
  fs.writeFileSync(path.join(root, 'dist-sandbox', 'index.html'),
    `<html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><script defer src="./sandbox.js"></script></head><body></body></html>`)
  fs.writeFileSync(path.join(root, 'dist-sandbox', 'sandbox.js'), js)
  const r = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' })
  fs.rmSync(root, { recursive: true, force: true })
  return r.status ?? -1
}

describe('check-sandbox-boundary', () => {
  it('放行 CSP 裡的素材庫 connect-src', () => {
    expect(run("default-src 'self'; connect-src 'self' https://assets.harperharbor.com; object-src 'none'")).toBe(0)
  })
  it('其他 harperharbor.com 來源照樣擋', () => {
    expect(run("connect-src 'self' https://assets.harperharbor.com https://api.harperharbor.com; object-src 'none'")).not.toBe(0)
    expect(run("connect-src 'self' https://api.harperharbor.com; object-src 'none'")).not.toBe(0)
  })
  it('素材庫網址出現在殼的腳本裡照樣擋', () => {
    expect(run("connect-src 'self' https://assets.harperharbor.com; object-src 'none'", 'const u="https://assets.harperharbor.com/x"')).not.toBe(0)
  })
})
