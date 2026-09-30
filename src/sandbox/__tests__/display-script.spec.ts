// @vitest-environment jsdom
/**
 * 沙箱殼的顯示字形轉換：正則套完之後只轉文字節點；字典載好之前照原文畫，載好後整個列表重畫、ready 完成。
 */
import { describe, it, expect } from 'vitest'
import { renderAppliedContent } from '../rules'
import { convertTextNodes, directionForLocale } from '@/common/display-script-walk'
import { createShell } from '../shell'
import type { SandboxHelloConfig } from '../protocol'
import type { RuleRunner } from '@/common/author-rules'

const toHans = (t: string) => t.replace(/傳/g, '传').replace(/記/g, '记').replace(/卷宗/g, '卷宗')

describe('convertTextNodes', () => {
  it('只轉文字；屬性、script、style、translate="no" 不碰', () => {
    const div = document.createElement('div')
    div.innerHTML = '<p title="傳">傳記</p><script>var a="傳"</script><style>.傳{}</style><span translate="no">傳</span><b class="notranslate">傳</b>'
    convertTextNodes(div, toHans)
    expect(div.querySelector('p')!.textContent).toBe('传记')
    expect(div.querySelector('p')!.getAttribute('title')).toBe('傳')
    expect(div.querySelector('script')!.textContent).toBe('var a="傳"')
    expect(div.querySelector('style')!.textContent).toBe('.傳{}')
    expect(div.querySelector('span')!.textContent).toBe('傳')
    expect(div.querySelector('b')!.textContent).toBe('傳')
  })
  it('方向：正體轉繁、簡體轉簡、其他語言不動', () => {
    expect(directionForLocale('zh-Hant')).toBe('s2t')
    expect(directionForLocale('zh-Hans')).toBe('t2s')
    expect(directionForLocale('en')).toBe('none')
  })
})

describe('renderAppliedContent 的 convert', () => {
  it('正則產物（替換出來的標籤）也跟著轉，class 不動', () => {
    const html = renderAppliedContent('<div class="td-shi">史官 · 傳記</div>', { convert: toHans })
    expect(html).toContain('史官 · 传记')
    expect(html).toContain('class="td-shi"')
  })
  it('沒給 convert 就是原文', () => {
    expect(renderAppliedContent('傳記', {})).toContain('傳記')
  })
})

const identityRunner: RuleRunner = {
  display: (job: { text: string }) => ({ html: job.text, provisional: false }),
  onSettled: () => () => {},
} as unknown as RuleRunner

function baseConfig(locale: string): SandboxHelloConfig {
  return {
    theme: 'dark', locale, role: { name: 'A', avatarUrl: '' }, user: { nickname: 'B', avatarUrl: '' },
    card: { rules: [], statusbar: '' }, capabilities: { saves: false, edit: false, send: true }, composer: true,
  }
}

describe('殼：字典載好後重畫', () => {
  it('簡體玩家：載入前照原文，載好後訊息換成簡體，sdk.text 也能轉', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    let finish: (fn: (t: string) => string) => void = () => {}
    const loaded = new Promise<(t: string) => string>((r) => { finish = r })
    const asked: string[] = []
    const shell = createShell({
      doc: document, win: window, mount: document.getElementById('app')!, config: baseConfig('zh-Hans'),
      transport: { send: () => {} }, ruleRunner: identityRunner,
      displayScript: (dir) => { asked.push(dir); return loaded },
    })
    shell.handle({ type: 'messages', messages: [{ id: 'm1', role: 'ai', content: '仙傳卷宗', state: 'done' }] } as never)
    await new Promise((r) => setTimeout(r, 30))
    expect(asked).toEqual(['t2s'])
    expect(document.body.textContent).toContain('仙傳卷宗')
    expect(shell.sdk.text.convert('傳')).toBe('傳')
    finish(toHans)
    await shell.sdk.text.ready()
    await new Promise((r) => setTimeout(r, 30))
    expect(document.body.textContent).toContain('仙传卷宗')
    expect(shell.sdk.text.convert('傳')).toBe('传')
    shell.dispose()
  })
  it('英文玩家：不載字典，ready 立刻完成', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    const asked: string[] = []
    const shell = createShell({
      doc: document, win: window, mount: document.getElementById('app')!, config: baseConfig('en'),
      transport: { send: () => {} }, ruleRunner: identityRunner,
      displayScript: (dir) => { asked.push(dir); return Promise.resolve(null) },
    })
    await shell.sdk.text.ready()
    expect(asked).toEqual([])
    shell.dispose()
  })
})
