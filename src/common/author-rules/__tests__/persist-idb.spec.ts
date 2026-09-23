/**
 * IndexedDB 持久層：存得進、讀得回、有上限、儲存不能用時整個停用而不丟錯。
 * node_modules 沒有 fake-indexeddb（不為此加依賴），這裡用一個只實作用得到的那幾個介面的小替身。
 */
import { describe, it, expect } from 'vitest'
import { createIdbRulePersist } from '../persist-idb'
import { createRuleRunner, type RuleExecutor, type ExecutorJob } from '../rule-runner'
import { executeRuleJob, type RuleResult } from '../rule-job'

const tick = () => new Promise((r) => setTimeout(r, 0))
async function settle(times = 10) { for (let i = 0; i < times; i++) await tick() }

/** 最小的 IndexedDB 替身：記憶體裡的物件庫、非同步回呼、交易在最後一個請求完成後 complete。 */
function fakeIndexedDB(opts: { openThrows?: boolean; openErrors?: boolean; openHangs?: boolean; putThrows?: boolean } = {}) {
  const dbs = new Map<string, Map<string, { keyPath?: string; rows: Map<string, any>; indexes: Record<string, string> }>>()
  const clone = (v: any) => (v === undefined ? undefined : structuredClone(v))
  const request = () => ({ result: undefined as any, onsuccess: null as any, onerror: null as any })
  const factory = {
    opens: 0,
    open(name: string) {
      factory.opens++
      if (opts.openThrows) throw new DOMException('denied', 'SecurityError')
      const req: any = { ...request(), onupgradeneeded: null, onblocked: null }
      setTimeout(() => {
        if (opts.openHangs) return
        if (opts.openErrors) { req.onerror && req.onerror(); return }
        let stores = dbs.get(name)
        const fresh = !stores
        if (!stores) { stores = new Map(); dbs.set(name, stores) }
        const db: any = {
          objectStoreNames: { contains: (n: string) => stores!.has(n) },
          createObjectStore(n: string, o: { keyPath?: string } = {}) {
            const store = { keyPath: o.keyPath, rows: new Map(), indexes: {} as Record<string, string> }
            stores!.set(n, store)
            return { createIndex(iname: string, path: string) { store.indexes[iname] = path } }
          },
          close() {},
          transaction(names: string[], _mode: string) {
            let pending = 0
            const t: any = { oncomplete: null, onabort: null, done: false }
            const finishReq = () => {
              pending--
              setTimeout(() => { if (!pending && !t.done) { t.done = true; t.oncomplete && t.oncomplete() } }, 0)
            }
            const issue = (fn: () => any) => {
              const r = request()
              pending++
              setTimeout(() => { r.result = fn(); r.onsuccess && r.onsuccess(); finishReq() }, 0)
              return r
            }
            t.objectStore = (n: string) => {
              if (!names.includes(n)) throw new Error('not in scope')
              const store = stores!.get(n)!
              return {
                get: (k: string) => issue(() => clone(store.rows.get(k))),
                put: (v: any, k?: string) => {
                  if (opts.putThrows) throw new DOMException('full', 'QuotaExceededError')
                  const key = store.keyPath ? v[store.keyPath] : k!
                  return issue(() => { store.rows.set(key, clone(v)); return key })
                },
                delete: (k: string) => issue(() => { store.rows.delete(k) }),
                index: (iname: string) => ({
                  openCursor() {
                    const path = store.indexes[iname]
                    const sorted = Array.from(store.rows.values()).sort((a, b) => a[path] - b[path])
                    let i = 0
                    const r: any = request()
                    pending++
                    const step = () => setTimeout(() => {
                      if (i < sorted.length) {
                        const value = clone(sorted[i])
                        r.result = { value, continue: () => { i++; step() } }
                        r.onsuccess && r.onsuccess()
                      } else {
                        r.result = null
                        r.onsuccess && r.onsuccess()
                        finishReq()
                      }
                    }, 0)
                    step()
                    return r
                  },
                }),
              }
            }
            return t
          },
        }
        req.result = db
        if (fresh && req.onupgradeneeded) req.onupgradeneeded()
        req.onsuccess && req.onsuccess()
      }, 0)
      return req
    },
    dbs,
  }
  return factory
}

const entry = (text: string, html: string) => ({ p: 'P', text, html, rollbacks: [] })

describe('IndexedDB 持久層', () => {
  it('環境沒有 IndexedDB（jsdom、SSR）：回 null', () => {
    expect(createIdbRulePersist({ factory: null })).toBeNull()
    expect(typeof indexedDB).toBe('undefined')
    expect(createIdbRulePersist()).toBeNull()
  })

  it('寫進去、讀得回；沒有的鍵是 undefined', async () => {
    const idb = fakeIndexedDB()
    const persist = createIdbRulePersist({ factory: idb as unknown as IDBFactory })!
    persist.set('k1', entry('原文', '<b>產物</b>'))
    await settle()
    await expect(persist.get('k1')).resolves.toEqual(entry('原文', '<b>產物</b>'))
    await expect(persist.get('nope')).resolves.toBeUndefined()
    expect(idb.opens).toBe(1)
  })

  it('超過筆數上限：最久沒用的先丟（讀過的算用過）', async () => {
    const idb = fakeIndexedDB()
    const persist = createIdbRulePersist({ factory: idb as unknown as IDBFactory, maxEntries: 3, evictDelayMs: 0 })!
    for (const k of ['a', 'b', 'c']) { persist.set(k, entry(k, k)); await settle() }
    await persist.get('a') // a 剛用過
    await settle()
    persist.set('d', entry('d', 'd'))
    await settle(30)
    expect(await persist.get('b')).toBeUndefined()
    for (const k of ['a', 'c', 'd']) expect(await persist.get(k)).toEqual(entry(k, k))
  })

  it('超過字元數上限也淘汰；單筆太大的不存', async () => {
    const idb = fakeIndexedDB()
    const persist = createIdbRulePersist({ factory: idb as unknown as IDBFactory, maxChars: 30, maxEntryChars: 25, evictDelayMs: 0 })!
    persist.set('x', entry('x'.repeat(30), ''))
    await settle()
    expect(await persist.get('x')).toBeUndefined()
    persist.set('a', entry('a'.repeat(10), ''))
    await settle()
    persist.set('b', entry('b'.repeat(10), ''))
    await settle()
    persist.set('c', entry('c'.repeat(10), ''))
    await settle(30)
    expect(await persist.get('a')).toBeUndefined()
    expect(await persist.get('c')).toBeTruthy()
  })

  it.each([
    ['open 直接丟 SecurityError（不透明源、私密模式）', { openThrows: true }],
    ['open 回 onerror', { openErrors: true }],
    ['open 一直沒回應（別的分頁擋著）', { openHangs: true }],
  ])('%s：get 回 undefined、set 不丟錯，之後不再重試', async (_name, o) => {
    const idb = fakeIndexedDB(o)
    const persist = createIdbRulePersist({ factory: idb as unknown as IDBFactory, openTimeoutMs: 5 })!
    expect(() => persist.set('k', entry('a', 'b'))).not.toThrow()
    await expect(persist.get('k')).resolves.toBeUndefined()
    await expect(persist.get('k')).resolves.toBeUndefined()
    expect(idb.opens).toBe(1)
  })

  it('配額滿（put 丟錯）：set 不丟錯', async () => {
    const idb = fakeIndexedDB({ putThrows: true })
    const persist = createIdbRulePersist({ factory: idb as unknown as IDBFactory })!
    expect(() => persist.set('k', entry('a', 'b'))).not.toThrow()
    await settle()
    await expect(persist.get('k')).resolves.toBeUndefined()
  })

  it('接上排程器：第一次跑完存進去，重整（新的排程器）直接命中、不排工作', async () => {
    const idb = fakeIndexedDB()
    const rules = [{ id: '1', find: '/【([^】]*)】/g', replace: '<b>$1</b>' }]
    const started: ExecutorJob[] = []
    const executor: RuleExecutor = {
      available: () => true,
      run: (job) => { started.push(job); return Promise.resolve(executeRuleJob(job.engine, job.text, job.rules as any[], job.options) as RuleResult) },
    }
    const a = createRuleRunner({ executor, persist: createIdbRulePersist({ factory: idb as unknown as IDBFactory }), engineVersion: 'v1' })
    a.display({ text: '【一】之後', rules })
    await settle(20)
    expect(started).toHaveLength(1)
    const b = createRuleRunner({ executor, persist: createIdbRulePersist({ factory: idb as unknown as IDBFactory }), engineVersion: 'v1' })
    b.display({ text: '【一】之後', rules })
    await settle(20)
    expect(started).toHaveLength(1)
    expect(b.display({ text: '【一】之後', rules })).toEqual({ html: '<b>一</b>之後', provisional: false })
  })
})
