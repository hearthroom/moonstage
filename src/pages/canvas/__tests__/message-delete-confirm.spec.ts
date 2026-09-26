import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

// 刪提問時伺服器會連它的回覆一起刪；確認框要在按下去之前講清楚，五種語言都要有。
describe('message delete confirmation', () => {
  const source = fs.readFileSync('src/pages/canvas/canvas.vue', 'utf8')
  it('warns that deleting a question also deletes its reply', () => {
    expect(source).toContain("content: item.type == 1 ? t('chat.deleteQuestionBody') : t('chat.deleteMessageBody'),")
    expect(source).toContain("title: t('chat.deleteMessageTitle'),")
    expect(source).not.toContain('chat.delete_chat_tips')
  })
  it.each(['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko'])('has the copy in %s', (locale) => {
    const messages = JSON.parse(fs.readFileSync(`src/locale/${locale}.json`, 'utf8'))
    for (const key of ['chat.deleteMessageTitle', 'chat.deleteMessageBody', 'chat.deleteQuestionBody']) {
      expect(String(messages[key] || '').trim()).not.toBe('')
    }
  })
})
