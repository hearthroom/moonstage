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
      :class="{ selected: selected(axis) === option }" role="radio" :aria-checked="selected(axis) === option ? 'true' : 'false'"
      :disabled="loading || saving" @click="choose(axis, option)">{{ t(`responseSettings.options.${axis}.${option}`) }}</button>
    </div>
    <!-- 篇幅：指定字數時是一條停在刻度上的滑桿。拇指上方直接顯示字數，軌道下方標三個區，
         底下那句照目前落在哪個區解釋。 -->
    <div v-if="axis === 'length' && selected('length') === 'target'" class="response-length" data-axis="length">
     <div class="response-length-value" aria-live="polite">{{ t('responseSettings.lengthValue', { count: lengthTarget }) }}</div>
     <input type="range" class="response-length-slider" data-axis="length" min="0" :max="lengthTargetLadder.length - 1" step="1"
      :value="lengthTargetLadder.indexOf(lengthTarget as typeof lengthTargetLadder[number])" :aria-label="t('responseSettings.axes.length')"
      :aria-valuetext="t('responseSettings.lengthValue', { count: lengthTarget })" :disabled="loading || saving" @input="slide" />
     <div class="response-length-zones" aria-hidden="true">
      <span v-for="zone in lengthZones" :key="zone" class="response-length-zone" :class="{ selected: lengthZone(lengthTarget) === zone }">{{ t(`responseSettings.lengthZones.${zone}`) }}</span>
     </div>
    </div>
    <div v-if="hint(axis)" class="mode-hint" :data-hint="axis">{{ hint(axis) }}</div>
    <div v-if="axis === 'style' && selected('style') === 'custom'" class="textarea-wrapper response-custom">
     <textarea v-model="draft.customStyle" class="textarea-dark response-custom-input" rows="3" :aria-label="t('responseSettings.customLabel')"
      :placeholder="customPlaceholder" :aria-invalid="customTooLong" />
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
        :placeholder="notePlaceholder(axis)" :aria-invalid="noteTooLong(axis)" />
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
import { lengthMode, lengthTargetLadder, lengthTargetOf, lengthZone, maxResponseNoteLength, readResponseSettings, responseAxes, responseBase, responseNoteKeys, responsePatch, type LengthZone, type ResponseAxis, type ResponseDraft, type ResponseSettings } from '../canvas-response-settings'
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
// 玩家沒改的軸顯示的是 base：平台預設，卡片有作者預設時是作者的；「恢復預設」也回到這裡。
const base=computed(()=>responseBase(saved.value))
const dirty=computed(()=>JSON.stringify(responsePatch(draft.value,base.value))!==JSON.stringify(responsePatch(saved.value?.overrides || {},base.value)))
const customTooLong=computed(()=>[...(draft.value.customStyle || '')].length>1000)
const axes=Object.keys(responseAxes) as ResponseAxis[]
// 文風選「自訂」時已經能整段寫，不再給文風補充。
const noteAxes=computed(()=>axes.filter(axis=>!(axis==='style' && selected('style')==='custom')))
const notesOpen=ref(false)
const customized=computed(()=>Object.values(responsePatch(draft.value,base.value)).some(value=>value!==null))
function current(axis:ResponseAxis){return draft.value[axis] ?? base.value[axis]}
// 藥丸上亮的是哪一個：篇幅的舊三檔值算「指定字數」。
function selected(axis:ResponseAxis){return axis==='length' ? lengthMode(current('length')) : current(axis)}
const lengthZones:LengthZone[]=['brief','balanced','detailed','long']
const lengthTarget=computed(()=>lengthTargetOf(draft.value,base.value))
// 作者預設的自訂文風與補充說明：玩家沒改那一軸時當提示字顯示，讓玩家知道作者原本怎麼寫。
const customPlaceholder=computed(()=>(current('style')===base.value.style && base.value.customStyle) || props.t('responseSettings.customLabel'))
function notePlaceholder(axis:ResponseAxis){return (current(axis)===base.value[axis] && base.value[responseNoteKeys[axis]]) || props.t(`responseSettings.noteExamples.${axis}.${selected(axis)}`)}
function slide(event:Event){
 const value=lengthTargetLadder[Number((event.target as HTMLInputElement).value)]
 if(value===undefined)return
 draft.value.length='target';draft.value.lengthTarget=String(value)
}
// 底下那句只解釋目前選的那一個；篇幅照落在哪個區解釋。文風四個選項名字看不出差別在哪
//（預設與精簡指引都有平台指引，差在留給模型多少發揮），所以也要一句說明。
function hint(axis:ResponseAxis){
 if(axis==='agency' || axis==='perspective' || axis==='pace' || axis==='style') return props.t(`responseSettings.${axis}Hints.${current(axis)}`)
 if(axis==='length') return props.t(`responseSettings.lengthHints.${selected('length')==='target' ? lengthZone(lengthTarget.value) : selected('length')}`)
 return ''
}
function noteTooLong(axis:ResponseAxis){return [...(draft.value[responseNoteKeys[axis]] || '')].length>maxResponseNoteLength}
const invalid=computed(()=>(draft.value.style==='custom' && !(draft.value.customStyle?.trim() || (base.value.style==='custom' && base.value.customStyle))) || customTooLong.value || axes.some(noteTooLong))
// 點的是原本的預設（作者的，作者沒指定時是平台的）就不算改：作者在這一項的補充、
// 自訂文風與字數照用，只有選了不同的選項才讓位。
function choose(axis:ResponseAxis,value:string){
 if(axis==='length'){
  if(value===base.value.length){if(value!=='target' || draft.value.length===undefined){delete draft.value.length;delete draft.value.lengthTarget}return}
  if(value==='target'){const target=lengthTargetOf(draft.value,base.value);draft.value.length='target';draft.value.lengthTarget=String(target)}
  else{draft.value.length=value;delete draft.value.lengthTarget}
  return
 }
 if(value===base.value[axis])delete draft.value[axis]
 else draft.value[axis]=value
 if(axis==='style' && value!=='custom')delete draft.value.customStyle
 if(axis==='style' && value==='custom')delete draft.value.styleNote
}
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
 try{const value=readResponseSettings(await props.save(props.conversationId,saved.value.revision,responsePatch(draft.value,base.value)),props.conversationId);if(alive){saved.value=value;draft.value={...value.overrides};emit('close')}}
 catch(e){if(alive)error.value=((e as {status?:number})?.status ?? (e as {statusCode?:number})?.statusCode)===409?'conflict':'saveFailed'}finally{if(alive)saving.value=false}
}
onMounted(reload)
defineExpose({mayClose})
</script>

<style scoped>
.response-length{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.response-length-value{font-size:14px;font-weight:600}
.response-length-slider{width:100%;margin:0;accent-color:var(--luna-gold, #F5C542)}
.response-length-zones{display:flex;justify-content:space-between;font-size:12px;opacity:.6}
.response-length-zone.selected{opacity:1;font-weight:600}
</style>
