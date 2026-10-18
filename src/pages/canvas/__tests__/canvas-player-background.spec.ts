/**
 * 玩家自選背景的解析（任務書 2026-10-18-player-background）。
 * 重點：玩家選了模糊／純色／自訂後，卡片的任何圖都不能直接畫出來；選卡片原圖時跟以前一模一樣。
 */
import { describe, it, expect } from 'vitest'
import {
  BACKGROUND_COLORS, INK, backgroundChoiceFrom, isLightBackground, backgroundPrefsPatch, cssUrl,
  readLocalChoice, resolvePlayerBackground, writeLocalChoice,
} from '../canvas-player-background'

const ROLE = { roleBackground: 'https://cdn/bg.jpg', roleAvatar: 'https://cdn/avatar.jpg', roleBackgroundLandscape: 'https://cdn/bg-l.jpg' }
const AVATAR_ONLY = { roleBackground: '', roleAvatar: 'https://cdn/avatar.jpg' }

describe('backgroundChoiceFrom：舊資料對應', () => {
  it('沒有任何偏好＝卡片原圖', () => {
    expect(backgroundChoiceFrom({}).mode).toBe('card')
    expect(backgroundChoiceFrom(null).mode).toBe('card')
  })

  it('舊的「重置背景圖」（backgroundOff）＝純色墨色', () => {
    expect(backgroundChoiceFrom({ backgroundOff: true, backgroundUrl: '' })).toEqual({ mode: 'color', color: INK, customUrl: '' })
  })

  it('舊的「使用角色背景」（只存了 backgroundUrl）＝卡片原圖', () => {
    expect(backgroundChoiceFrom({ backgroundUrl: 'https://cdn/bg.jpg', backgroundOff: false }).mode).toBe('card')
  })

  it('新鍵優先於舊的 backgroundOff', () => {
    expect(backgroundChoiceFrom({ backgroundMode: 'blur', backgroundOff: true }).mode).toBe('blur')
  })

  it('色票以外的顏色退回墨色，不拿來直接畫', () => {
    expect(backgroundChoiceFrom({ backgroundMode: 'color', backgroundColor: 'red;background:url(x)' }).color).toBe(INK)
    expect(backgroundChoiceFrom({ backgroundMode: 'color', backgroundColor: '#e8e2d9' }).color).toBe('#E8E2D9')
  })

  it('不認得的 mode 當沒設過', () => {
    expect(backgroundChoiceFrom({ backgroundMode: 'weird' }).mode).toBe('card')
  })
})

describe('backgroundPrefsPatch', () => {
  it('每次選擇都把 backgroundOff 蓋回 false（合併寫入刪不掉鍵）', () => {
    expect(backgroundPrefsPatch({ mode: 'color', color: '#18202E' })).toEqual({ backgroundMode: 'color', backgroundColor: '#18202E', backgroundOff: false })
  })

  it('不碰 backgroundUrl：作者切到的場景要留著', () => {
    expect(backgroundPrefsPatch({ mode: 'card', color: INK })).not.toHaveProperty('backgroundUrl')
  })
})

describe('resolvePlayerBackground', () => {
  it('卡片原圖：跟以前同一串回退（場景 → 卡片背景 → 形象圖）', () => {
    const choice = backgroundChoiceFrom({})
    expect(resolvePlayerBackground({ playerChoice: 'https://cdn/scene.jpg', ...ROLE }, choice))
      .toEqual({ mode: 'card', portrait: 'https://cdn/scene.jpg', landscape: 'https://cdn/scene.jpg', color: '' })
    expect(resolvePlayerBackground({ playerChoice: '', ...ROLE }, choice))
      .toEqual({ mode: 'card', portrait: 'https://cdn/bg.jpg', landscape: 'https://cdn/bg-l.jpg', color: '' })
    expect(resolvePlayerBackground({ playerChoice: '', ...AVATAR_ONLY }, choice).portrait).toBe('https://cdn/avatar.jpg')
  })

  it('模糊：畫同一張圖但標成模糊，場景切換後跟著換', () => {
    const choice = backgroundChoiceFrom({ backgroundMode: 'blur' })
    expect(resolvePlayerBackground({ playerChoice: '', ...ROLE }, choice)).toMatchObject({ mode: 'blur', portrait: 'https://cdn/bg.jpg' })
    expect(resolvePlayerBackground({ playerChoice: 'https://cdn/scene2.jpg', ...ROLE }, choice)).toMatchObject({ mode: 'blur', portrait: 'https://cdn/scene2.jpg' })
    expect(resolvePlayerBackground({ playerChoice: '', ...AVATAR_ONLY }, choice)).toMatchObject({ mode: 'blur', portrait: 'https://cdn/avatar.jpg' })
  })

  it('模糊時底色是墨色：圖糊不到或沒有圖也不會是空白透出別的東西', () => {
    expect(resolvePlayerBackground({ playerChoice: '' }, backgroundChoiceFrom({ backgroundMode: 'blur' })).color).toBe(INK)
  })

  it('純色：卡片的任何圖都不畫，場景切換也不畫', () => {
    const choice = backgroundChoiceFrom({ backgroundMode: 'color', backgroundColor: '#2A1A1F' })
    expect(resolvePlayerBackground({ playerChoice: 'https://cdn/scene.jpg', ...ROLE }, choice))
      .toEqual({ mode: 'color', portrait: '', landscape: '', color: '#2A1A1F' })
  })

  it('舊的關掉背景現在畫墨色', () => {
    expect(resolvePlayerBackground({ playerChoice: '', backgroundOff: true, ...ROLE }, backgroundChoiceFrom({ backgroundOff: true })))
      .toEqual({ mode: 'color', portrait: '', landscape: '', color: INK })
  })

  it('自訂圖片：直橫共用玩家的圖，不看卡片', () => {
    const choice = backgroundChoiceFrom({ backgroundMode: 'custom', backgroundCustomUrl: 'https://cdn/mine.webp' })
    expect(resolvePlayerBackground({ playerChoice: 'https://cdn/scene.jpg', ...ROLE }, choice))
      .toEqual({ mode: 'custom', portrait: 'https://cdn/mine.webp', landscape: 'https://cdn/mine.webp', color: INK })
  })

  it('自訂圖片但網址不見了：退成墨色，不退回原圖', () => {
    expect(resolvePlayerBackground({ playerChoice: '', ...ROLE }, backgroundChoiceFrom({ backgroundMode: 'custom' })))
      .toEqual({ mode: 'color', portrait: '', landscape: '', color: INK })
  })

  it('偏好還沒回來、本機沒紀錄：先不畫圖', () => {
    expect(resolvePlayerBackground({ playerChoice: '', ...ROLE }, null)).toEqual({ mode: 'card', pending: true, portrait: '', landscape: '', color: '' })
  })
})

describe('isLightBackground', () => {
  it('只有淺色色票算淺色底', () => {
    expect(isLightBackground({ mode: 'color', color: '#F2F3F5' })).toBe(true)
    expect(isLightBackground({ mode: 'color', color: '#16191E' })).toBe(false)
    expect(isLightBackground({ mode: 'custom', color: '#F2F3F5' })).toBe(false)
  })
})

describe('本機紀錄', () => {
  const mem = () => {
    const m = new Map<string, string>()
    return { m, s: { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v) }, remove: (k: string) => { m.delete(k) } } }
  }

  it('按卡記完整選擇', () => {
    const { s } = mem()
    writeLocalChoice(s, 'r1', { mode: 'custom', color: INK, customUrl: 'https://cdn/mine.webp' })
    expect(readLocalChoice(s, 'r1')).toEqual({ mode: 'custom', color: INK, customUrl: 'https://cdn/mine.webp' })
    expect(readLocalChoice(s, 'r2')).toBeNull()
  })

  it('改回卡片原圖就清掉紀錄', () => {
    const { s, m } = mem()
    writeLocalChoice(s, 'r1', { mode: 'blur', color: INK, customUrl: '' })
    writeLocalChoice(s, 'r1', { mode: 'card', color: INK, customUrl: '' })
    expect(m.size).toBe(0)
  })

  it('壞掉的紀錄當沒有', () => {
    const { s, m } = mem()
    m.set('lt.playerBackground.r1', '{oops')
    expect(readLocalChoice(s, 'r1')).toBeNull()
  })
})

describe('色票與 cssUrl', () => {
  it('第一個是中性深色，六個', () => {
    expect(BACKGROUND_COLORS[0].value).toBe('#16191E')
    expect(BACKGROUND_COLORS).toHaveLength(6)
  })

  it('網址裡的引號不會截斷宣告', () => {
    expect(cssUrl('https://cdn/a"b.jpg')).toBe('url("https://cdn/a\\"b.jpg")')
  })
})
