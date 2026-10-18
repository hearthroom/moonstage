/**
 * 自訂背景圖上傳前的本機處理：檢查格式與大小，縮到長邊上限並重新編碼成 JPEG。
 *
 * 重新編碼有兩個好處：手機原圖動輒十幾 MB，縮完通常一兩 MB，上傳快很多；而且畫回畫布再輸出
 * 會丟掉 EXIF（拍攝地點、裝置），玩家的照片不會帶著這些上傳。背景不需要透明，JPEG 就夠。
 */
export interface UploadLimit {
  maxBytes: number
  types: readonly string[]
  maxEdge: number
}

export type PreparedUpload =
  | { ok: true; contentType: string; base64: string }
  | { ok: false; reason: 'format' | 'size' | 'decode' }

/** 只看格式與大小，不碰圖片內容。 */
export function checkBackgroundFile(file: { type?: string; size?: number } | null | undefined, limit: UploadLimit): 'format' | 'size' | null {
  if (!file) return 'format'
  if (!limit.types.includes(String(file.type || '').toLowerCase())) return 'format'
  if (!(Number(file.size) > 0) || Number(file.size) > limit.maxBytes) return 'size'
  return null
}

/** 長邊不超過 maxEdge，等比縮小，不放大。 */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const edge = Math.max(width, height)
  if (!(edge > maxEdge)) return { width: Math.round(width), height: Math.round(height) }
  const k = maxEdge / edge
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result || '')
      resolve(s.slice(s.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function prepareBackgroundUpload(file: File, limit: UploadLimit): Promise<PreparedUpload> {
  const bad = checkBackgroundFile(file, limit)
  if (bad) return { ok: false, reason: bad }
  try {
    const img = await decode(file)
    const size = fitWithin(img.width, img.height, limit.maxEdge)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return { ok: false, reason: 'decode' }
    // 透明的 PNG 畫到 JPEG 會變黑底，先鋪墨色，跟背景層的底色一致。
    ctx.fillStyle = '#16191E'
    ctx.fillRect(0, 0, size.width, size.height)
    ctx.drawImage(img.source, 0, 0, size.width, size.height)
    img.close()
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    if (!blob) return { ok: false, reason: 'decode' }
    return { ok: true, contentType: 'image/jpeg', base64: await blobToBase64(blob) }
  } catch (e) {
    return { ok: false, reason: 'decode' }
  }
}
