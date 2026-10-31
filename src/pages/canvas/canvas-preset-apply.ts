// 套用／取消套用自訂預設的唯一一條路：回覆偏好的那一區、選擇器、預設庫抽屜都走這裡，
// 衝突重讀、結果未知時重讀判斷、選的那份已刪除時重讀清單，處理都一樣，不各寫一份。
import { ref, type Ref } from 'vue'
import { applyOnce, presetFailure, readBinding, type PresetApi, type PresetBinding } from './canvas-preset'

export interface PresetTarget { id: string; title: string }

export function usePresetApply(opts: {
 api: () => PresetApi
 binding: Ref<PresetBinding | null>
 t: (key: string, values?: Record<string, unknown>) => string
 /** 套用前問一下有沒有沒存的修改（套用後面板會重讀，沒存的會不見） */
 confirmLeave?: () => Promise<boolean>
 /** 這張卡套用的預設變了（自己套用成功，或衝突重讀發現別處改過） */
 onChanged: () => void
 /** 選的那份已經不能選了（刪除）：重讀清單 */
 onStale: () => void
}) {
 const busy = ref(false)
 const message = ref('')
 const failed = ref(false)

 function fail(err: unknown) {
  const kind = presetFailure(err)
  failed.value = kind !== 'unknown'
  message.value = opts.t(kind === 'failed' ? 'responseSettings.saveFailed' : kind === 'loadFailed' ? 'responseSettings.preset.loadFailed' : `responseSettings.preset.${kind}`)
 }

 /** 重讀這張卡現在套用的（被別處改了、或送出後一直沒收到回應）。讀不到就留著原本的。 */
 async function reread(): Promise<PresetBinding | null> {
  try { opts.binding.value = readBinding(await opts.api().card()) } catch { /* 留著原本的 */ }
  return opts.binding.value
 }

 /** 套用 target；null 是取消套用。成功回 true。 */
 async function apply(target: PresetTarget | null): Promise<boolean> {
  const now = opts.binding.value
  if (!now || busy.value) return false
  if (opts.confirmLeave && !await opts.confirmLeave()) return false
  busy.value = true
  message.value = ''
  failed.value = false
  const done = () => target ? opts.t('responseSettings.preset.applied', { name: target.title }) : opts.t('responseSettings.preset.reverted')
  try {
   await applyOnce((key) => opts.api().apply(target?.id ?? null, now.bindingVersion, key), () => { message.value = opts.t('responseSettings.preset.unknown') })
   message.value = done()
   opts.onChanged()
   return true
  } catch (err) {
   fail(err)
   const kind = presetFailure(err)
   if (kind === 'gone') opts.onStale()
   if (kind === 'conflict' || kind === 'unknown') {
    // 重讀完才放開按鈕：不讓玩家拿舊版本號再撞一次。一直沒收到回應的，看重讀結果判斷到底成了沒有
    const before = opts.binding.value
    const after = await reread()
    if (kind === 'unknown') {
     const landed = after && after !== before && (target ? after.presetId === target.id : after.mode === 'card_default')
     if (landed) { failed.value = false; message.value = done(); opts.onChanged(); return true }
     failed.value = true; message.value = opts.t('responseSettings.saveFailed')
    } else if (after && before && after.bindingVersion !== before.bindingVersion) opts.onChanged()
   }
   return false
  } finally {
   busy.value = false
  }
 }

 return { busy, message, failed, apply }
}
