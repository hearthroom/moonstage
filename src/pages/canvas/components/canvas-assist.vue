<script setup lang="ts">
defineProps<{ choices:string[]; busy:boolean; confirming:boolean; error:string; labels:Record<string,string> }>()
defineEmits<{ (e:'confirm'):void; (e:'cancel'):void; (e:'refresh'):void; (e:'pick',index:number):void }>()
</script>
<template>
  <section class="assist-scope" :aria-busy="busy">
    <template v-if="confirming">
      <p>{{ labels.confirm }}</p>
      <div class="assist-actions"><button type="button" @click="$emit('confirm')">{{ labels.generate }}</button><button type="button" @click="$emit('cancel')">{{ labels.cancel }}</button></div>
    </template>
    <template v-else>
      <p v-if="busy" role="status">{{ labels.loading }}</p>
      <p v-else>{{ labels.hint }}</p>
      <p v-if="error" role="alert">{{ error === 'insufficient_credits' || error === 'insufficient_balance' ? labels.insufficient : labels.failed }}</p>
      <button v-for="(choice,i) in choices" :key="i" type="button" class="assist-choice" :disabled="busy" @click="$emit('pick',i)">{{ choice }}</button>
      <button v-if="!busy" type="button" class="assist-refresh" @click="$emit('refresh')">{{ choices.length ? labels.refresh : labels.retry }}</button>
    </template>
  </section>
</template>
<style scoped>
.assist-scope { display:grid; gap:12px; color:var(--canvas-text, inherit); }
.assist-scope p { margin:0; font-size:14px; line-height:1.6; }
.assist-scope button { min-height:44px; padding:10px 14px; border:1px solid var(--canvas-border, #80808060); border-radius:12px; background:var(--canvas-surface, #80808018); color:inherit; font:inherit; cursor:pointer; overflow-wrap:anywhere; }
.assist-scope button:focus-visible { outline:2px solid currentColor; outline-offset:2px; }
.assist-choice { text-align:start; line-height:1.6; }
.assist-actions { display:flex; flex-wrap:wrap; gap:8px; }
.assist-refresh { justify-self:start; }
.assist-scope button:disabled { opacity:.6; cursor:wait; }
</style>
