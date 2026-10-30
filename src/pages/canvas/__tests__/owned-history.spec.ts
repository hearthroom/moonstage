import {describe,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import ts from 'typescript'
import {computed,ref} from 'vue'

const canvas=readFileSync('src/pages/canvas/canvas.vue','utf8')
const script=canvas.slice(canvas.indexOf('<script setup lang="ts">')+24,canvas.indexOf('</script>'))
const tree=ts.createSourceFile('canvas.ts',script,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
function actual(name:string, ctx:any){
 const node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(tree)===name))
 if(!node)throw Error(`Missing actual handler ${name}`)
 const js=ts.transpileModule(node.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 return runInNewContext(`${js}; ${name}`,ctx)
}
describe('owned read-only admission in actual canvas handlers',()=>{
 for(const name of ['send','sendWebSocketMessage','sendQueuedChatPayload','resumeAgentOperation','doReiteration','doContinue','onAssist','onCanvasSend','restartConversationFromScratch','startPendingGreeting']){
  it(`${name} leaves draft and canonical timeline intact without transport or start`,async()=>{
   const content=ref('Keep my draft'),talkList=ref([{id:'saved',content:'Saved history'}])
   const ctx={canGenerate:ref(false),content,talkList}
   await actual(name,ctx)({},0)
   expect(content.value).toBe('Keep my draft');expect(talkList.value).toEqual([{id:'saved',content:'Saved history'}])
  })
 }
 for(const access of [{canGenerate:true,reason:''},{canGenerate:false,reason:'author_private'},{canGenerate:false,reason:'restricted'}]){
 it(`owned bootstrap preserves generation capability ${JSON.stringify(access)} without detail/start/greeting`,async()=>{
  const get=vi.fn(async()=>({statusCode:200,data:{conversationId:'conv',roleId:'old',title:'Saved title',...access}}))
  const history=vi.fn(),mark=vi.fn()
  const ctx:any={_this:{http:{get},requestUrl:{ownedConversation:'/owned'}}, roleId:ref(''),conversationId:ref(''),historyConversation:ref(false),historyTitle:ref(''),
   ownedHistoryMode:ref(false),authorAssetSettled:ref(false),conversationAccess:ref({canGenerate:true}),pendingGreetingStart:ref(false),formData:{},ajax:ref({flag:false,page:2}),
   ROLE_SETTINGS_DEFAULTS:{},conversationRole:ref(''),setCurrentRoleId:vi.fn(),getHistoryMsg:history,contentReady:{mark},unref:(r:any)=>r.value,uni:{$emit:vi.fn()},message:{error:vi.fn()},t:(s:string)=>s,
   ensureRoleSettings:vi.fn(async()=>{}),loadModelCatalog:vi.fn(),loadMultiPassPreference:vi.fn(),content:ref('Kept draft'),
   hasLogin:ref(true),isTimelineMutationBlocked:()=>false,onCanvasSend:vi.fn(),archivesFull:ref(false),onConfirmStartNewConversation:vi.fn(),
   talkList:ref([]),actionBtnState:ref('send'),menuEditing:ref(false),menuIndex:ref(0),roleView:ref({}),modelGroups:ref([]),sandboxCard:ref(false),
   convertPlainText:(v:string)=>v,displayScript:'',previewOnly:ref(false),menuDraft:ref(''),selectedVariantValue:ref(''),archiveRows:ref([]),
   asPersonaMode:(v:any)=>v,personaLabels:ref({}),effectivePersonaFields:()=>({userName:'',userSex:'',userDefine:''}),personaSexOptions:ref([]),moreItems:ref([])}
  ctx.normalizeConversationAccess=actual('normalizeConversationAccess',ctx)
  ctx.canGenerate=actual('canGenerate',{computed,conversationAccess:ctx.conversationAccess})
  await actual('bootOwnedHistory',ctx)('old','conv')
  expect(get).toHaveBeenCalledTimes(1);expect(history).toHaveBeenCalledTimes(1)
  expect(ctx.conversationId.value).toBe('conv');expect(ctx.roleId.value).toBe('old');expect(ctx.conversationRole.value).toBe('old')
  expect(ctx.historyTitle.value).toBe('Saved title');expect(ctx.ownedHistoryMode.value).toBe(true);expect(ctx.authorAssetSettled.value).toBe(true)
  expect(ctx.conversationAccess.value).toEqual(access)
  expect(ctx.canGenerate.value).toBe(access.canGenerate)
  expect(mark).toHaveBeenCalledTimes(access.canGenerate?0:1)
  expect(ctx.ensureRoleSettings).toHaveBeenCalledTimes(access.canGenerate?2:0)
  await vi.waitFor(()=>{
   expect(ctx.loadModelCatalog).toHaveBeenCalledTimes(access.canGenerate?1:0)
   expect(ctx.loadMultiPassPreference).toHaveBeenCalledTimes(access.canGenerate?1:0)
  })
  const host=actual('buildHudHost',ctx)()
  expect(host.read().readOnly).toBe(!access.canGenerate)
  expect(host.read().inputText).toBe('Kept draft')
  expect(host.sendMessage('Continue the saved story')).toBe(access.canGenerate)
  expect(ctx.onCanvasSend).toHaveBeenCalledTimes(access.canGenerate?1:0)
  expect(ctx.content.value).toBe(access.canGenerate?'Continue the saved story':'Kept draft')
  if(access.canGenerate){
   expect(host.createConversation()).toBe(true)
   expect(ctx.onConfirmStartNewConversation).toHaveBeenCalledTimes(1)
  }
 })
 }
})

describe('owned policy refresh after a failed admission',()=>{
 function harness(response:any){
  const ctx:any={_this:{http:{get:vi.fn(async()=>response)},requestUrl:{ownedConversation:'/owned'}},conversationId:ref('conv'),roleId:ref('old'),settingsRoleId:ref('old'),
   conversationAccess:ref({canGenerate:true,reason:''}),accessInterrupted:ref(false),accessRejected:ref(false),content:ref(''),unref:(r:any)=>r.value,
   normalizeConversationAccess:(v:any)=>({canGenerate:v.canGenerate===true,reason:v.reason})}
  return {ctx,run:actual('refreshConversationAccess',ctx)}
 }
 it('uses confirmed author_private and restores a retained draft without replacing new typing',async()=>{
  const {ctx,run}=harness({statusCode:200,data:{conversationId:'conv',roleId:'old',canGenerate:false,reason:'author_private'}})
  await run('Retained draft',true)
  expect(ctx.conversationAccess.value.reason).toBe('author_private');expect(ctx.content.value).toBe('Retained draft');expect(ctx.accessInterrupted.value).toBe(true)
  ctx.content.value='New typing';await run('Earlier draft',true);expect(ctx.content.value).toBe('New typing')
 })
 it('keeps generic failures and stale conversation responses out of private state',async()=>{
  for(const response of [{statusCode:503},{statusCode:200,data:{conversationId:'another',roleId:'old',canGenerate:false,reason:'author_private'}}]){
   const {ctx,run}=harness(response);await run('Draft',true)
   expect(ctx.conversationAccess.value.canGenerate).toBe(true);expect(ctx.accessInterrupted.value).toBe(false)
  }
 })
})
