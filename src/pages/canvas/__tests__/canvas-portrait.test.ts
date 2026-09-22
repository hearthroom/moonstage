import {describe,it,expect} from 'vitest'
import {cardPortrait} from '../canvas-portrait'
describe('card portrait',()=>{
 it('uses the animated portrait before the legacy avatar',()=>expect(cardPortrait({roleBackground:'portrait.gif',roleAvatar:'old.png'})).toBe('portrait.gif'))
 it('keeps legacy avatar-only cards visible',()=>expect(cardPortrait({roleAvatar:'old.png'})).toBe('old.png'))
 it('allows an empty card image',()=>expect(cardPortrait({})).toBe(''))
})
