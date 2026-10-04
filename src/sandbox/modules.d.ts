/** markdown-it 沒有型別宣告（跟 canvas-js-modules.d.ts 同一個理由：讓「缺宣告」不再每次重報）。 */
declare module 'markdown-it'
/** 系統訊息卡（JS 寫的選項式元件，不在型別檢查的範圍裡）：殼只把算好的屬性交給它。 */
declare module '@/components/chat-system-message/chat-system-message.vue'
