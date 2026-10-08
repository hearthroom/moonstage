/**
 * 殼自己的幾句文案。殼不裝 vue-i18n（它沒有宿主的文案表），這幾句用宿主 hello 帶來的
 * locale 直接挑；沒有的語系退回英文。
 */
export interface ShellStrings {
  send: string
  placeholder: string
  generating: string
  stop: string
  back: string
  more: string
  allowSendTitle: string
  allowSendBody: string
  allowArchiveTitle: string
  allowArchiveBody: string
  allow: string
  deny: string
  scriptError: string
  externalScriptFailed: string
}

const TABLE: Record<string, ShellStrings> = {
  'zh-Hant': {
    send: '送出',
    placeholder: '說點什麼…',
    generating: '正在回覆…',
    stop: '停止',
    back: '返回',
    more: '更多',
    allowSendTitle: '允許這張卡替你送出訊息？',
    allowSendBody: '卡片的程式想以你的名義送出一則訊息。',
    allowArchiveTitle: '允許這張卡變更你的存檔？',
    allowArchiveBody: '卡片的程式想存檔、讀檔、分叉或另開新檔。目前的進度會保留在存檔清單裡。',
    allow: '允許',
    deny: '拒絕',
    scriptError: '卡片腳本出錯',
    externalScriptFailed: '外鏈腳本沒載入',
  },
  'zh-Hans': {
    send: '发送',
    placeholder: '说点什么…',
    generating: '正在回复…',
    stop: '停止',
    back: '返回',
    more: '更多',
    allowSendTitle: '允许这张卡替你发送消息？',
    allowSendBody: '卡片的程序想以你的名义发送一条消息。',
    allowArchiveTitle: '允许这张卡变更你的存档？',
    allowArchiveBody: '卡片的程序想存档、读档、分叉或另开新档。当前的进度会保留在存档列表里。',
    allow: '允许',
    deny: '拒绝',
    scriptError: '卡片脚本出错',
    externalScriptFailed: '外链脚本没加载',
  },
  en: {
    send: 'Send',
    placeholder: 'Say something…',
    generating: 'Replying…',
    stop: 'Stop',
    back: 'Back',
    more: 'More',
    allowSendTitle: 'Let this card send a message for you?',
    allowSendBody: 'The card\'s script wants to send a message in your name.',
    allowArchiveTitle: 'Let this card change your saves?',
    allowArchiveBody: 'The card\'s script wants to save, load, fork or start a new save. Your current progress stays in the save list.',
    allow: 'Allow',
    deny: 'Deny',
    scriptError: 'Card script error',
    externalScriptFailed: 'External script failed to load',
  },
  ja: {
    send: '送信',
    placeholder: '何か話しかける…',
    generating: '返信中…',
    stop: '停止',
    back: '戻る',
    more: 'その他',
    allowSendTitle: 'このカードにメッセージの送信を許可しますか？',
    allowSendBody: 'カードのスクリプトがあなたの名前でメッセージを送ろうとしています。',
    allowArchiveTitle: 'このカードにセーブの変更を許可しますか？',
    allowArchiveBody: 'カードのスクリプトがセーブ、ロード、分岐、新規開始をしようとしています。現在の進行はセーブ一覧に残ります。',
    allow: '許可',
    deny: '拒否',
    scriptError: 'カードのスクリプトでエラー',
    externalScriptFailed: '外部スクリプトを読み込めませんでした',
  },
  ko: {
    send: '보내기',
    placeholder: '무엇이든 말해 보세요…',
    generating: '답장 중…',
    stop: '중지',
    back: '뒤로',
    more: '더보기',
    allowSendTitle: '이 카드가 대신 메시지를 보내도록 허용할까요?',
    allowSendBody: '카드의 스크립트가 내 이름으로 메시지를 보내려고 합니다.',
    allowArchiveTitle: '이 카드가 저장을 변경하도록 허용할까요?',
    allowArchiveBody: '카드 스크립트가 저장, 불러오기, 분기, 새로 시작을 하려고 합니다. 현재 진행은 저장 목록에 남습니다.',
    allow: '허용',
    deny: '거부',
    scriptError: '카드 스크립트 오류',
    externalScriptFailed: '외부 스크립트를 불러오지 못했습니다',
  },
}

export function shellStrings(locale: string): ShellStrings {
  const key = String(locale || '')
  if (TABLE[key]) return TABLE[key]
  const base = key.split(/[-_]/)[0]
  if (base === 'zh') return /hans|cn|sg/i.test(key) ? TABLE['zh-Hans'] : TABLE['zh-Hant']
  return TABLE[base] || TABLE.en
}
