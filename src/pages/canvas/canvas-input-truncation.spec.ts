import { describe, expect, it } from 'vitest'
import { inputTruncationActions } from './canvas-input-truncation'

describe('input truncation recovery actions', () => {
  const base = [{action:'retry_rewrite',label:'Retry rewrite'},{action:'switch_model',label:'Switch model'}]
  it('opens lanes only when another lane and server permission exist', () => {
    expect(inputTruncationActions('input_truncated',base,true,'Switch lane')).toEqual([base[0],{action:'switch_lane',label:'Switch lane'}])
    expect(inputTruncationActions('input_truncated',base,false,'Switch lane')).toEqual(base)
    expect(inputTruncationActions('input_truncated',[base[0]],true,'Switch lane')).toEqual([base[0]])
    expect(inputTruncationActions('service_unavailable',base,true,'Switch lane')).toEqual(base)
    expect(inputTruncationActions('input_truncated',[],true,'Switch lane')).toEqual([])
  })
})
