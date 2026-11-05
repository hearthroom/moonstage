/** Account-scoped local draw state. Saves opaque pool/slot keys and draw ordinals, never chat text. */
import { getAuthorRuleStorageScope, onStorageScopeChange } from './storage-scope'
import { bindRandomMessage, randomKey, type RandomDrawState } from './random-deck'

const PREFIX = 'lt-random-deck:'
const OWNER = `${PREFIX}owner`

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}
function wipe(disk: Storage | null) {
  if (!disk) return
  try {
    for (const key of Object.keys(disk)) if (key.startsWith(PREFIX)) disk.removeItem(key)
  } catch { /* Storage denied: keep this page's in-memory state only. */ }
}
function valid(value: any): value is RandomDrawState {
  if (!value || typeof value.pools !== 'object' || Array.isArray(value.pools)) return false
  if (value.messages != null && (typeof value.messages !== 'object' || Array.isArray(value.messages)
    || !Object.values(value.messages).every(v => typeof v === 'string' && /^[a-z0-9]+$/.test(v)))) return false
  return Object.values(value.pools).every((pool: any) => pool && Number.isSafeInteger(pool.drawn) && pool.drawn >= 0
    && pool.slots && typeof pool.slots === 'object' && !Array.isArray(pool.slots)
    && Object.values(pool.slots).every(n => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) < pool.drawn))
}

export function createRandomDrawStore() {
  const memory = new Map<string, RandomDrawState>()
  let epoch = 0
  let account = getAuthorRuleStorageScope()
  const claim = () => {
    const disk = storage()
    if (!account) { wipe(disk); return }
    try {
      if (disk && disk.getItem(OWNER) !== account) { wipe(disk); disk.setItem(OWNER, account) }
    } catch { /* Memory fallback. */ }
  }
  claim()
  const off = onStorageScopeChange(event => {
    const next = event.type === 'scope' ? event.scope : null
    if (next === account && event.type !== 'clear') return
    memory.clear()
    epoch++
    wipe(storage())
    account = next
    claim()
  })
  const write = (key: string, value: RandomDrawState) => {
    memory.set(key, value)
    if (account) try { storage()?.setItem(key, JSON.stringify(value)) } catch { /* Memory fallback. */ }
  }
  const read = (key: string): RandomDrawState | undefined => {
    const found = memory.get(key)
    if (found) return found
    if (account) {
      try {
        const value = JSON.parse(storage()?.getItem(key) || 'null')
        if (valid(value)) { memory.set(key, value); return value }
      } catch { /* Missing, invalid or unavailable storage. */ }
    }
    return undefined
  }
  return {
    get epoch() { return epoch },
    key(conversation: string) { return `${PREFIX}${account || 'memory'}:${randomKey(conversation)}` },
    read,
    write,
    bind(key: string, message: string, aliases: string[]) {
      const state = read(key) || { pools: {} }
      const keys = [...new Set([message, ...aliases].filter(Boolean))].map(randomKey)
      const before = keys.map(alias => state.messages?.[alias])
      const identity = bindRandomMessage(state, message, aliases)
      if (before.some(value => value !== identity)) write(key, state)
      return identity
    },
    dispose() { off(); memory.clear() },
  }
}
