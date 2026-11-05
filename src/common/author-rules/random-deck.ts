/** Local draw ledger: the same pool deals without replacement; a slot is dealt only once. */
export interface RandomDrawState {
  pools: Record<string, { drawn: number; slots: Record<string, number> }>
}

export interface RandomPickPosition { ruleIndex: number; matchIndex: number; tokenIndex: number }
export type RandomPicker = ((choices: string[], position: RandomPickPosition) => string) & {
  /** Revert draws if the enclosing rule rolls its output back. */
  checkpoint?: () => () => void
}

/** Opaque local keys, not a security or authentication primitive. */
export function randomKey(text: string): string {
  let a = 0xdeadbeef, b = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    a = Math.imul(a ^ ch, 2654435761)
    b = Math.imul(b ^ ch, 1597334677)
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909)
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909)
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36)
}

export function createRandomDeck(scope: string, message: string, previous?: RandomDrawState) {
  const state: RandomDrawState = previous ? JSON.parse(JSON.stringify(previous)) : { pools: {} }
  const decks = new Map<string, number[]>()
  const journal: { entry: RandomDrawState['pools'][string]; slot: string }[] = []
  const pick: RandomPicker = (choices, position) => {
    // Pool identity depends on its choices, across rules and tokens. Duplicate choices are one card.
    const pool = [...new Set(choices)].sort()
    if (!pool.length) return ''
    const key = randomKey(JSON.stringify(pool))
    const entry = state.pools[key] || (state.pools[key] = { drawn: 0, slots: {} })
    const slot = randomKey(JSON.stringify([message, position.ruleIndex, position.matchIndex, position.tokenIndex]))
    let dealt = entry.slots[slot]
    if (dealt === undefined) {
      dealt = entry.drawn++
      entry.slots[slot] = dealt
      journal.push({ entry, slot })
    }
    const cycle = Math.floor(dealt / pool.length)
    const deckKey = `${key}:${cycle}`
    let deck = decks.get(deckKey)
    if (!deck) {
      deck = pool.map((_, i) => i)
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Number.parseInt(randomKey(`${scope}\u0001${key}\u0001${cycle}\u0001${i}`), 36) % (i + 1)
        ;[deck[i], deck[j]] = [deck[j], deck[i]]
      }
      decks.set(deckKey, deck)
    }
    return pool[deck[dealt % pool.length]]
  }
  pick.checkpoint = () => {
    const start = journal.length
    return () => {
      while (journal.length > start) {
        const { entry, slot } = journal.pop()!
        delete entry.slots[slot]
        entry.drawn--
      }
    }
  }
  return { state, pick }
}
