/**
 * 開場：conversation/start 帶回的第一頁直接用，不再等一趟 messages。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { usableFirstPage } from '../canvas-first-page'

const CONV = '01a0d462-2dc1-7a38-bc70-52546d2ba4c3'
const page = (conversationId = CONV) => ({ total: 2, chats: [{ id: 2, conversationId }, { id: 1, conversationId }] })

describe('usableFirstPage', () => {
  it('用在同一個對話的第一頁', () => {
    expect(usableFirstPage(page(), 1, CONV)).toBe(true)
    expect(usableFirstPage({ total: 0, chats: [] }, 1, CONV)).toBe(true)
  })
  it('翻到別頁、對話換了、形狀不對或沒有，就照常自己去問', () => {
    expect(usableFirstPage(page(), 2, CONV)).toBe(false)
    expect(usableFirstPage(page('another'), 1, CONV)).toBe(false)
    expect(usableFirstPage({ total: 2 }, 1, CONV)).toBe(false)
    expect(usableFirstPage(undefined, 1, CONV)).toBe(false)
    expect(usableFirstPage({ chats: [{ id: 1, conversationId: CONV }, { id: 2 }] }, 1, CONV)).toBe(false)
  })
})

describe('canvas 開場', () => {
  const src = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
  const start = src.slice(src.indexOf('function chatStart('), src.indexOf('function appendChatErrorBubble('))
  it('開始對話時要第一頁，並把帶回來的第一頁交給歷史載入', () => {
    expect(start).toContain('firstPageSize: ajax.value.rows')
    expect(start).toContain('getHistoryMsg(res.data.firstPage)')
  })
  it('歷史的開關與頁碼改的是 ref 的值', () => {
    expect(start).not.toMatch(/ajax\.(flag|page)\s*=/)
  })
})
