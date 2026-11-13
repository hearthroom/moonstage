/**
 * 擴充換了，規則安裝要整個重建：先收舊的（容器、橋、觀察器、作者範圍、訊息裡掛過的腳本），再套新的。
 * 只換規則陣列的話，舊擴充的 <style>、計時器與事件會留在頁面上。沙箱卡由 mountSandbox 拆掉重建 iframe。
 * 這裡跑頁面上真正的兩支函式，只替換它們碰到的邊界。
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { resolve } from 'node:path'
import { assetWorkshopHash, needsAssetRebuild, normalizeWorkshopView, viewOpeningSource } from '../canvas-workshop'

const page = parse(readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')).descriptor.scriptSetup!.content
const ast = ts.createSourceFile('canvas.ts', page, ts.ScriptTarget.Latest, true)
/** 抽出頁面上的函式；可變的模組變數放在 scope 物件上，函式改它們時測試讀得到。 */
function handler(name: string, scope: Record<string, any>) {
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)!
  const js = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function('scope', `with (scope) { ${js}; return ${name} }`)(scope)
}

function rebuildScope(sandbox: boolean) {
  const order: string[] = []
  const oldScope = { dispose: vi.fn(() => order.push('scope.dispose')) }
  const oldScripts = new WeakMap()
  const scope: Record<string, any> = {
    authorScopeClosed: false,
    sandboxCard: { value: sandbox }, sandboxReloads: { value: 0 },
    authorScope: oldScope,
    activatedMessageScripts: oldScripts,
    teardownAuthorRuntime: vi.fn(() => order.push('teardown')),
    applyAuthorAsset: vi.fn(() => order.push('apply')),
  }
  return { scope, order, oldScope, oldScripts, rebuild: handler('rebuildAuthorAsset', scope) }
}

describe('rebuildAuthorAsset', () => {
  it('一般卡：先收執行期、再收作者範圍、清掉訊息腳本記錄，最後才套新的', () => {
    const f = rebuildScope(false)
    f.rebuild({ workshopHash: 'b' })
    expect(f.order).toEqual(['teardown', 'scope.dispose', 'apply'])
    expect(f.scope.authorScope).toBeNull()
    expect(f.scope.activatedMessageScripts).not.toBe(f.oldScripts)
    expect(f.scope.applyAuthorAsset).toHaveBeenCalledWith({ workshopHash: 'b' })
    // 頁面還活著：範圍沒有被關閉，下一次套用會再建一個
    expect(f.scope.authorScopeClosed).toBe(false)
  })

  it('沙箱卡：換一個新的 iframe 再交給 applyAuthorAsset（舊殼收過 hello 就不再喊 ready-shell）', () => {
    const f = rebuildScope(true)
    f.rebuild({ workshopHash: 'b' })
    expect(f.order).toEqual(['apply'])
    expect(f.scope.sandboxReloads.value).toBe(1)
    expect(f.scope.authorScope).toBe(f.oldScope)
  })

  it('頁面已離場：什麼都不做', () => {
    const f = rebuildScope(false)
    f.scope.authorScopeClosed = true
    f.rebuild({ workshopHash: 'b' })
    expect(f.order).toEqual([])
  })
})

describe('reloadAuthorAssetForConversation', () => {
  function reloadScope(installed: string | null) {
    let resolveGet: (v: any) => void = () => {}
    const get = vi.fn(() => new Promise((r) => { resolveGet = r }))
    const scope: Record<string, any> = {
      _this: { http: { get }, requestUrl: { authorAssetServe: '/serve' } },
      roleId: { value: 'role' }, conversationId: { value: 'c1' }, previewDraft: { value: null },
      unref: (r: any) => r.value,
      installedWorkshopHash: installed, workshopAssetSeq: 0,
      needsAssetRebuild, assetWorkshopHash,
      rebuildAuthorAsset: vi.fn(),
      workshopTrialQuery: () => ({}),
      console: { warn: vi.fn() },
    }
    return { scope, get, respond: (v: any) => resolveGet(v), reload: handler('reloadAuthorAssetForConversation', scope) }
  }

  it('帶這段對話讀資產；hash 不同才重建', async () => {
    const f = reloadScope('a')
    const done = f.reload('c1')
    expect(f.get).toHaveBeenCalledWith('/serve', expect.objectContaining({ data: { roleId: 'role', conversationId: 'c1' } }))
    f.respond({ statusCode: 200, data: { rules: [], workshopHash: 'b' } })
    await done
    expect(f.scope.rebuildAuthorAsset).toHaveBeenCalledWith({ rules: [], workshopHash: 'b' })
  })

  it('hash 一樣：不重建（不讓擴充以外的原因把作者腳本重跑一次）', async () => {
    const f = reloadScope('a')
    const done = f.reload('c1')
    f.respond({ statusCode: 200, data: { rules: [], workshopHash: 'a' } })
    await done
    expect(f.scope.rebuildAuthorAsset).not.toHaveBeenCalled()
  })

  it('回來時已經換到別段對話：丟掉，不把上一段的版面裝上來', async () => {
    const f = reloadScope('a')
    const done = f.reload('c1')
    f.scope.conversationId.value = 'c2'
    f.respond({ statusCode: 200, data: { rules: [], workshopHash: 'b' } })
    await done
    expect(f.scope.rebuildAuthorAsset).not.toHaveBeenCalled()
  })

  it('讀不到：留著現在的版面', async () => {
    const f = reloadScope('a')
    const done = f.reload('c1')
    f.respond({ statusCode: 500, data: null })
    await done
    expect(f.scope.rebuildAuthorAsset).not.toHaveBeenCalled()
  })
})

describe('saveWorkshopCapacityTrigger（照樣開始）', () => {
  function triggerScope(response: any) {
    const post = vi.fn().mockResolvedValue(response)
    const scope: Record<string, any> = {
      _this: { requestUrl: { workshopCapacity: '/capacity' } },
      conversationId: { value: 'c1' }, unref: (r: any) => r.value,
      postArchiveAction: post, refreshWorkshopView: vi.fn(),
    }
    return { scope, post, save: handler('saveWorkshopCapacityTrigger', scope) }
  }

  it('寫這段對話的容量選擇，帶 revision；成功就重讀擴充檢視並讓呼叫端重送', async () => {
    const f = triggerScope({ statusCode: 200, data: { revision: 3 } })
    expect(await f.save(2)).toBe(true)
    expect(f.post).toHaveBeenCalledWith('/capacity', { conversationId: 'c1', expectedRevision: 2, choice: 'trigger' })
    expect(f.scope.refreshWorkshopView).toHaveBeenCalledOnce()
  })

  it('revision 舊了：不卡在「存失敗」一直重按，照樣重送讓伺服器回現在的建議', async () => {
    const f = triggerScope({ statusCode: 409, data: { error: 'capacity_revision_stale' } })
    expect(await f.save(2)).toBe(true)
  })

  it('其他失敗：不重送', async () => {
    const f = triggerScope({ statusCode: 500, data: {} })
    expect(await f.save(2)).toBe(false)
    expect(f.scope.refreshWorkshopView).not.toHaveBeenCalled()
  })
})

describe('refreshWorkshopView', () => {
  const VIEW = { manifestHash: 'h1', capacityRevision: 2, openingSource: { kind: 'workshop', workshopId: 'w1', workshopName: '雪夜篇', openingId: 'o1' }, items: [] }
  function viewScope(respond: (seq: number) => any) {
    let call = 0
    const get = vi.fn(async () => respond(++call))
    const scope: Record<string, any> = {
      _this: { http: { get }, requestUrl: { workshopConversation: '/view' } },
      roleId: { value: 'role' }, conversationId: { value: 'c1' }, hasLogin: { value: true },
      previewOnly: { value: false }, previewDraft: { value: null }, trialCard: { value: false },
      unref: (r: any) => r.value, normalizeWorkshopView, viewOpeningSource,
      stageHost: { card: { setWorkshop: vi.fn() } },
      workshopView: { value: null }, workshopViewConversation: '', workshopViewSeq: 0,
      activeOpening: { value: null }, syncOpeningExtras: vi.fn(),
      installedWorkshopHash: 'h1', reloadAuthorAssetForConversation: vi.fn(),
      pendingCapacityTrigger: false, applyPendingCapacityTrigger: vi.fn().mockResolvedValue(true),
    }
    return { scope, get, refresh: handler('refreshWorkshopView', scope) }
  }

  it('讀到：推給宿主、開場來源以伺服器為準、hash 一樣不重讀資產', async () => {
    const f = viewScope(() => ({ statusCode: 200, data: VIEW }))
    await f.refresh()
    expect(f.scope.stageHost.card.setWorkshop).toHaveBeenCalledWith('role', expect.objectContaining({ manifestHash: 'h1' }))
    expect(f.scope.activeOpening.value).toMatchObject({ conversationId: 'c1', source: { kind: 'workshop', workshopName: '雪夜篇' } })
    expect(f.scope.syncOpeningExtras).toHaveBeenCalled()
    expect(f.scope.reloadAuthorAssetForConversation).not.toHaveBeenCalled()
  })

  it('hash 跟已裝的不同：帶這段對話重讀資產', async () => {
    const f = viewScope(() => ({ statusCode: 200, data: { ...VIEW, manifestHash: 'h2' } }))
    await f.refresh()
    expect(f.scope.reloadAuthorAssetForConversation).toHaveBeenCalledWith('c1')
  })

  it('讀不到：推 null 給宿主，開場網頁與選項回到原卡的', async () => {
    const f = viewScope(() => ({ statusCode: 404, data: null }))
    await f.refresh()
    expect(f.scope.stageHost.card.setWorkshop).toHaveBeenCalledWith('role', null)
    expect(f.scope.syncOpeningExtras).toHaveBeenCalled()
    expect(f.scope.activeOpening.value).toBeNull()
  })

  it('晚到的舊回應不蓋掉新的', async () => {
    let release: (v: any) => void = () => {}
    const f = viewScope((n) => (n === 1 ? new Promise((r) => { release = r }) : { statusCode: 200, data: { ...VIEW, manifestHash: 'new' } }))
    const first = f.refresh()
    await f.refresh()
    release({ statusCode: 200, data: { ...VIEW, manifestHash: 'old' } })
    await first
    expect(f.scope.workshopView.value.manifestHash).toBe('new')
  })

  it('wsCapacity=trigger 續玩存檔：帶這段對話的 revision 寫一次；讀失敗也不留到下一段', async () => {
    const ok = viewScope(() => ({ statusCode: 200, data: VIEW }))
    ok.scope.pendingCapacityTrigger = true
    await ok.refresh()
    expect(ok.scope.applyPendingCapacityTrigger).toHaveBeenCalledWith(2)
    const fail = viewScope(() => ({ statusCode: 500, data: null }))
    fail.scope.pendingCapacityTrigger = true
    await fail.refresh()
    expect(fail.scope.applyPendingCapacityTrigger).not.toHaveBeenCalled()
    expect(fail.scope.pendingCapacityTrigger).toBe(false)
  })
})

