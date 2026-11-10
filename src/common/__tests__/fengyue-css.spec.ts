/**
 * 風月寫法的 CSS → 我們的畫布。用例是照風月官方主題的寫法自己寫的樣本（不放風月原文）。
 */
import { describe, it, expect } from 'vitest'
import { translateFengyueCss, translateSelector, FENGYUE_LAYER } from '../fengyue-css'

const ROOT = ':where(.canvas-root):not(#lt-fy)'
const like = (s: string) => `:where(${s}):not(#lt-fy)`

describe('選擇器：照風月的作用範圍', () => {
  it('body／html／:root 在風月接上容器前綴後永遠不生效：丟掉', () => {
    for (const sel of ['body', 'html', ':root', 'body .x', 'html body', ':root .y']) expect(translateSelector(sel)).toBeNull()
  })

  it('一般選擇器與 * 接在畫布根底下', () => {
    expect(translateSelector('.st-bar')?.selector).toBe(`${ROOT} .st-bar`)
    expect(translateSelector('*')?.selector).toBe(`${ROOT} *`)
  })

  it('.dark 分支對到兩頁共用的深淺標記；黏在容器上的寫法留在根上', () => {
    expect(translateSelector('.dark')?.selector).toBe(`${ROOT}[data-lt-theme="dark"]`)
    expect(translateSelector('.dark .st-bar')?.selector).toBe(`${ROOT}[data-lt-theme="dark"] .st-bar`)
    expect(translateSelector('.dark:hover')?.selector).toBe(`${ROOT}[data-lt-theme="dark"]:hover`)
    expect(translateSelector('html.dark .st-bar')?.selector).toBe(`${ROOT}[data-lt-theme="dark"] .st-bar`)
    expect(translateSelector('html.dark')?.selector).toBe(`${ROOT}[data-lt-theme="dark"]`)
  })

  it('.darker 不是 .dark', () => {
    expect(translateSelector('.darker')?.selector).toBe(`${ROOT} .darker`)
  })
})

describe('選擇器：風月元素 id → 我們的節點', () => {
  it('氣泡、正文、輸入框照搬所有宣告', () => {
    expect(translateSelector('#customized-answer-content')).toEqual({ selector: `${ROOT} ${like('.mes[data-lt-role="ai"] .mes_text')}`, tier: 'full' })
    expect(translateSelector('#customized-question-content-markdown p')?.selector).toBe(`${ROOT} ${like('.mes[data-lt-role="user"] .lt-bubble-body')} p`)
    expect(translateSelector('#ai-chat-input')).toEqual({ selector: `${ROOT} ${like('.composer-field')}`, tier: 'full' })
  })

  it('按鈕類只上色', () => {
    expect(translateSelector('#ai-send-button')?.tier).toBe('paint')
    expect(translateSelector('#customized-shortcut-command-button-3')?.selector).toBe(`${ROOT} ${like('.shortcut-btn')}`)
  })

  it('提示字與 :focus：我們的提示字是一個 div，焦點落在外框', () => {
    expect(translateSelector('#ai-chat-input::placeholder')?.selector).toBe(`${ROOT} ${like('.composer-field')} .uni-textarea-placeholder`)
    expect(translateSelector('#ai-chat-input:focus')?.selector).toBe(`${ROOT} ${like('.composer-field')}:focus-within`)
  })

  it('我們沒有的風月介面（退點、沉浸圖、調試…）整條丟掉', () => {
    for (const sel of ['#customized-truncate-refund-button', '#customized-prompt-debug-button:hover', '.dark #customized-immersive-image-button svg', '#header-setting-button', '#customized-message-answer-actions']) {
      expect(translateSelector(sel)).toBeNull()
    }
  })

  it('作者內容自己的 id 不動', () => {
    expect(translateSelector('#my-status .row')?.selector).toBe(`${ROOT} #my-status .row`)
  })

  it('作者寫了容器 id：換成根，不再接一次', () => {
    expect(translateSelector('#installedBuiltInCss .st-bar')?.selector).toBe(`${ROOT} .st-bar`)
  })
})

describe('整段轉譯', () => {
  it('包進自己的層、去掉 !important、按鈕類丟掉位置與尺寸', () => {
    const out = translateFengyueCss(`
      #ai-send-button { position: relative; top: -4px; width: 32px; height: 32px; background: #4A90E2 !important; color: #fff; border-radius: 12px; }
      #customized-answer-content { padding: 18px 14px; background: linear-gradient(160deg, #F0F7FF 0%, #E3F1FE 100%); color: #2C4A6B !important; }
    `)
    expect(out.startsWith(`@layer ${FENGYUE_LAYER} {`)).toBe(true)
    expect(out).not.toMatch(/!\s*important/)
    const send = out.slice(out.indexOf('.lt-send'), out.indexOf('}', out.indexOf('.lt-send')))
    expect(send).toContain('background: #4A90E2')
    expect(send).toContain('border-radius: 12px')
    for (const prop of ['position', 'top:', 'width', 'height']) expect(send).not.toContain(prop)
    // 氣泡照搬，padding 留著
    expect(out).toContain('padding: 18px 14px')
  })

  it('死規則與沒對應的介面不留空殼；全部丟光就是空字串', () => {
    expect(translateFengyueCss('body{background:red} #customized-flow-button{color:red}')).toBe('')
  })

  it('@media 裡照樣轉；@keyframes／@font-face 原樣；@import 拿到層外最前面', () => {
    const out = translateFengyueCss(`@import url("https://fonts.example/a.css");
      @media (max-width: 600px) { #ai-chat-input { font-size: 16px } body { margin: 0 } }
      @keyframes glow { from { opacity: .4 } to { opacity: 1 } }
      @font-face { font-family: X; src: url(x.woff2) }
      .st-bar { animation: glow 1s }`)
    expect(out.startsWith('@import url("https://fonts.example/a.css");\n@layer')).toBe(true)
    expect(out).toContain(`@media (max-width: 600px) {\n${ROOT} ${like('.composer-field')} { font-size: 16px; }`)
    expect(out).not.toContain('margin: 0')
    expect(out).toContain('@keyframes glow { from { opacity: .4 } to { opacity: 1 } }')
    expect(out).toContain('@font-face { font-family: X; src: url(x.woff2) }')
  })

  it('選擇器清單裡的逗號、屬性選擇器與字串不會切錯', () => {
    const out = translateFengyueCss(`.a[data-x="1,2"], #customized-answer-content { content: "a;b" }`)
    expect(out).toContain(`${ROOT} .a[data-x="1,2"],\n${ROOT} ${like('.mes[data-lt-role="ai"] .mes_text')}`)
    expect(out).toContain('content: "a;b"')
  })

  it('註解不打斷掃描', () => {
    const out = translateFengyueCss('/* 頂部 */ .x { /* 內 */ color: red } /* 尾 */')
    expect(out).toContain(`${ROOT} .x { color: red; }`)
  })
})
