import { expect, it, vi } from 'vitest'
import { browserHost } from '@/host/stage-host'
import { createUniShim } from '../uni-shim'
it('preserves an explicit reading duration through the embedded host', () => {
 const toast = vi.fn()
 const uni = createUniShim(browserHost({ ui: { toast } }))
 uni.showToast({ title: 'Preference fallback', icon: 'none', duration: 6000 })
 expect(toast).toHaveBeenCalledWith('Preference fallback', 'info', 6000)
})
