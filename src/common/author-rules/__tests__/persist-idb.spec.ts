/**
 * IndexedDB 持久層：存得進、讀得回、有上限、儲存不能用時整個停用而不丟錯。
 * node_modules 沒有 fake-indexeddb（不為此加依賴），這裡用一個只實作用得到的那幾個介面的小替身。
 */
import { describe, it, expect } from 'vitest'
import { createIdbRulePersist } from '../persist-idb'
import { deleteAuthorRuleStore } from '../store'
import { createRuleRunner, type RuleExecutor, type ExecutorJob } from '../rule-runner'
import { executeRuleJob, type RuleResult } from '../rule-job'

const tick = () => new Promise((r) => setTimeout(r, 0))
async function settle(times = 10) { for (let i = 0; i < times; i++) await tick() }

/** 最小的 IndexedDB 替身：記憶體裡的物件庫、非同步回呼、交易在最後一個請求完成後 complete。 */
function fakeIndexedDB(opts: { openThrows?: boolean; openErrors?: boolean; openHangs?: boolean; putThrows?: boolean } = {}) {
  const dbs = new Map<string, Map<string, { keyPath?: string; rows: Map<string, any>; indexes: Record<string, string> }>>()
  const versions = new Map<string, number>()
  /** 開著的連線（刪庫時對它們發 versionchange）。 */
  const live = new Map<string, Set<any>>()
  const clone = (v: any) => (v === undefined ? undefined : structuredClone(v))
  const request = () => ({ result: undefined as any, onsuccess: null as any, onerror: null as any })
  const factory = {
    opens: 0,
    deletes: [] as string[],
    deleteDatabase(name: string) {
      factory.deletes.push(name)
      const req: any = { ...request(), onblocked: null }
      setTimeout(() => {
        for (const db of Array.from(live.get(name) || [])) db.onversionchange && db.onversionchange()
        const stillOpen = Array.from(live.get(name) || []).length
        if (stillOpen) { req.onblocked && req.onblocked(); return }
        dbs.delete(name)
        versions.delete(name)
        req.onsuccess && req.onsuccess()
      }, 0)
      return req
    },
    open(name: string, version = 1) {
      factory.opens++
      if (opts.openThrows) throw new DOMException('denied', 'SecurityError')
      const req: any = { ...request(), onupgradeneeded: null, onblocked: null }
      setTimeout(() => {
        if (opts.openHangs) return
        if (opts.openErrors) { req.onerror && req.onerror(); return }
        let stores = dbs.get(name)
        const oldVersion = versions.get(name) || 0
        if (!stores) { stores = new Map(); dbs.set(name, stores) }
        versions.set(name, Math.max(oldVersion, version))
        const conns = live.get(name) || new Set<any>()
        live.set(name, conns)
        const db: any = {
          onversionchange: null,
          objectStoreNames: { contains: (n: string) => stores!.has(n) },
          createObjectStore(n: string, o: { keyPath?: string } = {}) {
            const store = { keyPath: o.keyPath, rows: new Map(), indexes: {} as Record<string, string> }
            stores!.set(n, store)
            return { createIndex(iname: string, path: string) { store.indexes[iname] = path } }
          },
          close() { conns.delete(db) },
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
                clear: () => issue(() => { store.rows.clear() }),
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
        conns.add(db)
        if (version > oldVersion && req.onupgradeneeded) req.onupgradeneeded({ oldVersion, newVersion: version })
        req.onsuccess && req.onsuccess()
      }, 0)
      return req
    },
    dbs,
    /** 某個物件庫裡的所有鍵（沒有這個庫／物件庫回空陣列）。 */
    keys: (name: string, store: string) => Array.from(dbs.get(name)?.get(store)?.rows.keys() || []),
  }
  return factory
}

const entry = (text: string, html: string) => ({ p: 'P', text, html, rollbacks: [] })
const SCOPE_A = 'a'.repeat(32)
const SCOPE_B = 'b'.repeat(32)
const DB = 'hearthroom-author-rules'

describe('IndexedDB 持久層', () => {
  it('環境沒有 IndexedDB（jsdom、SSR）：回 null', () => {
    expect(createIdbRulePersist({ factory: null })).toBeNull()
    expect(typeof indexedDB).toBe('undefined')
    expect(createIdbRulePersist()).toBeNull()
  })

  it('寫進去、讀得回；沒有的鍵是 undefined', async () => {
    const idb = fakeIndexedDB()
    const persist = createIdbRulePersist({ factory: idb as unknown as IDBFactory, scope: SCOPE_A })!
    persist.set('k1', entry('原文', '<b>產物</b>'))
    await settle()
    await expect(persist.get('k1')).resolves.toEqual(entry('原文', '<b>產物</b>'))
    await expect(persist.get('nope')).resolves.toBeUndefined()
    expect(idb.opens).toBe(1)
  })

  it('超過筆數上限：最久沒用的先丟（讀過的算用過）', async () => {
    const idb = fakeIndexedDB()
    const persist = createIdbRulePersist({ factory: idb as unknown as IDBFactory, scope: SCOPE_A, maxEntries: 3, evictDelayMs: 0 })!
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
    const persist = createIdbRulePersist({ factory: idb as unknown as IDBFactory, scope: SCOPE_A, maxChars: 30, maxEntryChars: 25, evictDelayMs: 0 })!
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
    const persist = createIdbRulePersist({ factory: idb as unknown as IDBFactory, scope: SCOPE_A, openTimeoutMs: 5 })!
    expect(() => persist.set('k', entry('a', 'b'))).not.toThrow()
    await expect(persist.get('k')).resolves.toBeUndefined()
    await expect(persist.get('k')).resolves.toBeUndefined()
    expect(idb.opens).toBe(1)
  })

  it('配額滿（put 丟錯）：set 不丟錯', async () => {
    const idb = fakeIndexedDB({ putThrows: true })
    const persist = createIdbRulePersist({ factory: idb as unknown as IDBFactory, scope: SCOPE_A })!
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
    const a = createRuleRunner({ executor, persist: createIdbRulePersist({ factory: idb as unknown as IDBFactory, scope: SCOPE_A }), engineVersion: 'v1' })
    a.display({ text: '【一】之後', rules })
    await settle(20)
    expect(started).toHaveLength(1)
    const b = createRuleRunner({ executor, persist: createIdbRulePersist({ factory: idb as unknown as IDBFactory, scope: SCOPE_A }), engineVersion: 'v1' })
    b.display({ text: '【一】之後', rules })
    await settle(20)
    expect(started).toHaveLength(1)
    expect(b.display({ text: '【一】之後', rules })).toEqual({ html: '<b>一</b>之後', provisional: false })
  })
})

describe('IndexedDB 持久層：依帳號分開、登出清掉', () => {
  const fake = () => { const idb = fakeIndexedDB(); return { idb, factory: idb as unknown as IDBFactory } }

  it('沒有帳號範圍：不開資料庫、不存，只用記憶體', async () => {
    const { idb, factory } = fake()
    const persist = createIdbRulePersist({ factory })!
    persist.set('k', entry('原文', '<b>產物</b>'))
    await settle()
    await expect(persist.get('k')).resolves.toBeUndefined()
    expect(idb.opens).toBe(0)
    expect(idb.dbs.size).toBe(0)
  })

  it('另一個帳號同一把鍵：不命中', async () => {
    const { factory } = fake()
    const a = createIdbRulePersist({ factory, scope: SCOPE_A })!
    a.set('k', entry('原文', '<b>A 的</b>'))
    await settle()
    await expect(a.get('k')).resolves.toEqual(entry('原文', '<b>A 的</b>'))
    const b = createIdbRulePersist({ factory, scope: SCOPE_B })!
    await expect(b.get('k')).resolves.toBeUndefined()
  })

  it('換成另一個帳號開庫：先把前一個帳號的全部清掉再用', async () => {
    const { idb, factory } = fake()
    const a = createIdbRulePersist({ factory, scope: SCOPE_A })!
    a.set('k1', entry('一', '1'))
    a.set('k2', entry('二', '2'))
    await settle()
    expect(idb.keys(DB, 'entries')).toHaveLength(2)
    const b = createIdbRulePersist({ factory, scope: SCOPE_B })!
    await b.get('whatever')
    await settle()
    expect(idb.keys(DB, 'entries')).toHaveLength(0)
    expect(idb.keys(DB, 'meta')).toHaveLength(0)
    // 回到 A 也拿不到了（已經清掉）
    const a2 = createIdbRulePersist({ factory, scope: SCOPE_A })!
    await expect(a2.get('k1')).resolves.toBeUndefined()
  })

  it('同一個分頁中途換帳號：舊帳號的產物清掉、之後讀不到', async () => {
    const { idb, factory } = fake()
    const persist = createIdbRulePersist({ factory, scope: SCOPE_A })!
    persist.set('k', entry('原文', 'A'))
    await settle()
    await persist.setScope(SCOPE_B)
    await expect(persist.get('k')).resolves.toBeUndefined()
    expect(idb.keys(DB, 'entries')).toHaveLength(0)
    persist.set('k', entry('原文', 'B'))
    await settle()
    await expect(persist.get('k')).resolves.toEqual(entry('原文', 'B'))
  })

  it('範圍變成沒有（登出、宿主沒給）：整個資料庫刪掉，之後不再存', async () => {
    const { idb, factory } = fake()
    const persist = createIdbRulePersist({ factory, scope: SCOPE_A })!
    persist.set('k', entry('原文', 'A'))
    await settle()
    await persist.setScope(null)
    expect(idb.deletes).toContain(DB)
    expect(idb.dbs.has(DB)).toBe(false)
    const opens = idb.opens
    persist.set('k2', entry('x', 'y'))
    await settle()
    await expect(persist.get('k')).resolves.toBeUndefined()
    expect(idb.opens).toBe(opens)
    expect(idb.dbs.has(DB)).toBe(false)
  })

  it('clear()：關掉自己的連線再刪庫（不會被自己擋住），之後不再存', async () => {
    const { idb, factory } = fake()
    const persist = createIdbRulePersist({ factory, scope: SCOPE_A })!
    persist.set('k', entry('原文', 'A'))
    await settle()
    await persist.clear()
    expect(idb.dbs.has(DB)).toBe(false)
    persist.set('k', entry('原文', 'A'))
    await settle()
    expect(idb.dbs.has(DB)).toBe(false)
    await expect(persist.get('k')).resolves.toBeUndefined()
  })

  it('別的分頁刪庫：這個分頁讓位（關連線），刪除不被擋住', async () => {
    const { idb, factory } = fake()
    const persist = createIdbRulePersist({ factory, scope: SCOPE_A })!
    persist.set('k', entry('原文', 'A'))
    await settle()
    await expect(deleteAuthorRuleStore({ factory })).resolves.toBe(true)
    expect(idb.dbs.has(DB)).toBe(false)
    await expect(persist.get('k')).resolves.toBeUndefined()
  })

  it('刪庫在沒有 IndexedDB、deleteDatabase 丟錯時都回 false 不丟錯', async () => {
    await expect(deleteAuthorRuleStore({ factory: null })).resolves.toBe(false)
    const broken = { deleteDatabase() { throw new DOMException('denied', 'SecurityError') } } as unknown as IDBFactory
    await expect(deleteAuthorRuleStore({ factory: broken })).resolves.toBe(false)
  })

  it('改版前留下的舊資料（沒有帳號標記）：第一次帶範圍開庫就清掉', async () => {
    const { idb, factory } = fake()
    // 舊版：版本 1、沒有 owner 物件庫
    const legacy = await new Promise<any>((resolve) => {
      const req: any = (factory as any).open(DB, 1)
      req.onupgradeneeded = () => { req.result.createObjectStore('entries'); req.result.createObjectStore('meta', { keyPath: 'k' }).createIndex('at', 'at') }
      req.onsuccess = () => resolve(req.result)
    })
    const t = legacy.transaction(['entries'], 'readwrite')
    t.objectStore('entries').put({ p: 'P', text: '舊的聊天', html: '舊', rollbacks: [] }, 'old-key')
    await settle()
    legacy.close()
    expect(idb.keys(DB, 'entries')).toEqual(['old-key'])
    const persist = createIdbRulePersist({ factory, scope: SCOPE_A })!
    await persist.get('old-key')
    await settle()
    expect(idb.keys(DB, 'entries')).toHaveLength(0)
  })
})
