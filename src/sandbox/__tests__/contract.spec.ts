// @vitest-environment jsdom
/**
 * 沙箱作者契約的單一事實來源：`contract/sandbox-contract.json`。
 *
 * 這份 JSON 不是手寫的——它由本測試從執行期的物件生成（sdk 的鍵與能力、事件表、錯誤碼、
 * 淨化白名單、殼骨架的 data-chat／data-slot、shell.css 的 --chat-* 變數、規則引擎的常數），
 * 再跟倉庫裡的檔案逐字比對。改了契約卻沒重生檔案，這條測試就紅：
 *
 *   UPDATE_CONTRACT=1 npx vitest run src/sandbox/__tests__/contract.spec.ts
 *
 * 下游（hearthroom/skills 的驗證器與寫卡指南、CLI 的本機檢查）只讀這份 JSON，不再各自手抄一份表。
 * 伺服器端的上限（單條替換 128 KiB、整份 32 MiB）不在這個 repo，寫在 `provider` 節並標明出處。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { createSdk, SAVE_KEY_RE, SAVE_MAX_KEYS, SAVE_MAX_VALUE_BYTES, CACHE_QUOTA_BYTES, RATE_LIMITS, type SdkHost } from '../sdk/create-sdk'
import { createEventBus, SDK_EVENTS } from '../sdk/events'
import { SDK_ERROR_CODES } from '../sdk/errors'
import { ALLOWED_TAGS, UNWRAP_TAGS, DROP_TAGS, URL_ATTRS } from '../sanitize'
import { buildShell } from '../render/shell-dom'
import { shellStrings } from '../strings'
import { SANDBOX_PROTOCOL_VERSION } from '../protocol'
import { MESSAGE_SCOPE, stylePolicyFor } from '@/common/author-style-policy'
import { STANDARD_HTML_TAGS } from '@/pages/canvas/canvas-platform-defaults'
import {
  applyDisplayRules, DISPLAY_RULE_MIN_BUDGET,
  ROLLBACK_BAD_REGEX, ROLLBACK_EMPTY_MATCH, ROLLBACK_REPLACEMENT_ALONE, ROLLBACK_VOLUME,
} from '@/utils/display-rule-engine.js'

const ROOT = path.resolve(__dirname, '../../..')
const OUT = path.join(ROOT, 'contract', 'sandbox-contract.json')

function fakeHost(): SdkHost {
  const el = document.createElement('div')
  return {
    input: { get: () => '', set() {}, focus() {}, blur() {}, getCursor: () => 0, setCursor() {}, composing: () => false },
    composer: { show() {}, hide() {}, visible: () => true },
    stage: { open() {}, close() {}, el: () => el, visible: () => false },
    role: () => ({ name: 'r', avatarUrl: '' }),
    user: () => ({ nickname: 'u', avatarUrl: '', locale: 'zh-Hant' }),
    text: { convert: (t) => t, ready: () => Promise.resolve() },
    capabilities: { saves: true, edit: true, send: true },
    request: async () => null,
    inGesture: () => false,
    askSendPermission: async () => true,
    busy: () => false,
    debug() {},
  }
}

/** sdk 的能力表：每個鍵底下的函式名，與 sdk.spec 數的同一套。 */
function capabilitiesOf(sdk: Record<string, unknown>): { keys: string[]; capabilities: string[]; async: string[] } {
  const keys = Object.keys(sdk).sort()
  const capabilities: string[] = []
  for (const key of keys) {
    const value = sdk[key]
    if (typeof value === 'function') { capabilities.push(key); continue }
    if (value && typeof value === 'object') {
      for (const name of Object.keys(value as object)) if (typeof (value as Record<string, unknown>)[name] === 'function') capabilities.push(`${key}.${name}`)
      continue
    }
    capabilities.push(key)
  }
  // 非同步的四個：回 Promise；其餘同步、錯誤直接 throw。
  const async = ['message.send', 'message.edit', 'save.set', 'save.remove', 'text.ready', 'archive.list', 'archive.save', 'archive.fork', 'archive.open', 'archive.start', 'archive.rename', 'archive.remove', 'generation.act']
  return { keys, capabilities: capabilities.sort(), async }
}

/** shell.css 裡的 --chat-* 變數名（兩套主題各自定義，名單必須相同）與 z-index。 */
function cssFacts() {
  const css = readFileSync(path.join(ROOT, 'src/sandbox/shell.css'), 'utf8')
  const block = (theme: string) => {
    const m = new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`).exec(css)
    if (!m) throw new Error(`no [data-theme="${theme}"] block in shell.css`)
    return Array.from(m[1].matchAll(/--chat-[a-z0-9-]+/g), (x) => x[0])
  }
  const dark = block('dark')
  const light = block('light')
  const uniq = (list: string[]) => Array.from(new Set(list))
  const names = uniq(dark)
  if (JSON.stringify(uniq(light)) !== JSON.stringify(names)) throw new Error('dark and light define different --chat-* sets')
  const aliases = names.filter((n) => new RegExp(`${n}:\\s*var\\(--chat-`).test(css))
  const z = (sel: string) => { const m = new RegExp(`${sel.replace(/[[\]"=]/g, (c) => '\\' + c)}[^{]*\\{[^}]*z-index:\\s*(\\d+)`).exec(css); return m ? Number(m[1]) : null }
  return {
    themes: ['dark', 'light'],
    chatVars: names,
    chatVarAliases: aliases,
    chatVarsInline: ['--chat-viewport-height'],
    rpx: { base: 'calc(100vw / 750)', desktopMinWidth: 961, desktop: 'calc(375px / 750)' },
    layer: 'lt-base',
    zIndex: { platformNodes: 'auto', stageContent: z('[data-stage="content"]'), stageFull: z('[data-stage="full"]'), shellAlert: z('[data-chat="alert"]'), authorBand: [3500, 7999] },
  }
}

/** 殼骨架：所有 data-chat 與 data-slot 的值。 */
function nodeFacts() {
  document.body.innerHTML = '<div id="app"></div>'
  const refs = buildShell(document, document.getElementById('app')!, {
    theme: 'dark', strings: shellStrings('zh-Hant'), roleName: 'r', roleAvatar: '', hasStatusbar: true, composerVisible: true,
  })
  const chat = Array.from(document.querySelectorAll('[data-chat]'), (el) => el.getAttribute('data-chat')!)
  const slots = Array.from(document.querySelectorAll('[data-slot]'), (el) => el.getAttribute('data-slot')!)
  refs.root.remove(); refs.authorCss.remove()
  return {
    dataChat: Array.from(new Set([...chat, 'list', 'message-frame', 'message', 'message-avatar', 'message-body', 'author-script', 'panels', 'sdk-debug'])).sort(),
    dataSlot: Array.from(new Set(slots)).sort(),
    root: { attributes: ['data-theme', 'data-composer', 'data-chrome', 'data-busy'], classes: ['canvas-root', 'chat', 'lt-format-mmd'] },
    message: { attributes: ['data-from', 'data-state', 'data-msg-id'], from: ['ai', 'user', 'system'], state: ['pending', 'streaming', 'done'], body: { generatingAttribute: 'data-generating' } },
    statusbarSlotOnlyWhenFunctionBarNonEmpty: true,
    stage: { attribute: 'data-stage', states: ['closed', 'content', 'full'] },
    chrome: ['standard', 'host', 'shell'],
    legacySelectorsAlsoPresent: ['.mes', '.mes_text', '#msglistview', '#scrollview', '.chat-scope-box', '#chat'],
    prologue: { scope: '.prologue-scope[data-lt="prologue"]', item: '.prologue-content' },
  }
}

/** 規則引擎：用行為探出來的常數，不抄文件。 */
function ruleFacts() {
  const run = (find: string, replace = 'x', text = 'abc') => applyDisplayRules(text, [{ id: 'r', find, replace }], { pickRandom: (o: string[]) => o[0] }).rollbacks.map((r) => r.reason)
  expect(run('/(/')).toEqual([ROLLBACK_BAD_REGEX])
  expect(run('/a*/')).toEqual([ROLLBACK_EMPTY_MATCH])
  expect(run('b', 'y'.repeat(DISPLAY_RULE_MIN_BUDGET + 1))).toEqual([ROLLBACK_REPLACEMENT_ALONE])
  expect(run('/b/g', 'y'.repeat(DISPLAY_RULE_MIN_BUDGET - 10), 'b'.repeat(3))).toEqual([ROLLBACK_VOLUME])
  const fields = applyDisplayRules('[s]hp::85;;mood::shy[/s]', [{ id: 'f', find: '/\\[s\\]([\\s\\S]*?)\\[\\/s\\]/', replace: '<b>$hp|$mood|$1</b>' }], {}).html
  expect(fields).toBe('<b>85|shy|hp::85;;mood::shy</b>')
  const random = applyDisplayRules('x', [{ id: 'q', find: 'x', replace: '{{random:a::b}}' }], { pickRandom: (o: string[]) => o[1] }).html
  expect(random).toBe('b')
  return {
    findForms: ['literal (all occurrences)', '/pattern/flags'],
    flags: 'gimsuy',
    gAlwaysAdded: true,
    replaceTokens: { captures: '$1…$99 (missing group stays literal)', fieldTable: '$name reads capture 1 shaped key::value;;key::value', random: '{{random:a::b}}', macros: ['{{user}}', '{{char}}'] },
    fieldTable: { pairSeparator: '::', entrySeparator: ';;', requiresBoth: true },
    budget: { min: DISPLAY_RULE_MIN_BUDGET, inputMultiplier: 4 },
    rollbackReasons: [ROLLBACK_BAD_REGEX, ROLLBACK_EMPTY_MATCH, ROLLBACK_REPLACEMENT_ALONE, ROLLBACK_VOLUME, 'timeout'],
    timeoutOnlyOnProvider: true,
    relativeMediaSrcNeutralisedTo: 'data:,',
    chineseVariantClasses: true,
    userMessagesAlsoPassThroughRules: true,
    streaming: 'rules run on the streamed text too; a half-open trailing tag is hidden until the result settles',
  }
}

function sanitizerFacts() {
  return {
    shellPath: {
      appliesWhen: 'the shell renders a body itself (no host-provided view: standalone shell, function bar, previews)',
      allowedTags: Array.from(ALLOWED_TAGS).sort(),
      unwrapTags: Array.from(UNWRAP_TAGS).sort(),
      dropTags: Array.from(DROP_TAGS).sort(),
      unknownTagsStrippedKeepText: true,
      cjkAngleTagsStripped: true,
      backtickRegionsProtected: true,
      removedAttributes: ['data-*', 'aria-*', 'role'],
      inlineHandlersKeptOnHtml: true,
      inlineHandlersRemovedInsideSvg: true,
      urlAttributes: URL_ATTRS,
      blockedUrlSchemes: ['javascript:', 'vbscript:', 'data:text/html'],
      unsafeAttributeValueDropsWholeAttribute: ['--!?>', ']>', '</style', '</script', '</title', '</xmp', '</textarea', '</noscript', '</iframe', '</noembed', '</noframes'],
    },
    hostPath: {
      source: 'hand-maintained from src/utils/rich-text-renderer.js and canvas-platform-defaults.ts; not derived by this spec',
      appliesWhen: 'the host computes message HTML with the ordinary card pipeline and sends it as view.html (the normal play page)',
      standardHtmlTagsKept: Array.from(STANDARD_HTML_TAGS).sort(),
      hyphenatedCustomElementsKept: true,
      nonStandardTagsStrippedKeepText: true,
      // No attribute stripping was found in the host pipeline's source, but an author observed
      // data-* removed on the play page. Not asserted either way: write cards as if stripped.
      dataAttributesStripped: null,
      dataAttributesNote: 'not established from source; observed stripped on the play page; treat author data-* as stripped on every path',
      dialogueQuotesWrapped: '<font color="#DC8333">',
    },
    order: ['macros', 'display rules', 'strip unknown tags', 'markdown (html:true, breaks:true, indented code off)', 'sanitize', 'dialogue quotes', 'chinese script conversion of text nodes'],
  }
}

/** 殼的 CSP，從 src/sandbox/index.html 的 meta 讀（正式站的回應標頭跟它同一份）。 */
function shellCsp() {
  const html = readFileSync(path.join(ROOT, 'src/sandbox/index.html'), 'utf8')
  const csp = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)![1]
  const get = (name: string) => (csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + ' ')) ?? '').slice(name.length + 1)
  return { connectSrc: get('connect-src'), frameSrc: get('frame-src'), scriptSrc: get('script-src'), styleSrc: get('style-src'), imgSrc: get('img-src'), fontSrc: get('font-src'), formAction: get('form-action'), baseUri: get('base-uri') }
}

function scriptFacts() {
  return {
    source: 'hand-maintained from src/sandbox/author-scripts.ts, rules.ts, shell.ts and index.html; the sdk.spec and shell.spec cover the testable parts',
    extractedAtInstall: 'every <style> and <script> in every enabled rule, matched or not; fenced code blocks protected',
    runsOncePerCard: true,
    runsBeforeDom: true,
    runsAfterFunctionBarMounted: true,
    inlineScriptsRunAsScriptElements: 'top-level declarations become globals; a SyntaxError (top-level return) is retried wrapped in a function',
    externalScripts: { httpsOnly: true, orderedNotAwaited: true, dedupedByUrl: true, typeModuleKept: true, nomoduleSkipped: true },
    messageBodyScripts: 'run once per distinct code string after the message is done; code already run at install does not run again',
    moduleScripts: 'type="module" is kept for src and inline scripts: they run as ES modules (import, import()) after every inline classic script; external module scripts keep rule order with the other external scripts, inline module scripts run once their imports load; a nomodule script does not run',
    documentCurrentScript: 'the running <script> element for an inline classic rule script (they run as real script elements); null in module scripts and in the wrapped-function fallback',
    previewRerunsScripts: 'the card editor preview re-runs scripts on every edit: boot must be idempotent',
    gestureRequired: ['message.send outside a trusted click asks the player', 'message.edit outside a trusted click asks the player', 'send/continue/assist/favorite/rewrite/system-card buttons ignore synthetic clicks'],
    csp: shellCsp(),
    assetsLibrary: { origin: 'https://assets.harperharbor.com', fetch: 'connect-src: fetch JSON, WASM (WebAssembly.instantiateStreaming) and other files', scripts: 'script-src https:: <script src>, <script type="module" src>, import()' },
    links: 'http(s) links in author HTML are intercepted and opened by the host in a new tab',
    localStorage: 'available, scoped to the card subdomain; author rule output is cached in IndexedDB keyed by storageScope',
  }
}

function buildContract() {
  const { sdk } = createSdk(fakeHost(), createEventBus())
  const caps = capabilitiesOf(sdk as unknown as Record<string, unknown>)
  const mmd = stylePolicyFor('mmd')
  const tavern = stylePolicyFor('tavern')
  return {
    name: 'hearthroom-sandbox-contract',
    protocolVersion: SANDBOX_PROTOCOL_VERSION,
    sdkVersion: sdk.version,
    generatedBy: 'src/sandbox/__tests__/contract.spec.ts (UPDATE_CONTRACT=1)',
    sources: ['src/sandbox/sdk/create-sdk.ts', 'src/sandbox/sdk/events.ts', 'src/sandbox/sdk/errors.ts', 'src/sandbox/sanitize.ts', 'src/sandbox/render/shell-dom.ts', 'src/sandbox/shell.css', 'src/sandbox/shell.ts', 'src/sandbox/author-scripts.ts', 'src/sandbox/rules.ts', 'src/utils/display-rule-engine.js', 'src/common/author-style-policy.ts', 'src/pages/canvas/canvas-platform-defaults.ts', 'docs/sandbox-chat-page.md'],
    sdk: {
      keys: caps.keys,
      capabilities: caps.capabilities,
      async: caps.async,
      notProvided: ['sdk.off', 'sdk.once', 'sdk.vars', 'vars:change', '<abc_vars>'],
      role: { get: ['name', 'avatarUrl'] },
      user: { get: ['nickname', 'avatarUrl', 'locale'] },
      model: { get: ['name', 'cost'] },
      generation: {
        get: ['phase', 'since', 'outcome'],
        phases: ['idle', 'preparing', 'summarizing', 'thinking', 'writing'],
        outcome: ['kind', 'label', 'sub', 'actions'],
        outcomeKinds: ['model-error', 'network-error', 'server-error', 'rate-limit', 'quota', 'filtered', 'length-cap', 'stopped', 'compact-retryable', 'outcome-unconfirmed', 'interrupted'],
        actions: ['retry', 'continue', 'switch-model', 'model-settings', 'capacity', 'refresh'],
        outcomeIsNullWhile: 'a reply is being generated, or the last turn ended normally',
        labelsAre: 'the same player-language text as the platform card under that row',
        act: { gestureOnly: 'UNAUTHORIZED outside a trusted click (no dialog)', unknownAction: 'INVALID_ARGS', whileGenerating: 'BUSY', withoutSend: 'NOT_SUPPORTED', rateLimit: 'generation.act 3/min' },
      },
      archive: { item: ['id', 'title', 'isCurrent', 'messageCount', 'lastMessage', 'createTime', 'lastUpdateTime'], list: ['items', 'count', 'limit'], limitError: { code: 'LIMIT_REACHED', data: ['count', 'limit'] }, gesture: 'save/fork/open/start/rename/remove run directly inside a user gesture; outside one the shell asks first', rateLimit: 'archive.write 10/min' },
      stage: { modes: ['content', 'full'], unknownModeBecomes: 'content', elReturnsNodeWhenClosed: true, ownCloseDoesNotEmitStageClose: true },
      input: { writesThrowWhileComposing: 'INVALID_ARGS' },
      message: { sendBusy: 'BUSY', sendWithoutCapability: 'NOT_SUPPORTED', editWithoutCapability: 'HOST_DENIED', confirmOutsideGesture: true, declinedCode: 'UNAUTHORIZED', editIdIs: 'serverId (data-msg-id)' },
    },
    save: { keyPattern: SAVE_KEY_RE.source, maxKeys: SAVE_MAX_KEYS, maxValueBytes: SAVE_MAX_VALUE_BYTES, valueMeasuredAs: 'UTF-8 bytes of JSON.stringify(value)', syncReadBeforeLoad: 'HOST_DENIED', crossDevice: true },
    cache: { quotaBytes: CACHE_QUOTA_BYTES, overQuota: 'INVALID_ARGS', lifetime: 'page load' },
    rateLimits: Object.fromEntries(Object.entries(RATE_LIMITS).map(([k, v]) => [k, { count: v.count, windowMs: v.windowMs }])),
    errorCodes: [...SDK_ERROR_CODES],
    events: {
      names: [...SDK_EVENTS],
      replayedToLateSubscribers: ['message:mount', 'message:done'],
      readyReplayed: false,
      coldStartOrder: ['message:new', 'message:mount', 'message:done', '…', 'ready'],
      payload: { 'message:new': ['content', 'id', 'role', 'serverId'], 'message:mount': ['content', 'id', 'role', 'serverId'], 'message:done': ['content', 'id', 'role', 'serverId'], 'message:stream': ['content', 'id', 'role'], 'message:unmount': ['content', 'id', 'role', 'serverId'], 'input:change': 'string', 'theme:change': 'none', 'model:change': ['cost', 'name'], 'generation:phase': ['phase', 'since'], 'generation:outcome': ['actions', 'kind', 'label', 'sub'], 'conversation:switch': ['conversationId'], others: 'none' },
      roles: ['user', 'ai'],
      systemRowsEmitNoEvents: true,
      handlerArity: 1,
      unknownEventNeverFires: true,
      handlerErrorsIsolated: true,
      doneOncePerMessage: true,
      virtualisation: 'bubbles about two screen heights away are destroyed (message:unmount) and rebuilt (message:mount again); done is not repeated; streaming and the last two stay mounted',
      querySelectorScope: 'inside a handler and inside user-event handlers, document.querySelector* and getElementById search the current bubble first and never other bubbles; outside handlers the whole document (Element.querySelector is not patched)',
      idStability: 'id is a host-local id (l1, l2…) that changes across reloads; serverId is null for user messages and the greeting; persist on serverId or on content',
    },
    nodes: nodeFacts(),
    nativeBlocks: {
      source: 'src/common/native-blocks.ts (drawNativeBlocks); applied in src/sandbox/rules.ts and src/pages/canvas/canvas.vue',
      blocks: ['[status]…[/status]', '[choices]…[/choices]'],
      closerOptional: true,
      stopsBeforeTheOtherBlock: true,
      appliesWhen: 'the card\'s own display rules left the marker in an AI reply (a rule that consumes it wins); never for player lines',
      stage: 'after display rules, before Markdown and the sanitizer, on both render paths (shell and host)',
      statusLine: 'one key: value per line, ;; also separates; full-width punctuation normalised; a line without a colon is kept as text',
      valueLadder: ['number', 'n% or a/b → bar', 'name|a/b → level', 'k:v|k:v → list', 'k:v k:v → stats', 'name=number,… → entity chips', 'a, b → tags', 'a > b → path', 'text'],
      drawnClasses: ['lt-status', 'lt-status__row', 'lt-status__k', 'lt-status__v', 'lt-bar', 'lt-bar__fill', 'lt-chips', 'lt-chip', 'lt-kvlist', 'lt-stats', 'lt-path', 'lt-level', 'lt-choices', 'lt-choice', 'lt-choice--own'],
      choices: 'drawn as buttons (at most 8) plus a ✎ button; a tap puts the option into the composer and focuses it, never sends',
      css: 'canvas.css inside @layer lt-base, --chat-* variables only; an unlayered author stylesheet overrides it',
    },
    functionBar: {
      source: 'hand-maintained from src/sandbox/shell.ts (statusbar branch) and rules.ts',
      field: 'mountTrigger',
      renderedOnceAtLoad: true,
      rulesRunOver: 'the function bar text itself, never a reply',
      scriptsInsideDropped: 'two paths: when the shell renders the bar itself (previews, offline harness) a <script> in the bar text is dropped by the sanitizer; when the play page host renders it (statusbarHtml) its scripts run once after mount; <img onerror> boots run on both; scripts belong in a rule',
      imgOnerrorBootRuns: true,
      slotExistsOnlyWhenNonEmpty: true,
      dynamicContentNeedsScript: true,
    },
    css: cssFacts(),
    cardFormat: {
      default: 'mmd',
      mmd: { styleScope: mmd.scope, theme: mmd.theme, fencedDocument: mmd.fencedDocument, note: 'locked to dark: theme:change never fires for this format' },
      tavern: { styleScope: tavern.scope, theme: tavern.theme, fencedDocument: tavern.fencedDocument, note: `<style> selectors are prefixed with "${MESSAGE_SCOPE} "` },
    },
    rules: ruleFacts(),
    sanitizer: sanitizerFacts(),
    scripts: scriptFacts(),
    provider: {
      source: 'hand-maintained from HarperHarbor/server provider/internal/service/role/author_asset.go and display/scan.go',
      replaceMaxBytes: 128 * 1024,
      totalMaxBytes: 32 * 1024 * 1024,
      bytesAre: 'UTF-8 (find + replace + name per rule)',
      findMustNotBeBlank: true,
      maxRuleCount: null,
      mountLayer: ['under', 'over', 'cover'],
      pageMode: ['classic', 'immersive', 'sandbox'],
      pageModeDefaultWhenEmpty: 'classic',
      cardFormat: ['', 'mmd', 'tavern'],
      render: { endpoint: 'GET /open/v1/role/render', executesScripts: false, runsSanitizer: false, runsMarkdown: false, ruleStatuses: ['applied', 'unmatched', 'disabled', 'empty', 'rolled_back'], unsupportedScan: { classicOnly: ['sdk.save', 'sdk.cache', 'sdk.stage', 'sdk.message', 'sdk.input', 'sdk.composer', 'sdk.role', 'sdk.user', 'sdk.on(', 'sdk.debug', '[data-chat', '[data-slot', '--chat-'], everywhere: ['sdk.vars', '<abc_vars'] } },
    },
    import: { source: 'hand-maintained from hearthroom/cli internal/importer/mmd.go', mmdSixKey: { keys: ['chatVersion', 'pageDepth', 'statusbar', 'beginning', 'personality', 'regex_scripts'], chatVersion1: 'pageMode: sandbox', pageDepth: { '1|0|under|below': 'mountLayer under', '2|missing': 'mountLayer over' }, statusbar: 'mountTrigger', beginning: 'welcome.md', personality: 'not read by the CLI importer (persona comes from the separate TXT)', droppedRegexFields: ['trimStrings', 'markdownOnly', 'promptOnly', 'runOnEdit', 'substituteRegex', 'minDepth', 'maxDepth', 'id'] } },
  }
}

describe('沙箱作者契約', () => {
  it('contract/sandbox-contract.json 跟執行期一致（改了契約就 UPDATE_CONTRACT=1 重生）', () => {
    const built = buildContract()
    const text = JSON.stringify(built, null, 2) + '\n'
    if (process.env.UPDATE_CONTRACT) {
      mkdirSync(path.dirname(OUT), { recursive: true })
      writeFileSync(OUT, text)
    }
    let current = ''
    try { current = readFileSync(OUT, 'utf8') } catch { /* 第一次 */ }
    expect(current).toBe(text)
  })

  it('能力數與 sdk.spec 對得上：15 鍵、42 能力、13 個非同步', () => {
    const { sdk } = createSdk(fakeHost(), createEventBus())
    const caps = capabilitiesOf(sdk as unknown as Record<string, unknown>)
    expect(caps.keys.length).toBe(15)
    expect(caps.capabilities.length).toBe(42)
    for (const a of caps.async) expect(caps.capabilities).toContain(a)
  })

  it('--chat-* 恰好 29 個，深淺兩套同名', () => {
    expect(cssFacts().chatVars.length).toBe(29)
  })
})
