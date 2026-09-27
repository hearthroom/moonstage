<template>
  <div class="page-header-scope header-scope">
    <div id="top-bar" class="topTabbar" data-lt="header">
      <div class="header-box">
        <div
          v-if="showBack"
          class="icon-back"
          data-lt="back"
          role="button"
          tabindex="0"
          :aria-label="backLabel"
          @click="$emit('back')"
          @keydown.enter.prevent="$emit('back')"
          @keydown.space.prevent="$emit('back')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </div>

        <div class="header-center">
          <div class="header-role-img" data-lt="avatar">
            <!-- uni-image 這一層是作者卡打得到的名字（原平台是 uni-app，卡片照它寫）。
                 用動態元件寫成原生標籤，才不會被當成沒註冊的組件。 -->
            <component :is="'uni-image'">
              <div :style="avatar ? { backgroundImage: 'url(' + avatar + ')' } : null"></div>
              <span></span>
              <!-- 跟 uni-app 的 image 一樣有一個 img；可見的是它（見 canvas.css 頭像那段）。 -->
              <img v-if="avatar" :src="avatar" draggable="false" alt="" />
            </component>
          </div>
          <div class="header-roleName" data-lt="title">{{ roleName }}</div>
        </div>

        <div class="header-icon-meun" data-lt="header-actions">
          <!-- 本機草稿在套用中：純預覽或蓋掉線上規則時都亮著，讓作者知道現在看的不是線上版。 -->
          <div v-if="badge" class="header-meun preview-badge" data-lt="preview-badge">{{ badge }}</div>
          <!-- 收藏與留言：卡片在宿主站上的社群資料，宿主說這張卡有才畫。
               跟全螢幕一樣掛 header-meun，作者替頂欄功能鍵寫的美化直接套得上。 -->
          <div
            v-if="favoriteSupported"
            role="button"
            tabindex="0"
            class="header-meun header-action favorite-toggle"
            data-lt="favorite"
            :aria-label="favoriteLabel"
            :title="favoriteLabel"
            :aria-pressed="favoriteActive"
            @click="$emit('favorite')"
            @keydown.enter.prevent="$emit('favorite')"
            @keydown.space.prevent="$emit('favorite')"
          >
            <svg viewBox="0 0 24 24" :fill="favoriteActive ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path d="M12 20.5s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z" />
            </svg>
          </div>
          <div
            v-if="commentsSupported"
            role="button"
            tabindex="0"
            class="header-meun header-action comments-toggle"
            data-lt="comments"
            :aria-label="commentsLabel"
            :title="commentsLabel"
            @click="$emit('comments')"
            @keydown.enter.prevent="$emit('comments')"
            @keydown.space.prevent="$emit('comments')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12z" />
            </svg>
          </div>
          <div
            v-if="fullscreenSupported"
            role="button"
            tabindex="0"
            class="header-meun header-action fullscreen-toggle"
            data-lt="fullscreen"
            :aria-label="fullscreenLabel"
            :title="fullscreenLabel"
            :aria-pressed="fullscreenActive"
            @click="$emit('fullscreen')"
            @keydown.enter.prevent="$emit('fullscreen')"
            @keydown.space.prevent="$emit('fullscreen')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path v-if="fullscreenActive" d="M8 3v5H3m13-5v5h5M3 16h5v5m13-5h-5v5" />
              <path v-else d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/*
 頂欄。作者的卡片把整條當成自己的畫布：換底色、換字體、替功能鍵上色。
       所以這裡只放「走得掉／知道跟誰講話／收藏與留言／全螢幕」，其餘取值全部走變數。
       換模型不在這裡：輸入區的點數鍵、快捷列、「＋」都開得到，快捷列那顆寫著目前的模型名。
*/
withDefaults(defineProps<{
  roleName: string
  avatar: string
  backLabel?: string
  /** 本機草稿套用中的提示；空字串不畫 */
  badge?: string
  /** 宿主沒有上一頁可回（獨立的卡片 App）就不畫返回鍵 */
  showBack?: boolean
  fullscreenSupported?: boolean
  fullscreenActive?: boolean
  fullscreenLabel?: string
  /** 宿主站上有這張卡（上架中）才有收藏與留言 */
  favoriteSupported?: boolean
  favoriteActive?: boolean
  favoriteLabel?: string
  commentsSupported?: boolean
  commentsLabel?: string
}>(), { badge: '', showBack: true })

defineEmits<{
  (e: 'back'): void
  (e: 'fullscreen'): void
  (e: 'favorite'): void
  (e: 'comments'): void
}>()
</script>
