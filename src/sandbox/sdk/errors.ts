/**
 * sdk 的錯誤碼。作者的程式碼用 `err.code` 分支，所以名字逐字固定。
 */
export const SDK_ERROR_CODES = [
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'INVALID_ARGS',
  'HOST_DENIED',
  'NETWORK',
  'NOT_SUPPORTED',
  'BUSY',
  'UNKNOWN_CAPABILITY',
  // 平台的對話存檔滿了（伺服器數的，含目前這段）：err.data 帶 { count, limit }，卡片可以請玩家先刪一個。
  'LIMIT_REACHED',
] as const

export type SdkErrorCode = (typeof SDK_ERROR_CODES)[number]

export class SdkError extends Error {
  readonly code: SdkErrorCode
  /** 錯誤附帶的資料（例如 LIMIT_REACHED 的 { count, limit }）；多數錯誤沒有。 */
  readonly data?: Record<string, unknown>
  constructor(code: SdkErrorCode, message?: string, data?: Record<string, unknown>) {
    super(message || code)
    this.name = 'SdkError'
    this.code = code
    if (data) this.data = data
  }
}

export function isSdkError(e: unknown): e is SdkError {
  return e instanceof SdkError || (!!e && typeof e === 'object' && (e as { name?: string }).name === 'SdkError' && typeof (e as { code?: unknown }).code === 'string')
}

/** 宿主回的錯誤形狀 → SdkError。宿主給的碼不在名單裡就當 NETWORK（請求出去了但沒成）。 */
export function sdkErrorFromHost(err: { code?: string; message?: string; data?: Record<string, unknown> } | undefined): SdkError {
  const code = err && (SDK_ERROR_CODES as readonly string[]).includes(String(err.code)) ? (err!.code as SdkErrorCode) : 'NETWORK'
  return new SdkError(code, err && err.message, err && err.data && typeof err.data === 'object' ? err.data : undefined)
}
