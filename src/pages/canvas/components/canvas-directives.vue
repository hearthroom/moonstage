<template>
  <div class="custom-instruction-scope">
  <!--
    長期指令。節點名照 MMD 實測：
      .custom-instruction-scope > .list-scope
        > .header-scope(.close-btn, .title)
        + .sub-title            「(3/10)」
        + .empty-default-show    一條都沒有時的那句話
        + .content-scope > .item(.left, .right, .gap)
      .edit-scope 底下多了 .btn-scope > .add-btn（MMD 把它放標題列；這裡跟輸入區同一區、在底部動作列）

    `.empty-default-show` 與 `.edit-scope` 常駐 DOM（用 hidden 收起來）：
    節點不存在的話作者寫的規則會命中零個，他只看得到「引擎壞了」。
  -->
    <!-- 子視圖開著時清單與輸入區收起來，但節點留著：作者的規則要一直命中得到。 -->
    <div class="list-scope" v-show="!subView">
      <div class="header-scope">
        <div class="close-btn" role="button" tabindex="0"
             :aria-label="labels.close"
             @click="$emit('close')"
             @keydown.enter.prevent="$emit('close')">×</div>
        <div class="title">{{ labels.title }}</div>
      </div>

      <div class="sub-title">{{ countText }}</div>

      <div class="empty-default-show" :hidden="loading || list.length > 0">{{ labels.empty }}</div>

      <div class="content-scope">
        <div v-if="loading" class="ci-loading">{{ labels.loading }}</div>
        <div v-else-if="loadFailed" class="ci-error">
          <span class="ci-error-text">{{ labels.loadFailed }}</span>
          <span class="ci-retry" role="button" tabindex="0"
                @click="$emit('retry')"
                @keydown.enter.prevent="$emit('retry')">{{ labels.retry }}</span>
        </div>
        <div v-for="item in list" :key="item.sourceId" class="item" :class="{ 'is-editing': editingSourceId === item.sourceId }">
          <div class="left">
            <template v-if="editingSourceId === item.sourceId">
              <CanvasTextField
                el-class="custom-textarea-box ci-edit-textarea"
                :value="editingText"
                :maxlength="maxLength"
                auto-grow
                @input="$emit('update:editing-text', $event)"
              />
            </template>
            <template v-else>
              <span class="item-text">{{ item.text }}</span>
              <span class="item-origin">{{ item.origin === 'manual' ? labels.originManual : labels.originAi }}</span>
            </template>
          </div>
          <div class="right">
            <template v-if="editingSourceId === item.sourceId">
              <div class="ci-btn" role="button" tabindex="0"
                   @click="$emit('cancel-edit')"
                   @keydown.enter.prevent="$emit('cancel-edit')">{{ labels.cancel }}</div>
              <div class="ci-btn ci-btn-primary" role="button" tabindex="0"
                   @click="$emit('save-edit', item.sourceId)"
                   @keydown.enter.prevent="$emit('save-edit', item.sourceId)">{{ labels.save }}</div>
            </template>
            <template v-else-if="pendingDeleteId === item.sourceId">
              <!--
                刪除的確認留在這一列上，不另開一個確認彈層：規則是「同時只有一個
                彈層」，開確認等於把這一片換掉——玩家點的那一條連同整份清單一起
                消失，回來之後不知道剛剛按到什麼。
              -->
              <div class="ci-btn" role="button" tabindex="0"
                   @click="$emit('cancel-delete')"
                   @keydown.enter.prevent="$emit('cancel-delete')">{{ labels.cancel }}</div>
              <div class="ci-btn ci-btn-danger" role="button" tabindex="0"
                   @click="$emit('confirm-delete', item.sourceId)"
                   @keydown.enter.prevent="$emit('confirm-delete', item.sourceId)">{{ labels.deleteConfirmShort }}</div>
            </template>
            <template v-else>
              <div class="ci-btn" role="button" tabindex="0"
                   @click="$emit('edit', item.sourceId)"
                   @keydown.enter.prevent="$emit('edit', item.sourceId)">{{ labels.edit }}</div>
              <div class="ci-btn ci-btn-danger" role="button" tabindex="0"
                   @click="$emit('ask-delete', item.sourceId)"
                   @keydown.enter.prevent="$emit('ask-delete', item.sourceId)">{{ labels.delete }}</div>
            </template>
          </div>
          <div class="gap"></div>
        </div>
      </div>
    </div>

    <template v-if="sets && !subView">
      <!--
        升級提示：這張卡還沒選過指令組、這個存檔已經有指令。放在清單之下、來源區之上：
        標題列在 .list-scope 裡，放在面板最上面會跑到標題上方；也不插進 .list-scope，
        免得打斷作者寫的相鄰選擇器（.sub-title + .empty-default-show）。
      -->
      <div v-if="sets.upgrade.show" class="ci-upgrade">
        <div class="ci-upgrade-body">{{ sets.upgrade.body }}</div>
        <div class="ci-upgrade-acts">
          <div class="ci-main-btn" role="button" tabindex="0"
               :class="{ 'is-busy': sets.upgrade.busy }"
               @click="!sets.upgrade.busy && $emit('sets-upgrade')"
               @keydown.enter.prevent="!sets.upgrade.busy && $emit('sets-upgrade')">{{ setLabels.upgradeConfirm }}</div>
          <div class="ci-btn" role="button" tabindex="0"
               @click="$emit('sets-dismiss')"
               @keydown.enter.prevent="$emit('sets-dismiss')">{{ setLabels.upgradeDismiss }}</div>
        </div>
        <div class="ci-upgrade-note">{{ setLabels.upgradeNote }}</div>
        <div class="ci-add-error" :hidden="!sets.upgrade.error">{{ sets.upgrade.error }}</div>
      </div>

      <!-- 指令組來源區：這張卡的新存檔帶哪一組、這個存檔換一組或存成一組。次要動作，用中性連結。 -->
      <div class="ci-source">
        <div v-if="sets.source.loading" class="ci-source-ghost" aria-hidden="true"></div>
        <div v-else-if="sets.source.loadFailed" class="ci-source-row">
          <span class="ci-source-label">{{ setLabels.loadFailed }}</span>
          <span class="ci-link" role="button" tabindex="0"
                @click="$emit('sets-retry')"
                @keydown.enter.prevent="$emit('sets-retry')">{{ setLabels.retry }}</span>
        </div>
        <template v-else>
          <div v-if="sets.source.hasSets" class="ci-source-row">
            <span class="ci-source-label">{{ setLabels.rowCard }}</span>
            <span class="ci-source-value">{{ sets.source.cardValue }}</span>
            <span class="ci-link" role="button" tabindex="0"
                  @click="$emit('sets-open', 'card')"
                  @keydown.enter.prevent="$emit('sets-open', 'card')">{{ setLabels.change }}</span>
          </div>
          <div v-else class="ci-source-row">
            <span class="ci-source-label">{{ setLabels.emptyHint }}</span>
          </div>
          <div v-if="hasConversation && (sets.source.canSwitch || sets.source.canSaveAs || (!sets.source.hasSets && sets.source.canManage))" class="ci-source-row">
            <span v-if="sets.source.hasSets" class="ci-source-label">{{ setLabels.rowSave }}</span>
            <span class="ci-source-links">
              <span v-if="sets.source.canSwitch" class="ci-link" role="button" tabindex="0"
                    @click="$emit('sets-open', 'save')"
                    @keydown.enter.prevent="$emit('sets-open', 'save')">{{ setLabels.switch }}</span>
              <span v-if="sets.source.canSaveAs" class="ci-link" role="button" tabindex="0"
                    @click="$emit('sets-save-as-open')"
                    @keydown.enter.prevent="$emit('sets-save-as-open')">{{ setLabels.saveAs }}</span>
              <span v-if="!sets.source.hasSets && sets.source.canManage" class="ci-link" role="button" tabindex="0"
                    @click="$emit('sets-manage')"
                    @keydown.enter.prevent="$emit('sets-manage')">{{ setLabels.manage }}</span>
            </span>
          </div>
        </template>
        <div class="ci-status" aria-live="polite" :hidden="!sets.status">{{ sets.status }}</div>
      </div>
    </template>

    <CanvasDirectiveSets v-if="sets && subView" :vm="sets" :labels="subViewLabels"
      @sets-back="$emit('sets-back')"
      @sets-scope="$emit('sets-scope', $event)"
      @sets-pick="$emit('sets-pick', $event)"
      @sets-apply="$emit('sets-apply')"
      @sets-manage="$emit('sets-manage')"
      :name="setName"
      @sets-name="$emit('update:set-name', $event)"
      @sets-bind="$emit('sets-bind')"
      @sets-save-as="$emit('sets-save-as')" />

    <!-- 新增／編輯用的輸入區。MMD 把它收在 `.edit-scope` 底下。 -->
    <div class="edit-scope" v-show="!subView">
      <div class="content-scope">
        <div class="form-item">
          <div class="custom-textarea-box">
            <CanvasTextField
              el-class="custom-textarea"
              :value="draft"
              :maxlength="maxLength"
              auto-grow
              :placeholder="addPlaceholder"
              :disabled="!hasConversation"
              @input="$emit('update:draft', $event)"
            />
          </div>
          <div class="ci-count">{{ draft.length }}/{{ maxLength }}</div>
        </div>
      </div>
      <!-- 面板蓋在系統提示之上，所以回饋必須留在面板裡。 -->
      <div class="ci-add-error" :hidden="!error">{{ error }}</div>
      <!-- 「添加」跟它作用的輸入區放一起、在底部動作列——不在標題列。節點名（.btn-scope > .add-btn）照 MMD。 -->
      <div class="btn-scope">
        <div
          class="add-btn"
          role="button"
          tabindex="0"
          :class="{ 'is-disabled': !canAdd }"
          :aria-disabled="canAdd ? 'false' : 'true'"
          @click="onAdd"
          @keydown.enter.prevent="onAdd"
        >{{ labels.add }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CanvasTextField } from './canvas-field'
import CanvasDirectiveSets from './canvas-directive-sets.vue'
import type { DirectiveItem, DirectiveSetsViewModel } from '../canvas-directives'

export interface DirectiveSourceLabels {
  rowCard: string
  rowSave: string
  change: string
  switch: string
  saveAs: string
  emptyHint: string
  manage: string
  upgradeConfirm: string
  upgradeDismiss: string
  upgradeNote: string
  loadFailed: string
  retry: string
  back: string
  title: string
  scopeSave: string
  scopeCard: string
  nameLabel: string
  namePlaceholder: string
  bindCard: string
}

const props = withDefaults(defineProps<{
  list?: DirectiveItem[]
  countText?: string
  maxLength?: number
  loading?: boolean
  loadFailed?: boolean
  hasConversation?: boolean
  canAdd?: boolean
  draft?: string
  editingSourceId?: string
  editingText?: string
  pendingDeleteId?: string
  error?: string
  /** 指令組的畫面資料（宿主算好）；null＝這個供應商沒有指令組 */
  sets?: DirectiveSetsViewModel | null
  /** 「存成指令組」的名稱欄；跟 draft 一樣是殼自己持有的打字欄位 */
  setName?: string
  setLabels?: DirectiveSourceLabels
  labels?: {
    title: string
    close: string
    add: string
    edit: string
    delete: string
    deleteConfirmShort: string
    save: string
    cancel: string
    empty: string
    loading: string
    loadFailed: string
    retry: string
    placeholder: string
    waitingConversation: string
    originManual: string
    originAi: string
  }
}>(), {
  list: () => [],
  countText: '',
  maxLength: 200,
  loading: false,
  loadFailed: false,
  hasConversation: true,
  canAdd: false,
  draft: '',
  editingSourceId: '',
  editingText: '',
  pendingDeleteId: '',
  error: '',
  sets: null,
  setName: '',
  setLabels: () => ({
    rowCard: '', rowSave: '', change: '', switch: '', saveAs: '', emptyHint: '', manage: '',
    upgradeConfirm: '', upgradeDismiss: '', upgradeNote: '', loadFailed: '', retry: 'Retry',
    back: '', title: '', scopeSave: '', scopeCard: '', nameLabel: '', namePlaceholder: '', bindCard: '',
  }),
  labels: () => ({
    title: '', close: 'Close', add: 'Add', edit: 'Edit', delete: 'Delete',
    deleteConfirmShort: 'Delete', save: 'Save', cancel: 'Cancel',
    empty: '', loading: '', loadFailed: '', retry: 'Retry',
    placeholder: '', waitingConversation: '', originManual: '', originAi: '',
  }),
})

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'edit', sourceId: string): void
  (e: 'save-edit', sourceId: string): void
  (e: 'cancel-edit'): void
  (e: 'ask-delete', sourceId: string): void
  (e: 'confirm-delete', sourceId: string): void
  (e: 'cancel-delete'): void
  (e: 'retry'): void
  (e: 'close'): void
  (e: 'update:draft', value: string): void
  (e: 'update:editing-text', value: string): void
  (e: 'sets-open', scope: string): void
  (e: 'sets-save-as-open'): void
  (e: 'sets-upgrade'): void
  (e: 'sets-dismiss'): void
  (e: 'sets-retry'): void
  (e: 'sets-back'): void
  (e: 'sets-scope', scope: string): void
  (e: 'sets-pick', id: string): void
  (e: 'sets-apply'): void
  (e: 'sets-manage'): void
  (e: 'update:set-name', value: string): void
  (e: 'sets-bind'): void
  (e: 'sets-save-as'): void
}>()

const subView = computed(() => Boolean(props.sets && props.sets.view !== 'list'))
const subViewLabels = computed(() => ({
  back: props.setLabels.back,
  title: props.setLabels.title,
  scopeSave: props.setLabels.scopeSave,
  scopeCard: props.setLabels.scopeCard,
  manage: props.setLabels.manage,
  saveAs: props.setLabels.saveAs,
  nameLabel: props.setLabels.nameLabel,
  namePlaceholder: props.setLabels.namePlaceholder,
  bindCard: props.setLabels.bindCard,
}))

// 對話還沒建立時把原因寫在輸入框裡：把鍵變灰而不說話，玩家不知道要等什麼。
const addPlaceholder = computed(() =>
  (props.hasConversation ? props.labels.placeholder : props.labels.waitingConversation))

function onAdd() {
  if (!props.canAdd) return
  emit('add')
}
</script>
