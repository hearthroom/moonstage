<template>
 <section class="response-settings conv-style-modal" data-host="style" data-lt="response-settings" :aria-busy="loading || saving">
  <header class="cs-modal-header">
   <button type="button" class="cs-header-left response-reset" :disabled="saving" @click="$emit('close')">{{ t('main.cancel') }}</button>
   <div class="cs-header-center"><h2 class="cs-header-title">{{ t('responseSettings.title') }}</h2></div>
   <div class="cs-header-right">
    <button v-if="saved" type="button" class="confirm-btn response-save" data-action="save" :disabled="!dirty || invalid || loading || saving || error === 'conflict'" @click="submit">
     {{ t(saving ? 'responseSettings.saving' : 'responseSettings.save') }}
    </button>
   </div>
  </header>
  <p class="response-hint">{{ t('responseSettings.scope') }}</p>
  <p v-if="loading" role="status">{{ t('responseSettings.loading') }}</p>
  <div v-if="error" role="alert" class="response-error">
   <p>{{ t(`responseSettings.${error}`) }}</p>
   <button type="button" data-action="reload" :disabled="loading || saving" @click="reload">{{ t('responseSettings.reload') }}</button>
  </div>
  <template v-if="saved">
   <div class="cs-modal-content"><div class="response-fields outer-scroll-view">
    <div v-for="(options, axis) in responseAxes" :key="axis" class="cs-group-card">
     <fieldset class="section behavior-section" :disabled="loading || saving">
      <legend class="cs-section-header"><span class="cs-title-row"><span class="cs-section-title">{{ t(`responseSettings.axes.${axis}`) }}</span></span></legend>
      <p v-if="axis === 'agency'" class="response-hint cs-section-subtitle">{{ t('responseSettings.agencyHint') }}</p>
      <div class="cs-collapsible is-open"><div class="cs-content-inner"><div class="sub-section cs-style-section">
       <div class="style-scroll-view"><div class="response-options cs-style-grid" :class="{ 'response-agency-options': axis === 'agency' }">
        <button v-for="option in options" :key="option" type="button" class="cs-style-item" :data-axis="axis" :data-value="option"
         :class="{ active: (draft[axis] ?? responseDefaults[axis]) === option }"
         :aria-label="t(`responseSettings.options.${axis}.${option}`)"
         :aria-describedby="axis === 'agency' ? `response-agency-${conversationId}-${option}` : undefined"
         :aria-pressed="(draft[axis] ?? responseDefaults[axis]) === option" @click="choose(axis, option)">
         <span class="style-label">{{ t(`responseSettings.options.${axis}.${option}`) }}</span>
         <span v-if="axis === 'agency'" :id="`response-agency-${conversationId}-${option}`" class="response-option-hint">{{ t(`responseSettings.agencyHints.${option}`) }}</span>
        </button>
       </div></div>
       <label v-if="axis === 'style' && draft.style === 'custom'" class="response-custom cs-custom-input">
        <span>{{ t('responseSettings.customLabel') }}</span>
        <textarea v-model="draft.customStyle" class="cs-custom-textarea" rows="3" :aria-invalid="customTooLong" />
        <span class="char-count" :class="{ 'response-error': customTooLong }">{{ t('responseSettings.customCount', { count: [...(draft.customStyle || '')].length }) }}</span>
       </label>
      </div></div></div>
      <p v-if="axis === 'length'" class="response-hint">{{ t('responseSettings.lengthHint') }}</p>
      <p v-if="axis === 'perspective' && draft.perspective === 'first_character'" class="response-hint">{{ t('responseSettings.firstPersonHint') }}</p>
      <button v-if="draft[axis] !== undefined" type="button" class="response-reset" @click="reset(axis)">{{ t('responseSettings.reset') }}</button>
     </fieldset>
    </div>
   </div></div>
   <footer class="response-footer"><p class="response-hint" role="status">{{ t(savedNotice ? 'responseSettings.saved' : 'responseSettings.nextReply') }}</p></footer>
  </template>
 </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { readResponseSettings, responseAxes, responseDefaults, responsePatch, type ResponseAxis, type ResponseDraft, type ResponseSettings } from '../canvas-response-settings'
const props=defineProps<{
 conversationId:string
 load:(id:string)=>Promise<unknown>
 save:(id:string,revision:number,patch:Record<string,string|null>)=>Promise<unknown>
 t:(key:string, values?:Record<string,unknown>)=>string
 confirm:(content:string)=>Promise<boolean>
}>()
defineEmits<{ (e: 'close'): void }>()
const saved=ref<ResponseSettings|null>(null),draft=ref<ResponseDraft>({}),loading=ref(false),saving=ref(false),error=ref(''),savedNotice=ref(false)
let alive=true
onBeforeUnmount(()=>{alive=false})
const dirty=computed(()=>JSON.stringify(responsePatch(draft.value))!==JSON.stringify(responsePatch(saved.value?.overrides || {})))
const customTooLong=computed(()=>[...(draft.value.customStyle || '')].length>1000)
const invalid=computed(()=>draft.value.style==='custom' && (!draft.value.customStyle?.trim() || customTooLong.value))
function choose(axis:ResponseAxis,value:string){draft.value[axis]=value;if(axis==='style' && value!=='custom')delete draft.value.customStyle;savedNotice.value=false}
function reset(axis:ResponseAxis){delete draft.value[axis];if(axis==='style')delete draft.value.customStyle;savedNotice.value=false}
async function mayClose(){return !saving.value && (!dirty.value || await props.confirm(props.t('responseSettings.discard')))}
async function reload(){
 if(loading.value || saving.value || (dirty.value && !await mayClose()))return
 loading.value=true;error.value=''
 try{const value=readResponseSettings(await props.load(props.conversationId),props.conversationId);if(alive){saved.value=value;draft.value={...value.overrides}}}
 catch{if(alive)error.value='loadFailed'}finally{if(alive)loading.value=false}
}
async function submit(){
 if(!saved.value || !dirty.value || invalid.value || loading.value || saving.value || error.value==='conflict')return
 saving.value=true;error.value=''
 try{const value=readResponseSettings(await props.save(props.conversationId,saved.value.revision,responsePatch(draft.value)),props.conversationId);if(alive){saved.value=value;draft.value={...value.overrides};savedNotice.value=true}}
 catch(e){if(alive)error.value=((e as {status?:number})?.status ?? (e as {statusCode?:number})?.statusCode)===409?'conflict':'saveFailed'}finally{if(alive)saving.value=false}
}
onMounted(reload)
defineExpose({mayClose})
</script>
