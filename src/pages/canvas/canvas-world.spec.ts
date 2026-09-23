import { describe, expect, it } from 'vitest'
import { decorateSpeakers, mentionOf, mentionShortcuts, worldMembers } from './canvas-world'

const detail = {
  roleName: 'Sakura High',
  world: {
    maxSpeakers: 2,
    characters: [
      { id: 'mika', name: 'Mika', avatar: 'https://img.example/mika.png', profile: 'class president' },
      { id: 'ren', name: 'Ren', avatar: '' },
      { id: 'Bad Id', name: 'nope' },
      { id: 'noname', name: '  ' },
      { id: 'http', name: 'Http', avatar: 'http://insecure/x.png' },
    ],
  },
}

describe('worldMembers', () => {
  it('reads the roster and drops members the server would never send', () => {
    const members = worldMembers(detail)
    expect(members.map((m) => m.id)).toEqual(['mika', 'ren', 'http'])
    expect(members[0].avatar).toBe('https://img.example/mika.png')
    expect(members[2].avatar).toBe('')
  })
  it('is empty for an ordinary card or an older server', () => {
    expect(worldMembers({ roleName: 'x' })).toEqual([])
    expect(worldMembers(null)).toEqual([])
  })
})

describe('decorateSpeakers', () => {
  const html = '<p>Narration.</p>\n<section class="hh-speaker hh-speaker--mika" data-speaker="mika">\n<header class="hh-speaker__name">Mika</header>\n<div class="hh-speaker__body"><p>Hi</p></div>\n</section>' +
    '<section class="hh-speaker hh-speaker--ren" data-speaker="ren">\n<header class="hh-speaker__name">Ren</header>\n<div class="hh-speaker__body"><p>...</p></div>\n</section>'
  it('adds the avatar only where the roster has one and never twice', () => {
    const once = decorateSpeakers(html, worldMembers(detail))
    expect(once).toContain('<header class="hh-speaker__name"><img class="hh-speaker__avatar" src="https://img.example/mika.png" alt="" loading="lazy">Mika</header>')
    expect(once).toContain('<header class="hh-speaker__name">Ren</header>')
    expect(decorateSpeakers(once, worldMembers(detail))).toBe(once)
  })
  it('leaves messages without speaker blocks untouched', () => {
    expect(decorateSpeakers('<p>plain</p>', worldMembers(detail))).toBe('<p>plain</p>')
    expect(decorateSpeakers(html, [])).toBe(html)
  })
})

describe('mention shortcuts', () => {
  it('lists every member and marks the selected one', () => {
    const items = mentionShortcuts(worldMembers(detail), 'ren')
    expect(items).toEqual([
      { key: 'mention:mika', label: '@Mika' },
      { key: 'mention:ren', label: '✓ @Ren' },
      { key: 'mention:http', label: '@Http' },
    ])
    expect(mentionOf('mention:ren')).toBe('ren')
    expect(mentionOf('model')).toBe('')
  })
})
