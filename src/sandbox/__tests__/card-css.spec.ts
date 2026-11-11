import { afterEach, expect, it } from 'vitest'
import { createShell, type Shell } from '../shell'
import type { SandboxCard } from '../protocol'

let shell: Shell | null = null
afterEach(() => { shell?.dispose(); shell = null })
function boot(card: SandboxCard) {
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  shell = createShell({ doc: document, win: window as Window & typeof globalThis, mount,
    config: { theme: 'dark', locale: 'en', role: { name: 'Synthetic', avatarUrl: '' }, user: { nickname: 'Reader', avatarUrl: '' }, card, capabilities: { saves: false, edit: false, send: false }, composer: true },
    transport: { send() {} },
  })
  return shell
}

it('獨立 cardCss 不隨訊息數複製，顯示規則仍在另一張樣式表，離場清除', () => {
  const s = boot({ cardCss: '.mes{color:red}', rules: [{ find: 'x', replace: '<style>.mes{color:blue}</style>' }], statusbar: '' })
  const css = document.head.querySelector('style[data-lt="card-css"]')
  expect(css?.textContent).toContain('@layer lt-card-css')
  expect(s.refs.authorCss.textContent).toBe('.mes{color:blue}')
  expect(css?.compareDocumentPosition(s.refs.authorCss)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  s.handle({ type: 'messages', messages: [{ id: 'a', role: 'ai', content: 'one', serverId: null }, { id: 'b', role: 'ai', content: 'two', serverId: null }] })
  expect(document.head.querySelectorAll('style[data-lt="card-css"]')).toHaveLength(1)
  expect(s.refs.list.querySelector('style')).toBeNull()
  s.dispose(); shell = null
  expect(document.head.querySelector('style[data-lt="card-css"]')).toBeNull()
})

it('只有舊假規則的卡改為單次掛載，不把 CSS 夾在每則訊息', () => {
  const s = boot({ rules: [{ id: 'hearthroom-fengyue-inner-css', find: '/([\\s\\S])$/', replace: '$1<style>#ai-chat-input{color:red}</style>', enabled: true }], statusbar: '' })
  expect(document.head.querySelector('style[data-lt="card-css"]')?.textContent).toContain('@layer lt-author-fengyue')
  expect(s.refs.authorCss.textContent).toBe('')
  s.handle({ type: 'messages', messages: [{ id: 'a', role: 'ai', content: 'one', serverId: null }] })
  expect(s.refs.list.querySelector('style')).toBeNull()
})

it('明確清空欄位不會重新套用尚在 payload 裡的舊假規則', () => {
  const s = boot({ cardCss: '', rules: [{ id: 'hearthroom-fengyue-inner-css', find: '/([\\s\\S])$/', replace: '$1<style>#ai-chat-input{color:red}</style>', enabled: true }], statusbar: '' })
  expect(document.head.querySelector('style[data-lt="card-css"]')).toBeNull()
  expect(s.refs.authorCss.textContent).toBe('')
})
