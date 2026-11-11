import { afterEach, expect, it } from 'vitest'
import { createThemeBridge } from '../theme-bridge'
import { writeCardThemeVars } from '@/pages/canvas/canvas-card-theme'

afterEach(() => { document.body.innerHTML = '' })

it('受管變數讓CSS層級決定值，不寫宿主inline；移除設定恢復原host值', () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const bridge = createThemeBridge(root, window)
  try {
    bridge.update({ '--lt-canvas-bubble-ai-bg': 'black', '--lt-canvas-font': 'monospace', '--lt-canvas-send-bg': 'blue' })
    expect(root.style.getPropertyValue('--lt-canvas-bubble-ai-bg')).toBe('black')
    root.setAttribute('data-lt-card-vars', '--lt-canvas-bubble-ai-bg --lt-canvas-font --lt-canvas-send-bg')
    bridge.refresh()
    expect(root.style.getPropertyValue('--lt-canvas-bubble-ai-bg')).toBe('')
    expect(root.style.getPropertyValue('--lt-canvas-font')).toBe('')
    expect(root.style.getPropertyValue('--lt-canvas-send-bg')).toBe('')
    root.removeAttribute('data-lt-card-vars')
    bridge.refresh()
    expect(root.style.getPropertyValue('--lt-canvas-bubble-ai-bg')).toBe('black')
    expect(root.style.getPropertyValue('--lt-canvas-font')).toBe('monospace')
    expect(root.style.getPropertyValue('--lt-canvas-send-bg')).toBe('blue')
  } finally { bridge.dispose() }
})

it('從氣泡量得的accent不會蓋掉受管的accent；非受管卡維持原回寫', () => {
  const root = document.createElement('div')
  root.style.setProperty('--lt-canvas-accent', 'red')
  root.setAttribute('data-lt-card-vars', '--lt-canvas-accent')
  writeCardThemeVars(root, { '--lt-canvas-accent': 'blue' })
  expect(root.style.getPropertyValue('--lt-canvas-accent')).toBe('')
  root.removeAttribute('data-lt-card-vars')
  writeCardThemeVars(root, { '--lt-canvas-accent': 'blue' })
  expect(root.style.getPropertyValue('--lt-canvas-accent')).toBe('blue')
})
