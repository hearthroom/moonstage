import { defineComponent, h, nextTick, ref, watch } from 'vue'

const PROTO_VALUE_DESC =
  typeof HTMLTextAreaElement !== 'undefined'
    ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
    : undefined

/**
 * 輸入框那一個真正的 <textarea>。
 *
 * ── 為什麼不是寫在模板裡 ──
 * uni-app 的編譯器會把模板裡的 `<textarea>` 換成它自己的元件，渲染出來是
 * `<uni-textarea>` 外殼包著兩個內層 textarea。作者的卡片抓到的是外殼，
 * 而外殼沒有 `.value`——它的腳本做的 `el.value = txt` 會靜默落到 textContent 上，
 * 字進不了輸入框，作者只會看到「按鈕點了沒反應」。
 *
 * 用 h() 建的節點不經過那層編譯轉換，測試環境與瀏覽器拿到的是同一個真 textarea。
 *
 * ── 為什麼攔截節點自身的 .value setter ──
 * 有些 MMD 開場面板只寫 `t.value = (t.value || '') + s`，
 * 不 dispatch `input` 事件也不呼叫 `focus()`。在節點實例上掛一層委派給原生 prototype
 * 的 `.value` descriptor，讓直接賦值也能觸發 `input` 回呼；同時用 `lastEmitted` 去重，
 * 讓乖乖寫 `t.value = s; t.dispatchEvent(new Event('input'))` 的卡片仍然只觸發一次。
 *
 * 節點名由呼叫端給：輸入框是卡片 querySelector 的 `.uni-textarea-textarea`
 * 加上酒館的 `#send_textarea`；編輯框是酒館的 `.edit_textarea`。
 */
export default defineComponent({
  name: 'CanvasTextarea',
  props: {
    value: { type: String, default: '' },
    readOnly: { type: Boolean, default: false },
    /** 節點名照卡片的期待來，所以由呼叫端指定 */
    elId: { type: String, default: '' },
    elClass: { type: String, default: '' },
  },
  emits: ['input', 'keydown', 'compositionstart', 'compositionend', 'focus', 'blur'],
  setup(props, { emit, expose }) {
    const el = ref<HTMLTextAreaElement | null>(null)
    let syncingFromProps = false
    let lastEmitted = props.value ?? ''

    function readRaw(node: HTMLTextAreaElement): string {
      const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value') || PROTO_VALUE_DESC
      return desc?.get ? desc.get.call(node) : ''
    }

    function writeRaw(node: HTMLTextAreaElement, next: string) {
      const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value') || PROTO_VALUE_DESC
      if (desc?.set) desc.set.call(node, next)
    }

    function reconcileToProps() {
      const str = props.value == null ? '' : String(props.value)
      lastEmitted = str
      const node = el.value
      if (!node) return
      if (readRaw(node) !== str) {
        syncingFromProps = true
        try {
          writeRaw(node, str)
        } finally {
          syncingFromProps = false
        }
      }
    }

    function emitIfChanged(node: HTMLTextAreaElement, event?: Event) {
      const cur = readRaw(node)
      if (cur === lastEmitted) return
      lastEmitted = cur
      emit('input', event || ({ target: node } as unknown as Event))
      // 若卡片在同一同步 tick 裡寫 ta.value = text 又立刻點送出或清空，
      // 父層的 value 會在同一 tick 內經歷 "" -> text -> ""，Vue 批次更新時 props.value
      // 前後都是 "" 而不會觸發 watch；在微任務尾端對齊一次，避免舊字卡在 DOM 或攔住下一次相同注入。
      void nextTick(reconcileToProps)
    }

    function bindEl(node: unknown) {
      const textarea = (node instanceof HTMLElement ? node : null) as HTMLTextAreaElement | null
      const prev = el.value
      el.value = textarea
      if (!textarea) return
      if (!Object.prototype.hasOwnProperty.call(textarea, 'value')) {
        Object.defineProperty(textarea, 'value', {
          configurable: true,
          enumerable: true,
          get() {
            return readRaw(this)
          },
          set(next: unknown) {
            const nextStr = next == null ? '' : String(next)
            writeRaw(this, nextStr)
            if (!syncingFromProps) {
              emitIfChanged(this)
            }
          },
        })
      }
      if (prev !== textarea) {
        reconcileToProps()
      }
    }

    watch(
      [() => props.value, () => props.readOnly],
      () => {
        reconcileToProps()
      },
      { flush: 'sync' },
    )

    expose({ el })
    return () =>
      h('textarea', {
        // 自由文字不使用聯絡人或表單歷史填入。
        autocomplete: 'off',
        id: props.elId || undefined,
        class: props.elClass,
        rows: 1,
        readonly: props.readOnly,
        ref: bindEl,
        onInput: (e: Event) => emitIfChanged((e.target as HTMLTextAreaElement) || el.value!, e),
        onChange: (e: Event) => emitIfChanged((e.target as HTMLTextAreaElement) || el.value!, e),
        onKeydown: (e: KeyboardEvent) => emit('keydown', e),
        onCompositionstart: () => emit('compositionstart'),
        onCompositionend: () => emit('compositionend'),
        onFocus: () => emit('focus'),
        onBlur: () => emit('blur'),
      })
  },
})
