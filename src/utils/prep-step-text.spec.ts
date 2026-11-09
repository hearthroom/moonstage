import { describe, expect, it } from 'vitest'
import { prepStepText, prepTrailFromServerSteps } from './prep-step-text'

const t = (key: string) => key

describe('Agent preparation phase copy', () => {
  it('renders the same measured phases live and after replay', () => {
    const steps = [
      { stage: 'checking_format' },
      { stage: 'organizing_format' },
      { stage: 'waiting_model' },
      { stage: 'model_working' },
      { stage: 'model_thinking' },
      { stage: 'reading_memory' },
      { stage: 'reviewing_lorebook' },
    ]
    const labels = [
      'multiPass.prepCheckingFormat',
      'multiPass.prepOrganizingFormat',
      'multiPass.prepWaitingModel',
      'multiPass.prepModelWorking',
      'multiPass.prepModelThinking',
      'multiPass.prepReadingMemory',
      'multiPass.prepReviewingLorebook',
    ]
    expect(steps.map(step => prepStepText(step, t))).toEqual(labels)
    expect(prepTrailFromServerSteps(steps, t)).toEqual(labels)
  })

  it('still renders the previously published generic stage', () => {
    expect(prepStepText({ stage: 'looking_up' }, t)).toBe('multiPass.prepLookingUp')
  })
})
