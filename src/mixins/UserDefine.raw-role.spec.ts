import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createStore } from 'vuex'
import { useUserDefine } from './UserDefine'
import { applyTavernRules } from '@/pages/canvas/canvas-rule-engine-core'
import { convertVisibleHtml, createDisplayScriptConverter } from '@/pages/canvas/canvas-display-script'

describe('role loading preserves author source before display rules', () => {
  it.each(['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko'])('%s keeps the opening, alternates and machine fields intact', async (locale) => {
    vi.stubGlobal('uni', { getLocale: () => locale })
    const raw = {
      language: 'zh-Hans', roleName: '测试角色', roleDesc: '测试简介',
      roleDetailDesc: '穿着=校服', roleWelcome: '状态：穿着校服',
      roleWelcomeAlternates: ['状态：另一件衣服'],
    }
    const store = createStore({ state: { hasLogin: false, currentRoleId: 'local-role' },
      mutations: { setCurrentRole(state, role) { state.currentRole = role } } })
    const convert = createDisplayScriptConverter('s2t')
    const tify = vi.fn(convert)
    let api: ReturnType<typeof useUserDefine>
    const wrapper = mount(defineComponent({ setup() { api = useUserDefine(); return () => null } }), {
      global: { plugins: [store], config: { globalProperties: {
        http: { get: vi.fn().mockResolvedValue({ statusCode: 200, data: raw }) },
        requestUrl: { getRoleDetail: '/local/detail' }, fui: { tify },
      } } },
    })
    try {
      const received = vi.fn()
      api!.getRole(received)
      await flushPromises()
      expect(received).toHaveBeenCalledWith(null, raw)
      expect(store.state.currentRole).toEqual(raw)
      expect(tify).not.toHaveBeenCalled()
      const applied = applyTavernRules(store.state.currentRole.roleWelcome, [
        { find: '/状态：(.*)/', replace: '<section class="status">$1</section>' },
      ]).html
      expect(convertVisibleHtml(applied, convert)).toContain('<section class="status">穿著校服</section>')
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })
})
