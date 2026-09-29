import { expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Panel from '../components/canvas-response-settings.vue'
import { lengthTargetLadder, lengthTargetOf, readResponseSettings } from '../canvas-response-settings'

const initial = () => ({conversationId:'c1',scope:'conversation',schemaVersion:1,revision:0,overrides:{},effective:{agency:'protect',style:'card',perspective:'card',length:'auto',pace:'natural'}})
const echo = () => vi.fn().mockImplementation(async (_id, rev, patch)=>({...initial(),revision:rev+1,overrides:Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==null))}))
const pill = (wrapper:any, axis:string, value:string) => wrapper.get(`.mode-item[data-axis="${axis}"][data-value="${value}"]`)

// 跟「用戶人設」同一套版面：每一項一張卡、一排藥丸，作者替人設頁寫的美化在這裡同樣生效。
it('uses the persona panel layout with one card and one selected pill per setting', async () => {
 const wrapper=mount(Panel,{props:{conversationId:'c1',load:async()=>initial(),save:vi.fn(),t:(k:string)=>k}})
 await flushPromises()
 expect(wrapper.element.matches('.role-setting.response-settings[data-lt="response-settings"]')).toBe(true)
 expect(wrapper.get('.header-scope .page-title').text()).toBe('responseSettings.title')
 expect(wrapper.findAll('.card.mode-box')).toHaveLength(5)
 expect(wrapper.findAll('.mode-item.selected')).toHaveLength(5)
 await pill(wrapper,'agency','coauthor').trigger('click')
 expect(wrapper.get('.mode-item[data-axis="agency"].selected').attributes('data-value')).toBe('coauthor')
 expect(pill(wrapper,'agency','coauthor').attributes('aria-checked')).toBe('true')
 expect(wrapper.get('.role-setting__actions .complete-btn').attributes('data-action')).toBe('save')
 await pill(wrapper,'style','custom').trigger('click')
 expect(wrapper.find('.response-custom .response-custom-input').exists()).toBe(true)
 wrapper.unmount()
})

// 底下那句只解釋「目前選的那一個」，換選項就換說明；不再每個選項各掛一段。
it('explains only the selected option under each setting', async () => {
 const wrapper=mount(Panel,{props:{conversationId:'c1',load:async()=>initial(),save:vi.fn(),t:(k:string)=>k}})
 await flushPromises()
 expect(wrapper.get('[data-hint="agency"]').text()).toBe('responseSettings.agencyHints.protect')
 for(const value of ['assist','lines','coauthor']) {
  await pill(wrapper,'agency',value).trigger('click')
  expect(wrapper.get('[data-hint="agency"]').text()).toBe(`responseSettings.agencyHints.${value}`)
 }
 await pill(wrapper,'perspective','third_limited').trigger('click')
 expect(wrapper.get('[data-hint="perspective"]').text()).toBe('responseSettings.perspectiveHints.third_limited')
 expect(wrapper.get('[data-hint="pace"]').text()).toBe('responseSettings.paceHints.natural')
 expect(wrapper.get('[data-hint="length"]').text()).toBe('responseSettings.lengthHints.auto')
 expect(wrapper.find('[data-hint="style"]').exists()).toBe(false)
 expect(wrapper.findAll('.response-option-hint')).toHaveLength(0)
})

it('saves independent axes, clears hidden custom text and closes after the server confirms', async () => {
 const save=echo()
 const wrapper=mount(Panel,{props:{conversationId:'c1',load:async()=>initial(),save,t:(k:string)=>k}})
 await flushPromises()
 await pill(wrapper,'agency','coauthor').trigger('click')
 await pill(wrapper,'perspective','second_user').trigger('click')
 await pill(wrapper,'style','custom').trigger('click')
 await wrapper.get('.response-custom-input').setValue('Sparse prose')
 await pill(wrapper,'style','guided').trigger('click')
 expect(wrapper.find('.response-custom-input').exists()).toBe(false)
 await wrapper.get('[data-action="save"]').trigger('click');await flushPromises()
 expect(save).toHaveBeenCalledWith('c1',0,expect.objectContaining({agency:'coauthor',perspective:'second_user',style:'guided',customStyle:null}))
 expect(wrapper.emitted('close')).toHaveLength(1)
})

it('keeps draft on conflict and never saves assumed defaults after failed load', async()=>{
 const load=vi.fn().mockRejectedValue(new Error('offline'))
 const save=vi.fn().mockRejectedValue({statusCode:409})
 const wrapper=mount(Panel,{props:{conversationId:'c1',load,save,t:(k:string)=>k}})
 await flushPromises()
 expect(wrapper.find('[data-action="save"]').exists()).toBe(false)
 load.mockResolvedValue(initial())
 await wrapper.get('[data-action="reload"]').trigger('click');await flushPromises()
 await pill(wrapper,'agency','assist').trigger('click')
 await wrapper.get('[data-action="save"]').trigger('click');await flushPromises()
 expect(wrapper.get('[role="alert"]').text()).toContain('conflict')
 expect(pill(wrapper,'agency','assist').attributes('aria-checked')).toBe('true')
 expect(wrapper.emitted('close')).toBeUndefined()
})

it('keeps edits when close is cancelled and validates Unicode style length', async()=>{
 const wrapper=mount(Panel,{props:{conversationId:'c1',load:async()=>initial(),save:vi.fn(),t:(k:string)=>k}})
 await flushPromises()
 await pill(wrapper,'style','custom').trigger('click')
 await wrapper.get('.response-custom-input').setValue('🌙'.repeat(1000))
 expect(wrapper.get('[data-action="save"]').attributes('disabled')).toBeUndefined()
 const closing=(wrapper.vm as any).mayClose()
 await flushPromises()
 await wrapper.get('[data-action="keep-editing"]').trigger('click')
 expect(await closing).toBe(false)
 expect(wrapper.get('.response-discard').attributes('hidden')).toBeDefined()
 await wrapper.get('.response-custom-input').setValue('🌙'.repeat(1001))
 expect(wrapper.get('[data-action="save"]').attributes('disabled')).toBeDefined()
 expect((wrapper.get('.response-custom-input').element as HTMLTextAreaElement).value.length).toBe(2002)
})

// 面板在瀏覽器 top layer 裡，系統對話框（uni.showModal）永遠畫在它底下、按不到；
// 放棄確認必須長在面板自己裡面。
it('asks to discard inside the panel, not through a system dialog', async()=>{
 const wrapper=mount(Panel,{props:{conversationId:'c1',load:async()=>initial(),save:vi.fn(),t:(k:string)=>k}})
 await flushPromises()
 expect(wrapper.get('.response-discard').attributes('hidden')).toBeDefined()
 expect(await (wrapper.vm as any).mayClose()).toBe(true)
 await pill(wrapper,'agency','assist').trigger('click')
 const closing=(wrapper.vm as any).mayClose()
 await flushPromises()
 const bar=wrapper.get('.response-discard')
 expect(bar.attributes('hidden')).toBeUndefined()
 expect(bar.text()).toContain('responseSettings.discard')
 await bar.get('[data-action="discard"]').trigger('click')
 expect(await closing).toBe(true)
})

// 補充說明是進階用法：收在底部的「進階」，預設收起；範例跟著目前選項走，補充一起保存。
it('keeps per-setting notes under a collapsed advanced section guided by the selected option', async()=>{
 const save=echo()
 const wrapper=mount(Panel,{props:{conversationId:'c1',load:async()=>initial(),save,t:(k:string)=>k}})
 await flushPromises()
 expect(wrapper.get('.advanced-body').attributes('hidden')).toBeDefined()
 await wrapper.get('[data-action="toggle-notes"]').trigger('click')
 expect(wrapper.get('.advanced-body').attributes('hidden')).toBeUndefined()
 expect(wrapper.findAll('.response-note-input')).toHaveLength(5)
 expect(wrapper.get('.advanced-body').text()).toContain('responseSettings.noteHint')
 await pill(wrapper,'agency','lines').trigger('click')
 const note=wrapper.get('.response-note-input[data-axis="agency"]')
 expect(note.attributes('placeholder')).toBe('responseSettings.noteExamples.agency.lines')
 await pill(wrapper,'agency','coauthor').trigger('click')
 expect(note.attributes('placeholder')).toBe('responseSettings.noteExamples.agency.coauthor')
 await note.setValue('字'.repeat(201))
 expect(wrapper.get('[data-action="save"]').attributes('disabled')).toBeDefined()
 await note.setValue('  Never accept invitations for me  ')
 await wrapper.get('[data-action="save"]').trigger('click');await flushPromises()
 expect(save).toHaveBeenCalledWith('c1',0,expect.objectContaining({agency:'coauthor',agencyNote:'Never accept invitations for me',paceNote:null}))
})

it('opens saved notes, clears blank notes and hides the style note for custom style', async()=>{
 const save=echo()
 const withNote={...initial(),revision:1,overrides:{pace:'advance',paceNote:'Skip at most half a day'}}
 const wrapper=mount(Panel,{props:{conversationId:'c1',load:async()=>withNote,save,t:(k:string)=>k}})
 await flushPromises()
 expect(wrapper.get('.advanced-body').attributes('hidden')).toBeUndefined()
 expect((wrapper.get('.response-note-input[data-axis="pace"]').element as HTMLTextAreaElement).value).toBe('Skip at most half a day')
 await pill(wrapper,'style','custom').trigger('click')
 expect(wrapper.find('.response-note-input[data-axis="style"]').exists()).toBe(false)
 await pill(wrapper,'style','card').trigger('click')
 await wrapper.get('.response-note-input[data-axis="pace"]').setValue('   ')
 await wrapper.get('[data-action="save"]').trigger('click');await flushPromises()
 expect(save).toHaveBeenLastCalledWith('c1',1,expect.objectContaining({pace:'advance',paceNote:null}))
})

it('resets every setting and note back to default in one step', async()=>{
 const save=echo()
 const custom={...initial(),revision:1,overrides:{agency:'lines',length:'brief',lengthNote:'Longer fights'}}
 const wrapper=mount(Panel,{props:{conversationId:'c1',load:async()=>custom,save,t:(k:string)=>k}})
 await flushPromises()
 expect(wrapper.findAll('.response-reset')).toHaveLength(0)
 await wrapper.get('[data-action="reset-all"]').trigger('click')
 expect(wrapper.get('.mode-item[data-axis="agency"].selected').attributes('data-value')).toBe('protect')
 expect(wrapper.get('[data-action="reset-all"]').attributes('hidden')).toBeDefined()
 await wrapper.get('[data-action="save"]').trigger('click');await flushPromises()
 expect(save).toHaveBeenLastCalledWith('c1',1,expect.objectContaining({agency:null,length:null,lengthNote:null}))
})

// 篇幅要麼自動，要麼拖滑桿指定字數。滑桿只停在刻度上，存下去的是刻度值；
// 切回自動就不再送字數。
it('offers automatic length or a slider on the ladder', async()=>{
 const save=echo()
 const wrapper=mount(Panel,{props:{conversationId:'c1',load:async()=>initial(),save,t:(k:string,v?:Record<string,unknown>)=>v?`${k}:${JSON.stringify(v)}`:k}})
 await flushPromises()
 expect(wrapper.find('.response-length-slider').exists()).toBe(false)
 expect(wrapper.get('[data-hint="length"]').text()).toBe('responseSettings.lengthHints.auto')
 await pill(wrapper,'length','target').trigger('click')
 const slider=wrapper.get('.response-length-slider')
 expect((slider.element as HTMLInputElement).value).toBe(String(lengthTargetLadder.indexOf(800)))
 expect(wrapper.get('.response-length-value').text()).toBe('responseSettings.lengthValue:{"count":800}')
 expect(wrapper.get('[data-hint="length"]').text()).toBe('responseSettings.lengthHints.balanced')
 await slider.setValue(String(lengthTargetLadder.indexOf(2000)))
 expect(wrapper.get('.response-length-value').text()).toBe('responseSettings.lengthValue:{"count":2000}')
 expect(wrapper.get('[data-hint="length"]').text()).toBe('responseSettings.lengthHints.detailed')
 await slider.setValue(String(lengthTargetLadder.indexOf(10000)))
 expect(wrapper.get('[data-hint="length"]').text()).toBe('responseSettings.lengthHints.long')
 await wrapper.get('[data-action="save"]').trigger('click');await flushPromises()
 expect(save).toHaveBeenLastCalledWith('c1',0,expect.objectContaining({length:'target',lengthTarget:'10000'}))
 await pill(wrapper,'length','auto').trigger('click')
 expect(wrapper.find('.response-length-slider').exists()).toBe(false)
 await wrapper.get('[data-action="save"]').trigger('click');await flushPromises()
 expect(save).toHaveBeenLastCalledWith('c1',1,expect.objectContaining({length:'auto',lengthTarget:null}))
})

// 舊存檔的「簡短／適中／詳細」顯示成滑桿上對應的字數；一拖就換成指定字數。
it('shows a legacy length option as its slider position', async()=>{
 const save=echo()
 const legacy={...initial(),revision:1,overrides:{length:'detailed'},effective:{...initial().effective,length:'detailed'}}
 const wrapper=mount(Panel,{props:{conversationId:'c1',load:async()=>legacy,save,t:(k:string)=>k}})
 await flushPromises()
 expect(pill(wrapper,'length','target').attributes('aria-checked')).toBe('true')
 expect((wrapper.get('.response-length-slider').element as HTMLInputElement).value).toBe(String(lengthTargetLadder.indexOf(1500)))
 expect(wrapper.get('[data-action="save"]').attributes('disabled')).toBeDefined()
 await wrapper.get('.response-length-slider').setValue(String(lengthTargetLadder.indexOf(3000)))
 await wrapper.get('[data-action="save"]').trigger('click');await flushPromises()
 expect(save).toHaveBeenLastCalledWith('c1',1,expect.objectContaining({length:'target',lengthTarget:'3000'}))
})

it('validates length targets in settings responses', ()=>{
 const ok={...initial(),overrides:{length:'target',lengthTarget:'800'},effective:{...initial().effective,length:'target',lengthTarget:800}}
 expect(readResponseSettings(ok,'c1').effective.lengthTarget).toBe(800)
 expect(()=>readResponseSettings({...ok,effective:{...ok.effective,lengthTarget:850}},'c1')).toThrow()
 expect(()=>readResponseSettings({...ok,overrides:{lengthTarget:'800'}},'c1')).toThrow()
 expect(()=>readResponseSettings({...ok,overrides:{length:'target'}},'c1')).toThrow()
 expect(readResponseSettings({...initial(),effective:{...initial().effective,length:'brief'}},'c1').effective.length).toBe('brief')
 expect(lengthTargetOf({length:'balanced'})).toBe(800)
 expect(lengthTargetOf({length:'target',lengthTarget:'2500'})).toBe(2500)
})
