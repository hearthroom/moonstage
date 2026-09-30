/**
 * sandbox-zh.js 的進入點：只做一件事——把顯示字形轉換器掛到 window 上，給殼來取。
 * 字典很大，所以不跟 sandbox.js 綁在一起；殼看玩家的介面語言需要轉時才用 <script> 載這個檔。
 */
import { createDisplayScriptConverter } from '@/pages/canvas/canvas-display-script'

;(window as unknown as { __msDisplayScript?: unknown }).__msDisplayScript = { create: createDisplayScriptConverter }
