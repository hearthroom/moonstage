/**
 * 換卡時頁首不能留著上一張卡（2026-10-18 玩家回報：寫卡頁右邊的對話測試顯示他另一張卡）。
 *
 * 頁首的卡名、介紹與立繪都讀 store 的 currentRole，而它跟著 app_data 存在 localStorage：
 * 新文件一開，拿到的是「上一次在任何分頁成功讀到的那張卡」。換成新卡時只換了 currentRoleId，
 * 角色細節讀不到（或還沒回來）的那段時間，畫面上就是別張卡——讀不到的話會一直停在那裡。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const memory = new Map()
globalThis.uni = {
	getStorageSync: (k) => (memory.has(k) ? memory.get(k) : ''),
	setStorageSync: (k, v) => { memory.set(k, v) },
	removeStorageSync: (k) => { memory.delete(k) },
}

const A = { characterRoleId: '01a0b332-c725-74ae-82b7-8689a51e6cac', roleName: 'A' }
const B_ID = '01a14eb5-ed3e-77fc-82e8-a3a28acf343a'

async function freshStore() {
	vi.resetModules()
	return (await import('../index.js')).default
}

describe('currentRole 只屬於 currentRoleId 那張卡', () => {
	beforeEach(() => {
		memory.clear()
		memory.set('app_data', JSON.stringify({ currentRoleId: A.characterRoleId, currentRole: A }))
	})

	it('上一張卡存在本機，新文件換成別張卡：角色細節到手之前，currentRole 不是上一張', async () => {
		const store = await freshStore()
		expect(store.state.currentRole?.roleName).toBe('A')
		store.commit('setCurrentRoleId', B_ID)
		expect(store.state.currentRole).toBeNull()
		// 存回本機的也不能還是上一張：下一份文件一開又會拿到它
		expect(JSON.parse(memory.get('app_data')).currentRole).toBeNull()
	})

	it('同一張卡重開：留著本機那份，畫面不用先空一下', async () => {
		const store = await freshStore()
		store.commit('setCurrentRoleId', A.characterRoleId.toUpperCase())
		expect(store.state.currentRole?.roleName).toBe('A')
	})
})
