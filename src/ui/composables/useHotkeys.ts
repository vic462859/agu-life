/**
 * H5 键盘快捷键：Space=过一季 / 1-4=仓位 / L=杠杆 / S=止损 / Esc=关弹层。
 * 小程序端没有键盘，整段用条件编译剥掉；DOM 访问只出现在这个文件里。
 */
import { onMounted, onUnmounted } from 'vue'

export interface HotkeyHandlers {
  quarter(): void
  position(index: number): void
  lev(): void
  stopLoss(): void
  esc(): void
}

export function useHotkeys(get: () => HotkeyHandlers): void {
  // #ifdef H5
  function onKey(e: KeyboardEvent): void {
    const k = e.key
    const code = (e as KeyboardEvent & { code?: string }).code
    if (k === ' ' || k === 'Spacebar' || code === 'Space') {
      e.preventDefault()
      get().quarter()
      return
    }
    if (k === '1' || k === '2' || k === '3' || k === '4') {
      get().position(parseInt(k, 10) - 1)
      return
    }
    if (k === 'l' || k === 'L') {
      get().lev()
      return
    }
    if (k === 's' || k === 'S') {
      get().stopLoss()
      return
    }
    if (k === 'Escape') {
      get().esc()
    }
  }

  onMounted(function () {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', onKey)
    }
  })
  onUnmounted(function () {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('keydown', onKey)
    }
  })
  // #endif
}
