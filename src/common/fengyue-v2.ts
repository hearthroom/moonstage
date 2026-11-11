/** 新匯入專用；舊 fengyue 提示仍只轉作者 CSS，不補原站基底。 */
import { splitCssImports, translateFengyueCss } from './fengyue-css'

// 原站 has-css=true 的 bg-secondary、text-gray-900、bg-background 與 text-sm。
// Markdown 的 1.5 與容器／作者的 line-height 分開；深色正文白字由作者 CSS 決定。
const BASE = `@layer lt-fengyue-base {
.canvas-root {
  --lt-fy-column-width:720px;
  --lt-fy-chat-gutter:16px;
  --lt-fy-bubble-bg:hsl(240 6% 97%);
  --lt-fy-input-bg:hsl(0 0% 99%);
  --lt-fy-input-fg:hsl(210 2% 16%);
  --lt-fy-border:rgb(242 242 242);
}
.canvas-root[data-lt-theme="dark"] {
  --lt-fy-bubble-bg:hsl(210 2% 20%);
  --lt-fy-input-bg:hsl(210 2% 16%);
  --lt-fy-input-fg:hsl(0 0% 99%);
  --lt-fy-border:rgb(66 67 67);
}
.canvas-root .mes[data-lt-role="ai"] .mes_text,
.canvas-root .mes[data-lt-role="user"] .mes_text {
  position:relative; display:inline-block; width:100%; box-sizing:border-box;
  background:var(--lt-fy-bubble-bg); color:rgb(17 25 40);
  font-size:14px; line-height:20px; padding:12px 16px;
  border:0 solid var(--lt-fy-border);
}
.canvas-root .lt-bubble-body { font-size:14px; line-height:1.5; background:transparent; }
.canvas-root #chat { width:100%; max-width:720px; margin-inline:auto; }
.canvas-root .mes[data-lt-role="ai"] .mes_turn { align-self:stretch; width:100%; max-width:100%; }
.canvas-root .composer-field {
  background:var(--lt-fy-input-bg); color:var(--lt-fy-input-fg);
  font-size:14px; line-height:20px; border-color:var(--lt-fy-border);
}
.canvas-root .composer-field .uni-textarea-textarea {
  color:var(--lt-fy-input-fg); -webkit-text-fill-color:currentColor; font-size:14px; line-height:20px;
}
.canvas-root .shortcut-btn { background:var(--lt-fy-input-bg); color:var(--lt-fy-input-fg); }
.canvas-root .shortcut-bar { border-color:var(--lt-fy-border); }
/* 原站 thinking-line 是獨立裝飾，不是作者的 border-top；不重建其圖片／音訊動作列。 */
.canvas-root .mes[data-lt-role="ai"] .mes_text::before {
  content:""; position:absolute; top:0; left:3%; width:94%; height:.125rem;
  background:#F1CBCB; border-radius:12px; pointer-events:none;
}
/* 受管外觀明確設定時仍蓋過基底；不把宿主的預設 inline 色誤當作者選色。 */
.canvas-root[data-lt-card-vars~="--lt-canvas-bubble-ai-bg"] .mes[data-lt-role="ai"] .mes_text { background:var(--lt-canvas-bubble-ai-bg); }
.canvas-root[data-lt-card-vars~="--lt-canvas-bubble-user-bg"] .mes[data-lt-role="user"] .mes_text { background:var(--lt-canvas-bubble-user-bg); }
.canvas-root[data-lt-card-vars~="--lt-canvas-bubble-fg"] .mes_text { color:var(--lt-canvas-bubble-fg); }
.canvas-root[data-lt-card-vars~="--lt-canvas-composer-field-bg"] .composer-field { background:var(--lt-canvas-composer-field-bg); }
.canvas-root[data-lt-card-vars~="--lt-canvas-font"] .mes_text,
.canvas-root[data-lt-card-vars~="--lt-canvas-font"] .composer-field,
.canvas-root[data-lt-card-vars~="--lt-canvas-font"] .uni-textarea-textarea { font-family:var(--lt-canvas-font); }
}`

export function compileFengyueV2Css(css: string): string {
  const translated = translateFengyueCss(css, { readableFallback: false })
  const { imports, body } = splitCssImports(translated)
  // import 必須在 layer block 前，否則原文中的字型／樣式匯入會失效。
  // 只有新 profile 輸出欄寬補償。與平台原本未分層的 selector 等權重，
  // 不改共享殼規則；之後的普通顯示規則仍可覆蓋同一組屬性。
  const column = `
.canvas-root #chat, .canvas-root .header-box { max-width:var(--lt-fy-column-width); }
.canvas-root #chat {
  padding-left:max(var(--lt-fy-chat-gutter), var(--lt-canvas-dock-left, 0px));
  padding-right:max(var(--lt-fy-chat-gutter), var(--lt-canvas-dock-right, 0px));
}
.canvas-root .chat-bottom-wapper, .canvas-root .shortcut-bar-wrapper {
  padding-inline:calc((100% - min(100%, var(--lt-fy-column-width))) / 2);
}`
  return `@layer lt-base, lt-fengyue-base, lt-card-css, lt-author-fengyue;\n${imports.map(entry => entry + ';').join('\n')}\n${BASE}\n${column}\n${body}`
}
