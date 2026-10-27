import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * 設定面板裡那幾個真正的 <input> / <textarea>。
 *
 * ── 為什麼不是寫在模板裡 ──
 * 這個專案的編譯器會把模板裡的 `<input>` 與 `<textarea>` 換成它自己的元件，渲染
 * 出來是一層外殼包著真的輸入框。外殼自帶固定寬高，而那份基礎樣式不在我們的
 * `@layer` 裡——結果是版面規則永遠打不過它，輸入框在一片 828px 寬的卡裡固定
 * 300px，看起來像沒寫樣式。外殼也沒有 `.value`，作者的腳本寫進去會靜默落空。
 *
 * 用 h() 建的節點不經過那層轉換，測試環境與瀏覽器拿到的是同一個真輸入框。
 */

export const CanvasInput = defineComponent({
  name: 'CanvasInput',
  props: {
    value: { type: String, default: '' },
    elClass: { type: String, default: '' },
    placeholder: { type: String, default: '' },
    maxlength: { type: Number, default: 0 },
    disabled: { type: Boolean, default: false },
  },
  emits: ['input'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        type: 'text',
        class: props.elClass,
        value: props.value,
        placeholder: props.placeholder || undefined,
        maxlength: props.maxlength > 0 ? props.maxlength : undefined,
        disabled: props.disabled || undefined,
        onInput: (e: Event) => emit('input', (e.target as HTMLInputElement).value),
      })
  },
})

export const CanvasTextField = defineComponent({
  name: 'CanvasTextField',
  props: {
    value: { type: String, default: '' },
    elClass: { type: String, default: '' },
    placeholder: { type: String, default: '' },
    maxlength: { type: Number, default: 0 },
    disabled: { type: Boolean, default: false },
    autoGrow: { type: Boolean, default: false },
  },
  emits: ['input'],
  setup(props, { emit }) {
    const field = ref<HTMLTextAreaElement | null>(null)
    let observer: ResizeObserver | undefined
    let lastWidth = 0
    const grow = () => {
      if (!props.autoGrow || !field.value) return
      const el = field.value
      el.style.height = 'auto'
      // border-box：scrollHeight 不含邊框；CSS 的 max-height 仍限制面板內的捲動高度。
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
    }
    onMounted(() => {
      if (!props.autoGrow) return
      grow()
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(([entry]) => {
          if (entry.contentRect.width === lastWidth) return
          lastWidth = entry.contentRect.width
          grow()
        })
        if (field.value) observer.observe(field.value)
      }
    })
    watch(() => props.value, () => { if (props.autoGrow) nextTick(grow) })
    onBeforeUnmount(() => observer?.disconnect())
    return () =>
      h('textarea', {
        ref: field,
        // 自由文字不使用聯絡人或表單歷史填入。
        autocomplete: 'off',
        class: props.elClass,
        value: props.value,
        placeholder: props.placeholder || undefined,
        maxlength: props.maxlength > 0 ? props.maxlength : undefined,
        disabled: props.disabled || undefined,
        onInput: (e: Event) => { grow(); emit('input', (e.target as HTMLTextAreaElement).value) },
      })
  },
})
