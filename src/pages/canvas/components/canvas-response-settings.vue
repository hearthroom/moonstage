<template>
 <div class="role-setting response-settings" data-lt="response-settings" :aria-busy="loading || saving">
  <!--
    回覆偏好：跟「用戶人設」同一套版面（.role-setting）。每一項一張卡：標題、一排藥丸、
    底下一句只解釋「目前選的那個」。先前四個代寫選項各是一張兩行說明的大卡、每一項
    都掛「補充說明」與「恢復預設」，整頁擠成一片，玩家看不出重點（owner 2026-09-27 截圖）。
    補充說明是進階用法，收進底部的「進階」，跟人設頁的破限詞同一個位置。
  -->
  <div class="header-scope">
   <div class="header-box"><div class="page-title">{{ t('responseSettings.title') }}</div></div>
  </div>
  <div class="mode-hint response-scope">{{ t('responseSettings.scope') }}</div>
  <!-- 有沒存的修改時關掉：問一次，問在面板裡。面板開著時在瀏覽器 top layer，系統對話框
       （uni.showModal）z-index 再大也畫在它底下，玩家看不到也按不到，只能按儲存才脫身。 -->
  <div class="response-discard" role="alertdialog" :hidden="!discardAsked">
   <span class="response-discard-text">{{ t('responseSettings.discard') }}</span>
   <button type="button" class="response-discard-keep" data-action="keep-editing" @click="answerDiscard(false)">{{ t('responseSettings.keepEditing') }}</button>
   <button type="button" class="response-discard-ok" data-action="discard" @click="answerDiscard(true)">{{ t('responseSettings.discardButton') }}</button>
  </div>
  <p v-if="loading" class="mode-hint" role="status">{{ t('responseSettings.loading') }}</p>
  <div v-if="error" role="alert" class="role-setting-error response-error">
   <span>{{ t(`responseSettings.${error}`) }}</span>
   <button type="button" class="advanced-reset" data-action="reload" :disabled="loading || saving" @click="reload">{{ t('responseSettings.reload') }}</button>
  </div>
  <template v-if="saved">
   <div v-for="(options, axis) in responseAxes" :key="axis" class="card mode-box response-axis" :data-axis="axis">
    <div class="label">{{ t(`responseSettings.axes.${axis}`) }}</div>
    <div class="radio-group" role="radiogroup" :aria-label="t(`responseSettings.axes.${axis}`)">
     <button v-for="option in options" :key="option" type="button" class="mode-item" :data-axis="axis" :data-value="option"
      :class="{ selected: current(axis) === option }" role="radio" :aria-checked="current(axis) === option ? 'true' : 'false'"
      :disabled="loading || saving" @click="choose(axis, option)">{{ t(`responseSettings.options.${axis}.${option}`) }}</button>
    </div>
    <div v-if="hint(axis)" class="mode-hint" :data-hint="axis">{{ hint(axis) }}</div>
    <div v-if="axis === 'style' && draft.style === 'custom'" class="textarea-wrapper response-custom">
     <textarea v-model="draft.customStyle" class="textarea-dark response-custom-input" rows="3" :aria-label="t('responseSettings.customLabel')"
      :placeholder="t('responseSettings.customLabel')" :aria-invalid="customTooLong" />
     <div class="char-count" :class="{ 'response-error': customTooLong }">{{ t('responseSettings.customCount', { count: [...(draft.customStyle || '')].length }) }}</div>
    </div>
   </div>

   <div class="advanced-scope">
    <div class="advanced-toggle" role="button" tabindex="0" data-action="toggle-notes" :aria-expanded="notesOpen ? 'true' : 'false'"
     @click="notesOpen = !notesOpen" @keydown.enter.prevent="notesOpen = !notesOpen">
     <span class="advanced-title">{{ t('responseSettings.advanced') }}</span>
     <span class="advanced-caret" aria-hidden="true">{{ notesOpen ? '−' : '+' }}</span>
    </div>
    <div class="card advanced-body response-notes" :hidden="!notesOpen">
     <div class="advanced-desc">{{ t('responseSettings.noteHint') }}</div>
     <template v-for="axis in noteAxes" :key="axis">
      <label class="textarea-wrapper response-note">
       <span class="label">{{ t(`responseSettings.axes.${axis}`) }}</span>
       <textarea v-model="draft[responseNoteKeys[axis]]" class="textarea-dark response-note-input" :data-axis="axis" rows="2"
        :placeholder="t(`responseSettings.noteExamples.${axis}.${current(axis)}`)" :aria-invalid="noteTooLong(axis)" />
       <span class="char-count" :class="{ 'response-error': noteTooLong(axis) }">{{ t('responseSettings.noteCount', { count: [...(draft[responseNoteKeys[axis]] || '')].length }) }}</span>
      </label>
     </template>
     <div class="advanced-actions">
      <button type="button" class="advanced-reset" data-action="reset-all" :hidden="!customized" @click="resetAll">{{ t('responseSettings.resetAll') }}</button>
     </div>
    </div>
   </div>
  </template>

  <div class="role-setting__actions">
   <button type="button" class="icon-back" data-action="cancel" :disabled="saving" @click="$emit('close')">{{ t('main.cancel') }}</button>
   <button v-if="saved" type="button" class="complete-btn" data-action="save" :disabled="!dirty || invalid || loading || saving || error === 'conflict'" @click="submit">
    {{ t(saving ? 'responseSettings.saving' : 'responseSettings.save') }}
   </button>
  </div>
 </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { maxResponseNoteLength, readResponseSettings, responseAxes, responseDefaults, responseNoteKeys, responsePatch, type ResponseAxis, type ResponseDraft, type ResponseSettings } from '../canvas-response-settings'
const props=defineProps<{
 conversationId:string
 load:(id:string)=>Promise<unknown>
 save:(id:string,revision:number,patch:Record<string,string|null>)=>Promise<unknown>
 t:(key:string, values?:Record<string,unknown>)=>string
}>()
const emit=defineEmits<{ (e: 'close'): void }>()
const saved=ref<ResponseSettings|null>(null),draft=ref<ResponseDraft>({}),loading=ref(false),saving=ref(false),error=ref('')
let alive=true
const discardAsked=ref(false)
let discardAnswer:((ok:boolean)=>void)|null=null
function askDiscard(){discardAnswer?.(false);discardAsked.value=true;return new Promise<boolean>(resolve=>{discardAnswer=resolve})}
function answerDiscard(ok:boolean){discardAsked.value=false;const resolve=discardAnswer;discardAnswer=null;resolve?.(ok)}
onBeforeUnmount(()=>{alive=false;answerDiscard(false)})
const dirty=computed(()=>JSON.stringify(responsePatch(draft.value))!==JSON.stringify(responsePatch(saved.value?.overrides || {})))
const customTooLong=computed(()=>[...(draft.value.customStyle || '')].length>1000)
const axes=Object.keys(responseAxes) as ResponseAxis[]
// 文風選「自訂」時已經能整段寫，不再給文風補充。
const noteAxes=computed(()=>axes.filter(axis=>!(axis==='style' && draft.value.style==='custom')))
const notesOpen=ref(false)
const customized=computed(()=>Object.keys(responsePatch(draft.value)).some(key=>responsePatch(draft.value)[key]!==null))
function current(axis:ResponseAxis){return draft.value[axis] ?? responseDefaults[axis]}
// 底下那句只解釋目前選的那一個；篇幅是一句固定的提醒，文風的選項名已經說明自己。
function hint(axis:ResponseAxis){
 if(axis==='agency' || axis==='perspective' || axis==='pace') return props.t(`responseSettings.${axis}Hints.${current(axis)}`)
 if(axis==='length') return props.t('responseSettings.lengthHint')
 return ''
}
function noteTooLong(axis:ResponseAxis){return [...(draft.value[responseNoteKeys[axis]] || '')].length>maxResponseNoteLength}
const invalid=computed(()=>(draft.value.style==='custom' && (!draft.value.customStyle?.trim() || customTooLong.value)) || axes.some(noteTooLong))
function choose(axis:ResponseAxis,value:string){draft.value[axis]=value;if(axis==='style' && value!=='custom')delete draft.value.customStyle;if(axis==='style' && value==='custom')delete draft.value.styleNote}
function resetAll(){draft.value={}}
async function mayClose(){return !saving.value && (!dirty.value || await askDiscard())}
async function reload(){
 if(loading.value || saving.value || (dirty.value && !await mayClose()))return
 loading.value=true;error.value=''
 try{const value=readResponseSettings(await props.load(props.conversationId),props.conversationId);if(alive){saved.value=value;draft.value={...value.overrides};notesOpen.value=axes.some(axis=>!!value.overrides[responseNoteKeys[axis]])}}
 catch{if(alive)error.value='loadFailed'}finally{if(alive)loading.value=false}
}
async function submit(){
 if(!saved.value || !dirty.value || invalid.value || loading.value || saving.value || error.value==='conflict')return
 saving.value=true;error.value=''
 try{const value=readResponseSettings(await props.save(props.conversationId,saved.value.revision,responsePatch(draft.value)),props.conversationId);if(alive){saved.value=value;draft.value={...value.overrides};emit('close')}}
 catch(e){if(alive)error.value=((e as {status?:number})?.status ?? (e as {statusCode?:number})?.statusCode)===409?'conflict':'saveFailed'}finally{if(alive)saving.value=false}
}
onMounted(reload)
defineExpose({mayClose})
</script>
