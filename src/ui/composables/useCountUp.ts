/** 数字滚动补间：只在数值变化时跑，setInterval 双端通用（不用 requestAnimationFrame）。
 *  时长可传 getter，"跳过动画"开关切换后立即生效。 */
import { getCurrentInstance, onUnmounted, ref, watch, type Ref } from 'vue'

export function useCountUp(source: () => number, ms: number | (() => number) = 460): Ref<number> {
  const shown = ref(typeof source() === 'number' && isFinite(source()) ? source() : 0)
  let timer: ReturnType<typeof setInterval> | null = null

  function dur(): number {
    const v = typeof ms === 'function' ? ms() : ms
    return isFinite(v) && v > 0 ? v : 0
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  watch(source, function (to, from) {
    if (typeof to !== 'number' || !isFinite(to)) return
    const fromN = typeof from === 'number' && isFinite(from) ? from : 0
    stop()
    const total = dur()
    if (total <= 0 || Math.abs(to - fromN) < 0.5) {
      shown.value = to
      return
    }
    const t0 = Date.now()
    timer = setInterval(function () {
      const k = Math.min(1, (Date.now() - t0) / total)
      const e = 1 - Math.pow(1 - k, 3)
      shown.value = fromN + (to - fromN) * e
      if (k >= 1) {
        shown.value = to
        stop()
      }
    }, 16)
  })

  // 只在组件里挂卸载钩子：直接拿来当普通工具用（node 侧测试）时不至于报"没有组件实例"
  if (getCurrentInstance()) onUnmounted(stop)
  return shown
}
