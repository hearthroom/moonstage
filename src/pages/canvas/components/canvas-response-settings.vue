<template>
 <section class="response-settings" :aria-busy="loading || saving">
  <h2>{{ t('responseSettings.title') }}</h2>
  <p class="response-hint">{{ t('responseSettings.scope') }}</p>
  <p v-if="loading" role="status">{{ t('responseSettings.loading') }}</p>
  <div v-if="error" role="alert" class="response-error">
   <p>{{ t(`responseSettings.${error}`) }}</p>
   <button type="button" data-action="reload" :disabled="loading || saving" @click="reload">{{ t('responseSettings.reload') }}</button>
  </div>
  <template v-if="saved">
   <div class="response-fields">
   <fieldset v-for="(options, axis) in responseAxes" :key="axis" :disabled="loading || saving">
    <legend>{{ t(`responseSettings.axes.${axis}`) }}</legend>
    <div class="response-options">
     <button v-for="option in options" :key="option" type="button" :data-axis="axis" :data-value="option"
      :aria-pressed="(draft[axis] ?? responseDefaults[axis]) === option" @click="choose(axis, option)">
      {{ t(`responseSettings.options.${axis}.${option}`) }}
     </button>
    </div>
    <p v-if="axis === 'agency'" class="response-hint">{{ t(`responseSettings.agencyHints.${draft.agency ?? 'protect'}`) }}</p>
    <p v-if="axis === 'length'" class="response-hint">{{ t('responseSettings.lengthHint') }}</p>
    <p v-if="axis === 'perspective' && draft.perspective === 'first_character'" class="response-hint">{{ t('responseSettings.firstPersonHint') }}</p>
    <label v-if="axis === 'style' && draft.style === 'custom'" class="response-custom">
     <span>{{ t('responseSettings.customLabel') }}</span>
     <textarea v-model="draft.customStyle" rows="3" :aria-invalid="customTooLong" />
     <span :class="{ 'response-error': customTooLong }">{{ t('responseSettings.customCount', { count: [...(draft.customStyle || '')].length }) }}</span>
    </label>
    <button v-if="draft[axis] !== undefined" type="button" class="response-reset" @click="reset(axis)">{{ t('responseSettings.reset') }}</button>
   </fieldset>
   </div>
   <footer>
    <p class="response-hint" role="status">{{ t(savedNotice ? 'responseSettings.saved' : 'responseSettings.nextReply') }}</p>
    <button type="button" class="response-save" data-action="save" :disabled="!dirty || invalid || loading || saving || error === 'conflict'" @click="submit">
     {{ t(saving ? 'responseSettings.saving' : 'responseSettings.save') }}
    </button>
   </footer>
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

<style scoped>
.response-settings { display:flex; flex-direction:column; gap:var(--luna-s-4,16px); padding:0; box-sizing:border-box; color:var(--lt-canvas-fg); max-height:76dvh; overflow:hidden; }
h2 { font-size:1.125rem; font-weight:600; padding-right:var(--luna-s-7,32px); margin:0; }
p { margin:0; }
.response-fields { min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:var(--luna-s-4,16px); padding:2px; }
fieldset { min-width:0; border:0; padding:0; margin:0; display:flex; flex-direction:column; gap:var(--luna-s-2,8px); }
legend { font-size:.875rem; font-weight:600; margin-bottom:var(--luna-s-2,8px); }
.response-options { display:flex; flex-wrap:wrap; gap:var(--luna-s-2,8px); }
button { font:inherit; font-size:.875rem; min-height:44px; padding:var(--luna-s-2,8px) var(--luna-s-3,12px); border:1px solid var(--lt-canvas-sheet-line); border-radius:var(--luna-r-pill,9999px); color:inherit; background:var(--lt-canvas-sheet-item-bg); cursor:pointer; white-space:normal; }
button[aria-pressed="true"] { border-color:var(--lt-canvas-accent); background:var(--lt-canvas-sheet-item-bg); box-shadow:inset 0 0 0 1px var(--lt-canvas-accent); }
button:focus-visible, textarea:focus-visible { outline:2px solid var(--lt-canvas-accent); outline-offset:2px; }
button:disabled { opacity:.5; cursor:default; }
.response-hint,.response-custom span { color:var(--lt-canvas-muted); font-size:.8125rem; line-height:1.5; }
.response-reset { align-self:flex-start; border-color:transparent; background:transparent; color:var(--lt-canvas-muted); min-height:44px; padding:0 var(--luna-s-2,8px); }
.response-custom { display:flex; flex-direction:column; gap:var(--luna-s-2,8px); }
textarea { width:100%; box-sizing:border-box; resize:vertical; border:1px solid var(--lt-canvas-sheet-line); border-radius:var(--lt-canvas-radius); background:var(--lt-canvas-sheet-item-bg); color:inherit; font:inherit; padding:var(--luna-s-3,12px); }
.response-error { color:var(--lt-canvas-danger); display:grid; gap:var(--luna-s-2,8px); }
footer { flex-shrink:0; display:flex; align-items:center; flex-wrap:wrap; gap:var(--luna-s-3,12px); padding-bottom:env(safe-area-inset-bottom); }
footer p { flex:1; min-width:10rem; }
.response-save { background:var(--lt-canvas-accent); color:var(--lt-canvas-accent-fg); border-color:transparent; font-weight:600; }
</style>
