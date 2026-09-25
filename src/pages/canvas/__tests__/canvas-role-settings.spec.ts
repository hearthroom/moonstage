/**
 * 遊玩設定的讀與寫。
 *
 * 兩件事這裡守死：讀進來的形狀不再猜（伺服器回的是設定物件本身，不是包一層），
 * 以及寫出去只帶動到的欄位——整包送出會蓋掉玩家在別處存好的值。
 */
import { describe, it, expect } from 'vitest'

import {
  ROLE_SETTING_KEYS,
  ROLE_SETTINGS_DEFAULTS,
  USER_SEX_VALUES,
  SANDBOX_LEVELS,
  readRoleSettings,
  diffRoleSettings,
  buildRoleSettingsSavePayload,
} from '../canvas-role-settings'

describe('讀伺服器的遊玩設定', () => {
  it('直接讀設定物件本身，不去找 prefs 那一層', () => {
    const read = readRoleSettings({
      userName: '小明',
      userSex: 'man',
      userDefine: '一個路過的人',
      selectModel: 'relay-claude-sonnet-4-5-ripple',
      context: 3,
      thinkingDepth: 'high',
      jailbreak: '',
      defaultJailbreak: '系統預設',
      roleSpeech: 'zh-CN-XiaoxiaoNeural',
    })
    expect(read.userName).toBe('小明')
    expect(read.selectModel).toBe('relay-claude-sonnet-4-5-ripple')
    expect(read.context).toBe(3)
    expect(read.thinkingDepth).toBe('high')
  })

  it('沒設過性別時就是沒設過——不替玩家猜一個預設值', () => {
    expect(readRoleSettings({ userSex: '' }).userSex).toBe('')
    expect(ROLE_SETTINGS_DEFAULTS.userSex).toBe('')
  })

  it('性別代號沿用既有存量值', () => {
    expect(USER_SEX_VALUES).toEqual(['man', 'women', 'other'])
  })

  it('虛構框架由弱到強——它是一條強度軸，不是一組並列選項', () => {
    expect(SANDBOX_LEVELS).toEqual(['light', 'standard', 'immersive', 'deep'])
  })

  it('沒設過虛構框架與破限詞就是空的：空字串代表「跟著預設」，不是一個值', () => {
    const read = readRoleSettings({ sandboxLevel: '', jailbreak: '' })
    expect(read.sandboxLevel).toBe('')
    expect(read.jailbreak).toBe('')
  })


  it('舊資料的 context 是 0，換成第一檔——0 沒有對應的檔位可以標亮', () => {
    expect(readRoleSettings({ context: 0 }).context).toBe(1)
    expect(readRoleSettings({}).context).toBe(1)
  })

  it('缺欄位或 null 都讀成空字串，不讓 undefined 流進畫面', () => {
    const read = readRoleSettings({ userName: null })
    expect(read.userName).toBe('')
    expect(read.userDefine).toBe('')
  })
})

describe('只送動到的欄位', () => {
  const snapshot = {
    userName: '小明',
    userSex: 'man',
    userDefine: '一個路過的人',
    selectModel: 'relay-claude-sonnet-4-5-ripple',
    context: 1,
    thinkingDepth: '',
    sandboxLevel: '',
    jailbreak: '',
  }

  it('什麼都沒動就回 null——連請求都不該發', () => {
    expect(diffRoleSettings(snapshot, { ...snapshot })).toBe(null)
    expect(buildRoleSettingsSavePayload('r1', snapshot, { ...snapshot })).toBe(null)
  })

  it('只動一格就只送那一格', () => {
    expect(diffRoleSettings(snapshot, { ...snapshot, context: 3 })).toEqual({ context: 3 })
  })

  it('把自我介紹整段刪掉要真的送一個空字串過去', () => {
    expect(diffRoleSettings(snapshot, { ...snapshot, userDefine: '' })).toEqual({ userDefine: '' })
  })

  it('虛構框架與破限詞跟其他欄位一樣，只在真的動到時才送', () => {
    expect(diffRoleSettings(snapshot, { ...snapshot, sandboxLevel: 'deep' }))
      .toEqual({ sandboxLevel: 'deep' })
    // 把破限詞清空是一個真的動作（回到預設），要送一個空字串過去
    expect(diffRoleSettings({ ...snapshot, jailbreak: '自訂' }, { ...snapshot, jailbreak: '' }))
      .toEqual({ jailbreak: '' })
  })

  it('沒帶進來的鍵完全不出現在送出的內容裡', () => {
    const payload = buildRoleSettingsSavePayload('r1', snapshot, { context: 5 })
    expect(payload).toEqual({ roleId: 'r1', context: 5 })
  })

  it('伺服器回的其他欄位不會被順手送回去', () => {
    const changed = diffRoleSettings(snapshot, {
      ...snapshot,
      userName: '小華',
      // 這一頁不碰的欄位
      roleSpeech: 'x',
      talkExample: [],
    } as any)
    expect(changed).toEqual({ userName: '小華' })
  })

  it('沒有卡片編號就不送', () => {
    expect(buildRoleSettingsSavePayload('', snapshot, { ...snapshot, context: 3 })).toBe(null)
  })

  it('這一頁只認這幾個欄位', () => {
    expect(ROLE_SETTING_KEYS).toEqual([
      'personaMode', 'userName', 'userSex', 'userDefine', 'selectModel', 'context', 'thinkingDepth',
      'sandboxLevel', 'jailbreak', 'trimConstantLore',
    ])
  })

  // 容量不夠時玩家可以選「用目前容量玩」：伺服器認的是布林值，送字串 "true" 會被拒。
  it('trimConstantLore 讀成布林值、只在變了時送出，而且送的是布林值', () => {
    expect(readRoleSettings({ trimConstantLore: true }).trimConstantLore).toBe(true)
    expect(readRoleSettings({}).trimConstantLore).toBe(false)
    expect(buildRoleSettingsSavePayload('r1', snapshot, { ...snapshot, trimConstantLore: true }))
      .toEqual({ roleId: 'r1', trimConstantLore: true })
    expect(buildRoleSettingsSavePayload('r1', { ...snapshot, trimConstantLore: true }, { ...snapshot, trimConstantLore: true })).toBe(null)
  })

  it('調高上下文檔位只送檔位', () => {
    expect(buildRoleSettingsSavePayload('r1', { ...snapshot, context: 1 }, { ...snapshot, context: 3 }))
      .toEqual({ roleId: 'r1', context: 3 })
  })

  it('context 送出去是數字，不是字串', () => {
    const changed = diffRoleSettings(snapshot, { context: '5' } as any)
    expect(changed).toEqual({ context: 5 })
    expect(typeof (changed as any).context).toBe('number')
  })
})

describe('人設三檔', () => {
  it('伺服器回的 personaMode 照讀；不認得的值當 global', async () => {
    const { readRoleSettings, asPersonaMode } = await import('../canvas-role-settings')
    expect(readRoleSettings({ personaMode: 'name_only' }).personaMode).toBe('name_only')
    expect(readRoleSettings({}).personaMode).toBe('')
    expect(asPersonaMode('')).toBe('global')
    expect(asPersonaMode('weird')).toBe('global')
    expect(asPersonaMode('custom')).toBe('custom')
    expect(asPersonaMode('conversation')).toBe('conversation')
  })

  it('只改稱呼也把模式一起送：伺服器對「有人設欄位、沒說模式」會推定成單獨設置', async () => {
    const { buildRoleSettingsSavePayload } = await import('../canvas-role-settings')
    const snapshot = { personaMode: 'name_only', userName: '', userSex: '', userDefine: '', selectModel: 'm', context: 1, thinkingDepth: '', sandboxLevel: '', jailbreak: '' }
    const next = { ...snapshot, userName: '小明' }
    expect(buildRoleSettingsSavePayload('r1', snapshot, next)).toEqual({ roleId: 'r1', userName: '小明', personaMode: 'name_only' })
    // 只改虛構框架：不碰人設，模式也不送
    expect(buildRoleSettingsSavePayload('r1', snapshot, { ...snapshot, sandboxLevel: 'deep' })).toEqual({ roleId: 'r1', sandboxLevel: 'deep' })
  })
})

describe('換模型時思考深度跟著模型走', () => {
  const pro = { value: 'pro', thinkingDepthOptions: [{ value: 'off' }, { value: 'high' }, { value: 'max' }], defaultThinkingDepth: 'max' }
  const flash = { value: 'flash', thinkingDepthOptions: [{ value: 'off' }, { value: 'high' }], defaultThinkingDepth: 'off' }
  const plain = { value: 'plain' }

  it('新模型支援原本的深度就保留', async () => {
    const { thinkingDepthForVariant } = await import('../canvas-role-settings')
    expect(thinkingDepthForVariant(flash, 'high')).toBe('high')
  })

  it('新模型不支援原本的深度就換成它的預設，而不是把舊值帶過去', async () => {
    const { thinkingDepthForVariant } = await import('../canvas-role-settings')
    expect(thinkingDepthForVariant(flash, 'max')).toBe('off')
    expect(thinkingDepthForVariant(pro, '')).toBe('max')
  })

  it('沒有思考檔位的模型送空字串；查不到線路就不動', async () => {
    const { thinkingDepthForVariant } = await import('../canvas-role-settings')
    expect(thinkingDepthForVariant(plain, 'max')).toBe('')
    expect(thinkingDepthForVariant(null, 'max')).toBe('max')
  })
})

describe('自訂指令的兩個名字', () => {
  it('伺服器回 customInstructions 時也讀得到（Harbor 用新名字）', () => {
    expect(readRoleSettings({ customInstructions: '別跳出角色' }).jailbreak).toBe('別跳出角色')
    expect(readRoleSettings({ jailbreak: '舊名字' }).jailbreak).toBe('舊名字')
  })
})
