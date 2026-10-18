import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, computed, h } from 'vue'
import { freezeBackground, stillPreviewUrl, useStaticBackground } from '../canvas-background-still'
import CanvasStage from '../components/canvas-stage.vue'

afterEach(() => vi.restoreAllMocks())

describe('模糊背景只畫靜態畫格', () => {
  it('Harbor 封面先用現有的 anim=false 靜態預覽，未知來源留給本機擷取', () => {
    expect(stillPreviewUrl('https://assets.harperharbor.com/media/test.webp?q=1'))
      .toBe('https://sukisuki.ai/cdn-cgi/image/width=360,fit=scale-down,format=auto,anim=false,quality=70/v1/art/harbor/media/test.webp?q=1')
    expect(stillPreviewUrl('https://other.test/scene.gif')).toBe('')
  })

  it('預覽失敗就讀原圖 blob 第一格，編成單張 JPEG 並關閉 bitmap；同圖只做一次', async () => {
    const blob = new Blob(['animated'])
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true, blob: async () => blob })
    vi.stubGlobal('fetch', fetcher)
    const bitmap = { width: 1024, height: 2048, close: vi.fn() }
    const decode = vi.fn().mockResolvedValue(bitmap)
    vi.stubGlobal('createImageBitmap', decode)
    const draw = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: draw } as any)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,still')
    const url = 'https://assets.harperharbor.com/media/fallback.gif'
    expect(await freezeBackground(url)).toBe('data:image/jpeg;base64,still')
    expect(await freezeBackground(url)).toBe('data:image/jpeg;base64,still')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(decode).toHaveBeenCalledWith(blob)
    expect(draw).toHaveBeenCalledWith(bitmap, 0, 0, 256, 512)
    expect(bitmap.close).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  it('擷取失敗不退回會動的原圖', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')))
    expect(await freezeBackground('https://other.test/blocked.apng')).toBe('')
    vi.unstubAllGlobals()
  })

  it('載入中不畫原圖，晚到的舊場景不能蓋掉新場景；切原圖立即恢復原網址', async () => {
    const pending: Array<(value: any) => void> = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => pending.push(resolve))))
    const bg = (portrait: string) => ({ mode: 'blur' as const, portrait, landscape: '', color: '#16191E' })
    const Host = defineComponent({ props: ['background'], setup(props) { const background = useStaticBackground(computed(() => props.background)); return () => h(CanvasStage, { background: background.value }) } })
    const w = mount(Host, { props: { background: bg('/scene-a.gif') } })
    const style = () => w.find('.lt-stage-bg').attributes('style') || ''
    expect(style()).not.toContain('scene-a')
    await w.setProps({ background: bg('/scene-b.apng') })
    expect(style()).not.toContain('scene-b')
    await w.setProps({ background: { ...bg('/scene-b.apng'), mode: 'card' as any } })
    expect(w.find('.chat-scope-box').attributes('style')).toContain('/scene-b.apng')
    pending.forEach((resolve) => resolve({ ok: false }))
    await flushPromises()
    expect(w.find('.lt-stage-bg').exists()).toBe(false)
    w.unmount()
    vi.unstubAllGlobals()
  })
})


it('宿主的靜態背景同時進一般舞台與沙盒訊息，預覽也只給靜態圖', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
  expect(src).toContain('const stageBackground = useStaticBackground(')
  expect(src).toContain(':background="stageBackground"')
  expect(src).toContain('host.postBackground({ ...bg })')
  expect(src).toContain('blurPreviewUrl: backgroundBlurPreview.value')
})

it('新場景先解碼成功後，舊場景才回來也不能覆蓋它', async () => {
  let finishOld!: (value: any) => void
  vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('old-race')
    ? new Promise((resolve) => { finishOld = resolve })
    : Promise.resolve({ ok: true, blob: async () => new Blob(['new']) })))
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 32, height: 32, close: vi.fn() }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as any)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValueOnce('data:image/jpeg;base64,new').mockReturnValueOnce('data:image/jpeg;base64,old')
  const Host = defineComponent({ props: ['background'], setup(props) {
    const background = useStaticBackground(computed(() => props.background))
    return () => h(CanvasStage, { background: background.value })
  } })
  const bg = (portrait: string) => ({ mode: 'blur', portrait, landscape: '', color: '#16191E' })
  const w = mount(Host, { props: { background: bg('/old-race.gif') } })
  await w.setProps({ background: bg('/new-race.webp') })
  await flushPromises()
  expect(w.find('.lt-stage-bg').attributes('style')).toContain('base64,new')
  finishOld({ ok: true, blob: async () => new Blob(['old']) })
  await flushPromises()
  expect(w.find('.lt-stage-bg').attributes('style')).toContain('base64,new')
  expect(w.find('.lt-stage-bg').attributes('style')).not.toContain('base64,old')
  w.unmount()
  vi.unstubAllGlobals()
})
