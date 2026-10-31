<template>
 <div class="role-setting response-settings" data-lt="response-settings" :aria-busy="loading || saving">
  <!--
    回覆偏好：跟「用戶人設」同一套版面（.role-setting）。每一項一張卡：標題、一排藥丸、
    底下一句只解釋「目前選的那個」。先前四個代寫選項各是一張兩行說明的大卡、每一項
    都掛「補充說明」與「恢復預設」，整頁擠成一片，玩家看不出重點（owner 2026-09-27 截圖）。
    補充說明是進階用法，收進底部的「進階」，跟人設頁的破限詞同一個位置。
  -->
  <!-- 自訂預設選擇器是同一個面板裡的一層：偏好那一層只是藏起來，草稿與捲動位置都留著 -->
  <CanvasPresetPicker v-if="pickerOpen && presets && binding" :api="presets" :binding="binding" :mine="choices" :shelf="shelf" :confirm-leave="confirmLeave" :t="t"
   @back="closePicker" @changed="refreshAfterPreset" @stale="loadPreset" @applied="pickerApplied" @browse="emit('browse')" />
  <div v-show="!pickerOpen" class="response-settings-main">
  <div class="header-scope">
   <div class="header-box"><div class="page-title">{{ t('responseSettings.title') }}</div></div>
  </div>
  <div class="mode-hint response-scope">{{ t('responseSettings.scope') }}</div>
  <p v-if="loading" class="mode-hint" role="status">{{ t('responseSettings.loading') }}</p>
  <div v-if="error" role="alert" class="role-setting-error response-error">
   <span>{{ t(`responseSettings.${error}`) }}</span>
   <button type="button" class="advanced-reset" data-action="reload" :disabled="loading || saving" @click="reload">{{ t('responseSettings.reload') }}</button>
  </div>
  <template v-if="saved">
   <!-- 套用了自訂預設：它決定的那幾項收成一張，不是變灰——玩家才不會以為還能調（owner 2026-10-30） -->
   <div v-if="locked.length && presets" class="card mode-box response-takeover" data-lt="preset-takeover">
    <div class="label">{{ t('responseSettings.preset.takeover.title', { name: binding?.title || '' }) }}</div>
    <div class="mode-hint">{{ t('responseSettings.preset.takeover.body') }}</div>
   </div>
   <div v-for="axis in shownAxes" :key="axis" class="card mode-box response-axis" :data-axis="axis">
    <div class="label">{{ t(`responseSettings.axes.${axis}`) }}</div>
    <div class="radio-group" role="radiogroup" :aria-label="t(`responseSettings.axes.${axis}`)">
     <button v-for="option in responseAxes[axis]" :key="option" type="button" class="mode-item" :data-axis="axis" :data-value="option"
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
    <div v-if="axis === 'length' && locked.length" class="mode-hint" data-hint="length-preset">{{ t('responseSettings.preset.lengthIndependent') }}</div>
    <div v-if="axis === 'style' && selected('style') === 'custom'" class="textarea-wrapper response-custom">
     <textarea autocomplete="off" v-model="draft.customStyle" class="textarea-dark response-custom-input" rows="3" :aria-label="t('responseSettings.customLabel')"
      :placeholder="customPlaceholder" :aria-invalid="customTooLong" />
     <div class="char-count" :class="{ 'response-error': customTooLong }">{{ t('responseSettings.customCount', { count: [...(draft.customStyle || '')].length }) }}</div>
    </div>
   </div>

   <div v-if="!worldMode" class="card mode-box response-streaming">
    <div class="response-streaming-head">
     <div class="label" id="response-streaming-label">{{ t('responseSettings.streamingTitle') }}</div>
     <MsSwitch data-lt="streaming-toggle" aria-labelledby="response-streaming-label" :aria-describedby="!streaming || toolReplyActive ? 'response-streaming-hint' : undefined"
      :checked="streaming && !toolReplyActive" :disabled="loading || saving || toolReplyActive" @change="setStreaming" />
    </div>
    <div v-if="!streaming || toolReplyActive" id="response-streaming-hint" class="mode-hint" data-hint="streaming">{{ toolReplyActive ? t('responseSettings.preset.toolReply.active') : t('responseSettings.streamingOffHint') }}</div>
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
       <textarea autocomplete="off" v-model="draft[responseNoteKeys[axis]]" class="textarea-dark response-note-input" :data-axis="axis" rows="2"
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

  <!--
    破甲強度與自定義破限詞跟著這張卡（玩家對這張卡的設定），不是這個存檔：從用戶人設搬過來
    （owner 2026-10-17），存的地方沒變。上面幾項只管這個存檔，所以這一段另起一句範圍說明。
    讀不到存檔偏好時這一段照樣能改、能存。
  -->
  <template v-if="frame && !frameLocked">
   <div class="mode-hint response-scope response-frame-scope">{{ t('responseSettings.frameScope') }}</div>
   <div class="card mode-box response-frame" data-lt="response-frame">
    <div class="label">{{ t('chat.sandboxLevel') }}</div>
    <div class="radio-group" role="radiogroup" :aria-label="t('chat.sandboxLevel')">
     <button v-for="option in frame.options" :key="option.value" type="button" class="mode-item" data-axis="sandbox" :data-value="option.value"
      :class="{ selected: frameLevel === option.value }" role="radio" :aria-checked="frameLevel === option.value ? 'true' : 'false'"
      :disabled="saving" @click="frameDraft.sandboxLevel = option.value">{{ option.label }}</button>
    </div>
    <div class="mode-hint" data-hint="sandbox">{{ frameHint }}</div>
   </div>
   <div class="advanced-scope response-jailbreak">
    <div class="advanced-toggle" role="button" tabindex="0" data-action="toggle-jailbreak" :aria-expanded="jailbreakOpen ? 'true' : 'false'"
     @click="jailbreakOpen = !jailbreakOpen" @keydown.enter.prevent="jailbreakOpen = !jailbreakOpen">
     <span class="advanced-title">{{ t('responseSettings.jailbreakAdvanced') }}</span>
     <span class="advanced-caret" aria-hidden="true">{{ jailbreakOpen ? '−' : '+' }}</span>
    </div>
    <div class="card textarea-wrapper advanced-body" :hidden="!jailbreakOpen">
     <div class="advanced-desc">{{ t('chat.jailbreakTips') }}</div>
     <CanvasTextField :value="frameDraft.jailbreak" el-class="textarea-dark response-jailbreak-input" rows="4" :aria-label="t('chat.jailbreak')"
      :maxlength="frame.maxLength" :placeholder="frame.defaultJailbreak || t('chat.jailbreakTips')" @input="frameDraft.jailbreak = $event" />
     <div class="advanced-actions">
      <!-- 清空＝回到預設，不是刪除資料。 -->
      <button type="button" class="advanced-reset" data-action="reset-jailbreak" :hidden="!frameDraft.jailbreak" @click="frameDraft.jailbreak = ''">{{ t('chat.jailbreakResetDefault') }}</button>
      <div class="char-count">{{ frameDraft.jailbreak.length }}/{{ frame.maxLength }}</div>
     </div>
    </div>
   </div>
  </template>

  <!-- 自訂預設直接列在最下面，不收折（owner 2026-10-30）。世界模式不開放。 -->
  <CanvasPresetSection v-if="presets && !worldMode && binding" :api="presets" :binding="binding" :unlisted="currentUnlisted" :notice="presetNotice" :disabled="loading || saving"
   :tool-note="toolReplyNote" :confirm-leave="confirmLeave" :t="t" @changed="refreshAfterPreset" @stale="loadPreset" @pick="openPicker" />
  <p v-else-if="presets && !worldMode && presetError" class="mode-hint response-error" role="alert" data-lt="preset-error">{{ presetError }}</p>

  <div class="role-setting__actions">
   <button type="button" class="icon-back" data-action="cancel" :disabled="saving" @click="cancel">{{ t('main.cancel') }}</button>
   <button v-if="saved || frame" type="button" class="complete-btn" data-action="save" :disabled="!canSave" @click="submit">
    {{ t(saving ? 'responseSettings.saving' : 'responseSettings.save') }}
   </button>
  </div>
  </div>
 <!-- 另一個 top-layer 彈層：不跟偏好內容一起捲動，也不會落在父彈層底下。 -->
 <CanvasPopup class="response-discard" :open="discardAsked" :title="t('responseSettings.discard')" :close-label="t('responseSettings.keepEditing')"
  :style="discardViewport" @close="answerDiscard(false)">
  <div class="response-discard-body">
   <p class="response-discard-text">{{ t('responseSettings.discard') }}</p>
   <div class="response-discard-actions">
    <button ref="keepEditing" type="button" class="response-discard-keep" data-action="keep-editing" @click="answerDiscard(false)">{{ t('responseSettings.keepEditing') }}</button>
    <button ref="discardButton" type="button" class="response-discard-ok" data-action="discard" @click="answerDiscard(true)"><span>{{ t('responseSettings.discardButton') }}</span></button>
   </div>
  </div>
 </CanvasPopup>
 </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import MsSwitch from '../../../components/model-select/ms-switch.vue'
import CanvasPopup from './canvas-popup.vue'
import { CanvasTextField } from './canvas-field'
import CanvasPresetSection from './canvas-preset-section.vue'
import CanvasPresetPicker from './canvas-preset-picker.vue'
import { lockedPatch, presetLockedOf, readBinding, readPresetRows, type PresetApi, type PresetBinding, type PresetRow } from '../canvas-preset'
import { lengthMode, lengthTargetLadder, lengthTargetOf, lengthZone, maxResponseNoteLength, readResponseSettings, responseAxes, responseBase, responseNoteKeys, responsePatch, type LengthZone, type ResponseAxis, type ResponseDraft, type ResponseSettings } from '../canvas-response-settings'
const props=defineProps<{
 conversationId:string
 worldMode?:boolean
 load:(id:string)=>Promise<unknown>
 save:(id:string,revision:number,patch:Record<string,string|null>)=>Promise<unknown>
 t:(key:string, values?:Record<string,unknown>)=>string
 // 這張卡的破甲強度與破限詞；沒給就不畫這一段（仍留在用戶人設裡）。
 frame?:{sandboxLevel:string,jailbreak:string,defaultJailbreak:string,options:Array<{value:string,label:string,hint?:string}>,maxLength:number}
 saveFrame?:(value:{sandboxLevel:string,jailbreak:string})=>Promise<boolean>
 // 伺服器說這段對話能用預設時，頁面才給；沒給就完全照舊。
 presets?:PresetApi
}>()
// browse：開預設庫抽屜（畫布那一層畫，面板不管）
const emit=defineEmits<{ (e: 'close'): void; (e: 'browse'): void }>()
const saved=ref<ResponseSettings|null>(null),draft=ref<ResponseDraft>({}),loading=ref(false),saving=ref(false),error=ref('')
let alive=true
const discardAsked=ref(false)
const keepEditing=ref<HTMLButtonElement|null>(null),discardButton=ref<HTMLButtonElement|null>(null)
const discardViewport=ref<Record<string,string>>({})
let discardAnswer:((ok:boolean)=>void)|null=null
let discardPending:Promise<boolean>|null=null
let previousFocus:HTMLElement|null=null
function syncDiscardViewport(){
 const viewport=window.visualViewport
 discardViewport.value=viewport?{inset:'auto',top:`${viewport.offsetTop}px`,left:`${viewport.offsetLeft}px`,width:`${viewport.width}px`,height:`${viewport.height}px`}:{}
}
function discardKeydown(event:KeyboardEvent){
 if(!discardAsked.value)return
 if(event.key==='Escape' || event.key==='Esc'){event.preventDefault();event.stopImmediatePropagation();answerDiscard(false)}
 else if(event.key==='Tab'){
  event.preventDefault();event.stopImmediatePropagation()
  const next=document.activeElement===keepEditing.value?discardButton.value:keepEditing.value
  next?.focus()
 }
}
function askDiscard(){
 if(discardPending)return discardPending
 previousFocus=document.activeElement as HTMLElement|null
 previousFocus?.blur()
 syncDiscardViewport()
 window.visualViewport?.addEventListener('resize',syncDiscardViewport)
 window.visualViewport?.addEventListener('scroll',syncDiscardViewport)
 document.addEventListener('keydown',discardKeydown,true)
 discardPending=new Promise<boolean>(resolve=>{discardAnswer=resolve})
 discardAsked.value=true
 nextTick(()=>{if(discardAsked.value)keepEditing.value?.focus()})
 return discardPending
}
function answerDiscard(ok:boolean){
 discardAsked.value=false
 window.visualViewport?.removeEventListener('resize',syncDiscardViewport)
 window.visualViewport?.removeEventListener('scroll',syncDiscardViewport)
 document.removeEventListener('keydown',discardKeydown,true)
 const resolve=discardAnswer;discardAnswer=null;discardPending=null;resolve?.(ok)
 if(!ok && alive && previousFocus?.isConnected)previousFocus.focus({preventScroll:true})
 previousFocus=null
}
onBeforeUnmount(()=>{alive=false;answerDiscard(false)})
// 玩家沒改的軸顯示的是 base：平台預設，卡片有作者預設時是作者的；「恢復預設」也回到這裡。
const base=computed(()=>responseBase(saved.value))
const streaming=computed(()=>(draft.value.streaming ?? base.value.streaming ?? 'on')!=='off')
function setStreaming(value:boolean){
 const picked=value?'on':'off'
 draft.value.streaming=picked
}
const dirty=computed(()=>JSON.stringify(responsePatch(draft.value,base.value))!==JSON.stringify(responsePatch(saved.value?.overrides || {},base.value)))
const jailbreakOpen=ref(!!props.frame?.jailbreak)
const frameDraft=reactive({sandboxLevel:props.frame?.sandboxLevel || '',jailbreak:props.frame?.jailbreak || ''})
// 上一次存進去（或讀回來）的值：存好之後不必等頁面把新值傳回來，才不會把剛存的當成沒存。
const frameSaved=reactive({...frameDraft})
// 卡的設定可能在面板打開後才讀回來：讀回自己寫過的破限詞時把進階打開，玩家看得到它在生效。
// 儲存期間父層會先發布候選值、失敗再還原；兩者都不是新的已儲存資料，不能蓋掉草稿。
watch(()=>[props.frame?.sandboxLevel,props.frame?.jailbreak],()=>{if(saving.value)return;frameDraft.sandboxLevel=props.frame?.sandboxLevel || '';frameDraft.jailbreak=props.frame?.jailbreak || '';Object.assign(frameSaved,frameDraft);if(frameDraft.jailbreak)jailbreakOpen.value=true})
// 沒設過就標在「標準」上：破甲永遠有一個正在生效的值，不標出來玩家會以為它沒開。
const frameLevel=computed(()=>frameDraft.sandboxLevel || 'standard')
const frameHint=computed(()=>props.frame?.options.find(o=>o.value===frameLevel.value)?.hint || props.t('chat.sandboxLevelDesc'))
const frameDirty=computed(()=>!!props.frame && (frameDraft.sandboxLevel!==frameSaved.sandboxLevel || frameDraft.jailbreak!==frameSaved.jailbreak))
const customTooLong=computed(()=>[...(draft.value.customStyle || '')].length>1000)
const axes=Object.keys(responseAxes) as ResponseAxis[]
// 自訂預設決定的那幾項整個收起來，連補充說明一起。文風選「自訂」時已經能整段寫，不再給文風補充。
const shownAxes=computed(()=>axes.filter(axis=>!locked.value.includes(axis)))
const noteAxes=computed(()=>shownAxes.value.filter(axis=>!(axis==='style' && selected('style')==='custom')))
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
const responseDirty=computed(()=>!!saved.value && dirty.value)
const canSave=computed(()=>!saving.value && !loading.value && (frameDirty.value || responseDirty.value) && !(responseDirty.value && (invalid.value || error.value==='conflict')))
async function mayClose(){
 if(discardAsked.value){answerDiscard(false);return false}
 return !saving.value && (!(responseDirty.value || frameDirty.value) || await askDiscard())
}
function cancel(){
 if(saving.value)return
 draft.value={...saved.value?.overrides}
 Object.assign(frameDraft,frameSaved)
 emit('close')
}
async function reload(){
 if(loading.value || saving.value || (responseDirty.value && !await askDiscard()))return
 loading.value=true;error.value=''
 try{const value=readResponseSettings(await props.load(props.conversationId),props.conversationId);if(alive){saved.value=value;draft.value={...value.overrides};notesOpen.value=axes.some(axis=>!!value.overrides[responseNoteKeys[axis]])}}
 catch{if(alive)error.value='loadFailed'}finally{if(alive)loading.value=false}
}
// 兩邊各存各的：這張卡那一段走玩家對卡的設定，存檔那一段走存檔偏好。先存卡那一段，
// 失敗就停在面板上，存檔那一段不動。
// 存完才叫頁面關：頁面關之前會先問 mayClose，那時還在「儲存中」就會被擋下，面板停在畫面上。
async function submit(){
 if(!canSave.value)return
 saving.value=true;error.value=''
 let done=false
 try{
  if(frameDirty.value && props.saveFrame){
   const value={sandboxLevel:frameDraft.sandboxLevel,jailbreak:frameDraft.jailbreak}
   if(!await props.saveFrame(value)){if(alive)error.value='saveFailed';return}
   Object.assign(frameSaved,value)
  }
  if(responseDirty.value && saved.value){const value=readResponseSettings(await props.save(props.conversationId,saved.value.revision,lockedPatch(responsePatch(draft.value,base.value),locked.value)),props.conversationId);if(!alive)return;saved.value=value;draft.value={...value.overrides}}
  done=true
 }
 catch(e){if(alive)error.value=((e as {status?:number})?.status ?? (e as {statusCode?:number})?.statusCode)===409?'conflict':'saveFailed'}
 finally{if(alive)saving.value=false}
 if(done && alive)emit('close')
}
// ── 自訂預設 ──────────────────────────────────────────────
const binding=ref<PresetBinding|null>(null),choices=ref<PresetRow[]>([]),presetError=ref('')
// 喜愛與用過：也拿來知道目前套用的那份是不是已不公開（自己的預設不會出現在這裡）
const shelf=ref<PresetRow[]|null>(null)
const currentUnlisted=computed(()=>!!binding.value?.presetId && !!shelf.value?.some(p=>p.id===binding.value!.presetId && !p.listed))
const pickerOpen=ref(false),presetNotice=ref('')
function openPicker(){presetNotice.value='';pickerOpen.value=true}
function closePicker(){pickerOpen.value=false;void nextTick(()=>document.querySelector<HTMLElement>('[data-action="preset-pick"]')?.focus())}
// 選擇器裡套用成功：回到偏好那一層，結果寫在自訂預設那一區
function pickerApplied(message:string){presetNotice.value=message;closePicker()}
// 哪幾項由預設決定以伺服器為準（response-settings 的 presetLocked），不從綁定自己推。
const locked=computed(()=>presetLockedOf(saved.value))
// 破甲強度與破限詞也由預設決定時，整段收起；沒改就不會送，存卡設定時自然不帶這兩鍵
const frameLocked=computed(()=>locked.value.includes('sandboxLevel') || locked.value.includes('jailbreak'))
// 預設的「用工具回覆」也以伺服器為準：active 時這輪整段生成，串流顯示關但玩家自己的設定不動；
// 讀不到版本（unavailable）不能猜開或關，什麼都不說。
const toolReplyStatus=computed(()=>(saved.value as {toolReply?:{status?:string}}|null)?.toolReply?.status ?? 'off')
const toolReplyActive=computed(()=>toolReplyStatus.value==='active')
const toolReplyNote=computed(()=>toolReplyStatus.value==='model_unsupported' ? props.t('responseSettings.preset.toolReply.modelUnsupported')
 : toolReplyStatus.value==='mode_unsupported' ? props.t('responseSettings.preset.toolReply.modeUnsupported') : '')
async function loadPreset(){
 if(!props.presets || props.worldMode)return
 presetError.value=''
 const [b,list,fav]=await Promise.allSettled([props.presets.card(),props.presets.list(),props.presets.shelf ? props.presets.shelf() : Promise.resolve(null)])
 if(!alive)return
 // 重讀失敗就留著上一次讀到的：不讓預設那一區連同錯誤訊息一起消失
 if(b.status==='fulfilled'){try{binding.value=readBinding(b.value)}catch{if(!binding.value)presetError.value=props.t('responseSettings.preset.loadFailed')}}
 else if(!binding.value)presetError.value=props.t('responseSettings.preset.loadFailed')
 choices.value=list.status==='fulfilled' ? readPresetRows(list.value) : []
 shelf.value=fav.status==='fulfilled' && fav.value ? readPresetRows(fav.value) : null
}
// 套用後面板會重讀偏好，沒存的修改會不見：先問
const confirmLeave=async()=>!responseDirty.value || await askDiscard()
async function refreshAfterPreset(){
 try{const value=readResponseSettings(await props.load(props.conversationId),props.conversationId);if(alive){saved.value=value;draft.value={...value.overrides}}}catch{if(alive)error.value='loadFailed'}
 await loadPreset()
}
onMounted(()=>{void reload();void loadPreset()})
// 選擇器開著時按關閉：整個面板一起關（跟偏好那一層一樣先問沒存的修改）；回上一層用選擇器自己的返回
async function mayCloseAll(){const ok=await mayClose();if(ok)pickerOpen.value=false;return ok}
defineExpose({mayClose:mayCloseAll,closePicker})
</script>

<style scoped>
@layer lt-base {
 /* 偏好那一層的外框：不另成一層排版，子元素照樣排在面板裡 */
 .response-settings-main{display:contents}
 .response-discard :deep(.u-popup__content){width:min(440px,calc(100vw - 32px))}
 .response-discard :deep(.u-popup__content__close){display:none}
 .response-discard-body{display:flex;flex-direction:column;gap:16px}
 .response-discard-text{margin:0;font-size:14px;line-height:1.5;text-align:center}
 .response-discard-actions{display:flex;gap:8px}
 .response-discard-keep,.response-discard-ok{flex:1;min-height:44px;padding:8px 12px;border:1px solid var(--lt-canvas-sheet-line);border-radius:var(--lt-canvas-radius);background:var(--lt-canvas-sheet-item-bg);color:var(--lt-canvas-sheet-fg);font:inherit;cursor:pointer}
 .response-discard-ok span{color:var(--lt-canvas-danger);font-weight:600}
 .response-discard-keep:focus-visible,.response-discard-ok:focus-visible{outline:2px solid var(--lt-canvas-accent);outline-offset:2px}
 .response-streaming-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
 .response-streaming-head .label{margin:0}
 /* Preserve the existing track while giving touch/keyboard users a 44px target. */
 .response-streaming :deep(.ms-switch){width:64px;height:44px;border:10px solid transparent;background-clip:padding-box;margin:-10px}
 .response-streaming :deep(.ms-switch:focus-visible){outline:2px solid var(--lt-canvas-accent);outline-offset:-8px}
}
.response-length{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.response-preset{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid var(--lt-canvas-sheet-line)}
.response-preset-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px}
.response-preset-head .label{margin:0}
.response-preset-name{font-weight:600;overflow-wrap:anywhere}
.response-preset-actions{display:flex;flex-wrap:wrap;gap:8px}
/* 原因一句、動作一顆，分開兩行，按鈕用面板既有的藥丸外觀 */
.response-preset-note{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
/* 這幾顆是文字鈕，點擊區撐到 44（手機觸控下限） */
.response-preset .advanced-reset{min-height:44px;padding-inline:4px}
.response-length-value{font-size:14px;font-weight:600}
.response-length-slider{width:100%;margin:0;accent-color:var(--luna-gold, #F5C542)}
.response-length-zones{display:flex;justify-content:space-between;font-size:12px;opacity:.6}
.response-length-zone.selected{opacity:1;font-weight:600}
</style>

<style>
/*
  主行動的字色照畫布量出來的底色走（data-lt-tone）。canvas.css 那條包在 :where() 裡、特異性 0，
  宿主站的 button { color: inherit }（0,0,1）會蓋過它，深色彈層的淺字落在亮色主行動上（QA Q03：1.45:1）。
  這裡只多一個屬性的權重：贏過宿主的 button 重設，但作者卡片指名 .complete-btn 的字色照舊優先
  （同權重時作者的樣式表在後面載入），守住 canvas.css「作者明示 color 永遠贏」的約定。
  只管回覆偏好面板裡的兩顆（儲存、選用預設）；其他彈層的同一個問題另案。
*/
:where(.response-settings .complete-btn)[data-lt-tone="light"]{color:#17171c}
:where(.response-settings .complete-btn)[data-lt-tone="dark"]{color:#e8eaed}
:where(.response-settings .complete-btn[data-lt-contrast="high"])[data-lt-tone="light"]{color:#000}
:where(.response-settings .complete-btn[data-lt-contrast="high"])[data-lt-tone="dark"]{color:#fff}
</style>
