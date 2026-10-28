import { expect, it } from 'vitest'
import { createShell } from '../shell'
import type { SandboxHelloConfig } from '../protocol'
import type { RuleRunner } from '@/common/author-rules'

const raw = '状态：穿着校服'
const convert = (s: string) => s.replace(/状态/g, '狀態').replace(/穿着/g, '穿著')
const identityRunner = {
  display: (job: { text: string }) => ({ html: job.text, provisional: false }),
  onSettled: () => () => {},
} as unknown as RuleRunner

it('author scripts read original HTML while platform prose still converts', async () => {
  document.body.innerHTML = '<div id="app"></div>'
  const config: SandboxHelloConfig = {
    theme: 'dark', locale: 'zh-Hant', cardLanguage: 'zh-Hans',
    role: { name: 'A', avatarUrl: '' }, user: { nickname: 'B', avatarUrl: '' },
    capabilities: { saves: false, edit: false, send: true }, composer: true,
    card: { statusbar: '', rules: [{ enabled: true, find: '__init__', replace: `<script>
      sdk.on('message:mount', function (event) { window.__rawPayload = event.content;
        document.querySelectorAll('.source').forEach(function (source) {
          var match = /^状态：(.*)$/.exec(source.textContent);
          var panel = document.createElement('section'); panel.className = 'panel';
          panel.textContent = match ? match[1] : 'MISSING';
          source.replaceWith(panel);
        });
      });
    </script>` }] },
  }
  const shell = createShell({ doc: document, win: window, mount: document.querySelector('#app')!, config,
    transport: { send: () => {} }, ruleRunner: identityRunner,
    displayScript: async () => convert,
  })
  try {
    await shell.sdk.text.ready()
    shell.handle({ type: 'messages', messages: [{ id: 'm1', role: 'ai', state: 'done',
      content: '她穿着校服\n\n<div class="source">' + raw + '</div>' }] } as never)
    await new Promise((r) => setTimeout(r, 30))
    expect(document.querySelector('.panel')?.textContent).toBe('穿着校服')
    expect(document.querySelector('[data-chat="message-body"]')?.textContent).toContain('她穿著校服')
    expect((window as any).__rawPayload).toContain(raw)
  } finally { shell.dispose(); delete (window as any).__rawPayload }
})
