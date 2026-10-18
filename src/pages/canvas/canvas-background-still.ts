/**
 * 模糊只需要一格。先試站台既有 anim=false 預覽，再在宿主解碼原圖第一格；
 * 不把原動圖交給 CSS。沙盒 CSP 不允許任意 fetch，所以在宿主做完後才送 data URL 給殼。
 */
import { computed, ref, watch, type Ref } from 'vue'
import type { StageBackground } from './canvas-player-background'

export function stillPreviewUrl(url: string): string {
  try {
    const source = new URL(url)
    const key = ({ 'assets.harperharbor.com': 'harbor', 'objects.lunatalk.ai': 'lunatalk' } as Record<string, string>)[source.host]
    if (!key || source.protocol !== 'https:') return ''
    // 與 Hearthroom shared/card-thumb.ts 的靜態預覽規則一致。
    return `https://sukisuki.ai/cdn-cgi/image/width=360,fit=scale-down,format=auto,anim=false,quality=70/v1/art/${key}${source.pathname}${source.search}`
  } catch { return '' }
}

// 同場景的直／橫圖與選單預覽共用一次解碼；有上限，長篇切場景不累積整場圖片。
const cache = new Map<string, Promise<string>>()
async function capture(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  let image: ImageBitmap | HTMLImageElement | null = null
  let objectUrl = ''
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' })
    if (!response.ok) return ''
    const blob = await response.blob()
    if (typeof createImageBitmap === 'function') image = await createImageBitmap(blob)
    else {
      objectUrl = URL.createObjectURL(blob)
      image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = objectUrl
      })
    }
    const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width
    const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height
    if (!width || !height) return ''
    const ratio = Math.min(1, 512 / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * ratio))
    canvas.height = Math.max(1, Math.round(height * ratio))
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch { return '' }
  finally {
    clearTimeout(timer)
    if (image && 'close' in image) image.close()
    if (image instanceof HTMLImageElement) image.src = ''
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

export function freezeBackground(url: string): Promise<string> {
  if (!url) return Promise.resolve('')
  const cached = cache.get(url)
  if (cached) return cached
  const job = (async () => {
    const preview = stillPreviewUrl(url)
    return (preview ? await capture(preview) : '') || await capture(url)
  })()
  cache.set(url, job)
  if (cache.size > 16) cache.delete(cache.keys().next().value!)
  return job
}

/** 同步清空舊場景，晚到的解碼不能蓋回新圖；失敗留底色，不退回動圖。 */
export function useStillImage(source: () => string): Ref<string> {
  const still = ref('')
  watch(source, (url, _, onCleanup) => {
    let active = true
    onCleanup(() => { active = false })
    still.value = ''
    if (url) void freezeBackground(url).then((value) => { if (active) still.value = value })
  }, { immediate: true, flush: 'sync' })
  return still
}

export function useStaticBackground(source: Ref<StageBackground>): Ref<StageBackground> {
  const portrait = useStillImage(() => source.value.mode === 'blur' ? source.value.portrait : '')
  const landscape = useStillImage(() => source.value.mode === 'blur' ? source.value.landscape : '')
  return computed(() => source.value.mode === 'blur'
    ? { ...source.value, portrait: portrait.value, landscape: landscape.value }
    : source.value)
}
