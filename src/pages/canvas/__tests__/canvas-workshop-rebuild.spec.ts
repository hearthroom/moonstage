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
import { assetWorkshopHash, needsAssetRebuild } from '../canvas-workshop'

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
    sandboxCard: { value: sandbox },
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

  it('沙箱卡：頁面這邊沒有作者執行期，直接交給 applyAuthorAsset（mountSandbox 會拆掉舊 iframe）', () => {
    const f = rebuildScope(true)
    f.rebuild({ workshopHash: 'b' })
    expect(f.order).toEqual(['apply'])
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
