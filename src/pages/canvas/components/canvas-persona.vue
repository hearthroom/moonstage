<template>
  <div class="role-setting">
  <!--
    用戶人設：AI 該怎麼稱呼你、把你當成誰，以及這段扮演的虛構框架要多強。

    節點名照 MMD（`.role-setting`，作者的卡對 `.role-setting .card.textarea-wrapper`
    與 `.role-setting .input-wrapper .input-dark` 寫了外觀），標題列沿用 MMD 那一頁的
    `.header-scope > .header-box`；取消／保存兩顆鍵搬到了底部的 `.bottom`，名字不變。
  -->
    <div class="header-scope">
      <div class="header-box">
        <div class="page-title">{{ labels.title }}</div>
      </div>
    </div>

    <!--
      人設三檔（對齊 MMD）：僅使用稱呼／全局人設／單獨設置。
      「全局」編輯的是帳號那一份，改了到處生效；「單獨」只動這張卡；「僅稱呼」只留名字。
      每一檔底下寫一句「它會怎樣」——這是三個不同的儲存位置，玩家看不到後面的差別。
    -->
    <div class="card mode-box">
      <div class="label">{{ labels.modeLabel }}</div>
      <div class="radio-group">
        <div
          v-for="option in modeOptions"
          :key="option.value"
          class="mode-item"
          :class="{ selected: option.value === draft.personaMode }"
          role="radio"
          tabindex="0"
          :aria-checked="option.value === draft.personaMode ? 'true' : 'false'"
          @click="draft.personaMode = option.value"
          @keydown.enter.prevent="draft.personaMode = option.value"
        >{{ option.label }}</div>
      </div>
      <div class="mode-hint">{{ modeHint }}</div>
    </div>

    <div class="card input-wrapper">
      <div class="label">{{ labels.nameLabel }}</div>
      <CanvasInput
        el-class="input-dark"
        :value="persona.userName"
        :maxlength="nameMaxLength"
        :placeholder="labels.namePlaceholder"
        @input="persona.userName = $event"
      />
      <div class="char-count">{{ persona.userName.length }}/{{ nameMaxLength }}</div>
      <!-- 沒填稱呼時 AI 會用暱稱叫玩家——講出來，別讓他猜「空著會怎樣」。 -->
      <div v-if="labels.nickNameHint && !persona.userName" class="nick-hint">{{ labels.nickNameHint }}</div>
    </div>

    <!-- 性別是三選一，不是自由填：它進提示詞時是一個固定的詞。僅稱呼那一檔不帶它，就不畫。 -->
    <div v-if="draft.personaMode !== 'name_only'" class="card gender-box">
      <div class="label">{{ labels.sexLabel }}</div>
      <div class="radio-group">
        <div
          v-for="option in sexOptions"
          :key="option.value"
          class="gender-item"
          :class="{ selected: option.value === persona.userSex }"
          role="radio"
          tabindex="0"
          :aria-checked="option.value === persona.userSex ? 'true' : 'false'"
          @click="pickSex(option.value)"
          @keydown.enter.prevent="pickSex(option.value)"
        >{{ option.label }}</div>
      </div>
    </div>

    <div v-if="draft.personaMode !== 'name_only'" class="card textarea-wrapper">
      <div class="label">{{ labels.defineLabel }}</div>
      <CanvasTextField
        el-class="textarea-dark"
        :value="persona.userDefine"
        :maxlength="defineMaxLength"
        :placeholder="labels.definePlaceholder"
        @input="persona.userDefine = $event"
      />
      <div class="char-count">{{ persona.userDefine.length }}/{{ defineMaxLength }}</div>
    </div>

    <!--
      虛構框架的強度。四檔是一條軸（由弱到強），不是四個並列選項——所以排成一列
      而不是四張卡，而且每一檔底下寫出「什麼時候該用它」。少了那句話，玩家只能
      靠猜；猜錯的代價是角色開始拒演，而他不會知道是這裡造成的。
    -->
    <div class="card sandbox-box">
      <div class="label">{{ labels.sandboxLabel }}</div>
      <div class="radio-group">
        <div
          v-for="option in sandboxOptions"
          :key="option.value"
          class="sandbox-item"
          :class="{ selected: option.value === effectiveSandboxLevel }"
          role="radio"
          tabindex="0"
          :aria-checked="option.value === effectiveSandboxLevel ? 'true' : 'false'"
          @click="draft.sandboxLevel = option.value"
          @keydown.enter.prevent="draft.sandboxLevel = option.value"
        >{{ option.label }}</div>
      </div>
      <div class="sandbox-hint">{{ sandboxHint }}</div>
    </div>

    <!--
      破限詞收在「進階」底下：絕大多數玩家不需要它，而它擺在外面會讓這一頁看起來
      像一份設定表。節點常駐（用 hidden 收起來），作者的卡打得到。
    -->
    <div class="advanced-scope">
      <div class="advanced-toggle" role="button" tabindex="0"
           :aria-expanded="advancedOpen ? 'true' : 'false'"
           @click="advancedOpen = !advancedOpen"
           @keydown.enter.prevent="advancedOpen = !advancedOpen">
        <span class="advanced-title">{{ labels.advanced }}</span>
        <span class="advanced-caret">{{ advancedOpen ? '−' : '+' }}</span>
      </div>

      <div class="card textarea-wrapper advanced-body" :hidden="!advancedOpen">
        <div class="label">{{ labels.jailbreakLabel }}</div>
        <div class="advanced-desc">{{ labels.jailbreakHint }}</div>
        <CanvasTextField
          el-class="textarea-dark"
          :value="draft.jailbreak"
          :maxlength="jailbreakMaxLength"
          :placeholder="defaultJailbreak || labels.jailbreakHint"
          @input="draft.jailbreak = $event"
        />
        <div class="advanced-actions">
          <!-- 清空＝回到預設。這不是刪除資料，是把「用我自己的」換回「用預設的」。 -->
          <div class="advanced-reset" role="button" tabindex="0"
               :hidden="!draft.jailbreak"
               @click="draft.jailbreak = ''"
               @keydown.enter.prevent="draft.jailbreak = ''">{{ labels.jailbreakReset }}</div>
          <div class="char-count">{{ draft.jailbreak.length }}/{{ jailbreakMaxLength }}</div>
        </div>
      </div>
    </div>

    <!-- 內容審核擋下來時，伺服器講的是原因——原樣留在這一片裡。
         彈層蓋在系統提示之上，提示會被藏在後面看不到。 -->
    <div class="role-setting-error" :hidden="!error">{{ error }}</div>

    <!-- 取消／保存放底部動作列，跟這一頁其他彈層同一個位置。節點名（.icon-back／.complete-btn）
         照 MMD，作者對它們寫的外觀照舊生效。 -->
    <div class="bottom">
      <div class="icon-back" role="button" tabindex="0"
           :aria-label="labels.cancel"
           @click="$emit('close')"
           @keydown.enter.prevent="$emit('close')">{{ labels.cancel }}</div>
      <div class="complete-btn" role="button" tabindex="0"
           :class="{ 'is-busy': saving }"
           :aria-busy="saving ? 'true' : 'false'"
           @click="onSave"
           @keydown.enter.prevent="onSave">{{ labels.save }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { CanvasInput, CanvasTextField } from './canvas-field'
import { asPersonaMode, type PersonaMode } from '../canvas-role-settings'

interface PersonaFields { userName: string; userSex: string; userDefine: string }

const props = withDefaults(defineProps<{
  /** name_only / global / custom */
  personaMode?: string
  /** 帳號層級那份人設（全局人設）；「全局」那一檔編輯的是它 */
  globalPersona?: Partial<PersonaFields> | null
  /** 帳號暱稱；稱呼沒填時 AI 會用它 */
  nickName?: string
  userName?: string
  userSex?: string
  userDefine?: string
  sandboxLevel?: string
  jailbreak?: string
  /** 這張卡（或平台）的預設破限詞，當作輸入框的提示 */
  defaultJailbreak?: string
  /** 主站與畫布共用的代號：man / women / other。'women' 是既有存量值。 */
  sexOptions?: Array<{ value: string; label: string }>
  /** 由弱到強，每一檔帶一句「什麼時候該用它」 */
  sandboxOptions?: Array<{ value: string; label: string; hint?: string }>
  nameMaxLength?: number
  defineMaxLength?: number
  jailbreakMaxLength?: number
  saving?: boolean
  error?: string
  labels?: {
    title: string
    cancel: string
    save: string
    modeLabel: string
    modeNameOnly: string
    modeGlobal: string
    modeCustom: string
    modeNameOnlyHint: string
    modeGlobalHint: string
    modeCustomHint: string
    nickNameHint: string
    nameLabel: string
    namePlaceholder: string
    sexLabel: string
    defineLabel: string
    definePlaceholder: string
    sandboxLabel: string
    sandboxDesc: string
    advanced: string
    jailbreakLabel: string
    jailbreakHint: string
    jailbreakReset: string
  }
}>(), {
  personaMode: '', globalPersona: null, nickName: '',
  userName: '', userSex: '', userDefine: '', sandboxLevel: '', jailbreak: '',
  defaultJailbreak: '',
  sexOptions: () => [],
  sandboxOptions: () => [],
  nameMaxLength: 20,
  defineMaxLength: 1000,
  jailbreakMaxLength: 2000,
  saving: false,
  error: '',
  labels: () => ({
    title: '', cancel: 'Cancel', save: 'Save',
    modeLabel: '', modeNameOnly: '', modeGlobal: '', modeCustom: '',
    modeNameOnlyHint: '', modeGlobalHint: '', modeCustomHint: '', nickNameHint: '',
    nameLabel: '', namePlaceholder: '', sexLabel: '',
    defineLabel: '', definePlaceholder: '',
    sandboxLabel: '', sandboxDesc: '',
    advanced: 'Advanced', jailbreakLabel: '', jailbreakHint: '', jailbreakReset: '',
  }),
})

const emit = defineEmits<{
  (e: 'save', value: {
    personaMode: PersonaMode
    userName: string; userSex: string; userDefine: string
    sandboxLevel: string; jailbreak: string
  }): void
  (e: 'close'): void
}>()

/*
  編輯的是草稿，不是直接寫回去。玩家改到一半關掉彈層時，伺服器上那份設定
  一個字都不該動——他沒有按儲存。

  兩份草稿：這張卡自己的（draft），跟帳號那份全局人設（globalDraft）。切到「全局」時
  三個欄位接到 globalDraft 上，其餘兩檔接到 draft；切來切去各自的內容都還在。
*/
const draft = reactive({
  personaMode: asPersonaMode(props.personaMode) as PersonaMode,
  userName: props.userName,
  userSex: props.userSex,
  userDefine: props.userDefine,
  sandboxLevel: props.sandboxLevel,
  jailbreak: props.jailbreak,
})
const globalDraft = reactive<PersonaFields>({
  userName: String(props.globalPersona?.userName || ''),
  userSex: String(props.globalPersona?.userSex || ''),
  userDefine: String(props.globalPersona?.userDefine || ''),
})

/** 目前那一檔正在編輯的三個欄位落在哪份草稿上。 */
const persona = computed<PersonaFields>(() => (draft.personaMode === 'global' ? globalDraft : draft))

const advancedOpen = ref(false)

watch(() => [props.personaMode, props.userName, props.userSex, props.userDefine,
             props.sandboxLevel, props.jailbreak].join(' '), () => {
  draft.personaMode = asPersonaMode(props.personaMode)
  draft.userName = props.userName
  draft.userSex = props.userSex
  draft.userDefine = props.userDefine
  draft.sandboxLevel = props.sandboxLevel
  draft.jailbreak = props.jailbreak
})
watch(() => props.globalPersona, (gp) => {
  globalDraft.userName = String(gp?.userName || '')
  globalDraft.userSex = String(gp?.userSex || '')
  globalDraft.userDefine = String(gp?.userDefine || '')
}, { deep: true })

const modeOptions = computed(() => [
  { value: 'name_only' as PersonaMode, label: props.labels.modeNameOnly, hint: props.labels.modeNameOnlyHint },
  { value: 'global' as PersonaMode, label: props.labels.modeGlobal, hint: props.labels.modeGlobalHint },
  { value: 'custom' as PersonaMode, label: props.labels.modeCustom, hint: props.labels.modeCustomHint },
])
const modeHint = computed(() => modeOptions.value.find((o) => o.value === draft.personaMode)?.hint || '')

/*
  沒設過就標在「標準」上。這裡跟性別不一樣：性別沒設過是一個真的狀態（AI 就不
  提），而虛構框架永遠有一個正在生效的值——畫面上不標出來，玩家會以為它沒開。
*/
const effectiveSandboxLevel = computed(() => draft.sandboxLevel || 'standard')

const sandboxHint = computed(() => {
  const hit = props.sandboxOptions.find((o) => o.value === effectiveSandboxLevel.value)
  return (hit && hit.hint) || props.labels.sandboxDesc
})

function pickSex(value: string) {
  // 再點一次同一顆＝取消。沒設過性別是一個真的狀態（伺服器上就是空字串），
  // 選了之後沒有退路的話，玩家就再也回不到那個狀態。
  persona.value.userSex = persona.value.userSex === value ? '' : value
}

function onSave() {
  if (props.saving) return
  emit('save', {
    personaMode: draft.personaMode,
    userName: persona.value.userName,
    userSex: persona.value.userSex,
    userDefine: persona.value.userDefine,
    sandboxLevel: draft.sandboxLevel,
    jailbreak: draft.jailbreak,
  })
}
</script>
