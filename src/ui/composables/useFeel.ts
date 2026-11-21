/**
 * 「手感」接线：声音与出场时机（按下态的"样子"在 CSS 里，不在这）。
 *
 * 三件事：
 * ① 解锁：浏览器的自动播放策略要求 AudioContext 在手势里创建/resume，
 *    所以 document 上的第一个 pointerdown / keydown 就调 sfx.unlock()（capture 阶段，抢在所有 @tap 之前）。
 * ② 点击音：每一次按下可点元素给一声轻点击。判定表 PRESSABLE 与 base.css 的统一按下态规则
 *    是同一张表 —— 有按下态的地方就有声音，加一个可点元素两处各加一行（测试盯着别漂）。
 * ③ 出场：弹层先挂 .ag-leave（140ms 反向动画）、播完才撤 v-if。reduced-motion 下等 0ms。
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import { motionMs } from './motion'
import type { Sfx, UiSfx } from '../../platform/audio'

/** 有按下态、也有点击音的那些选择器（与 base.css「V2a 手感」那块的清单一致）。 */
export const PRESSABLE_LIST = [
  '.ag-btn',
  '.ag-tool',
  '.ag-chip',
  '.ag-skip',
  '.ag-pick',
  '.ag-scard',
  '.ag-seg-i',
  '.ag-flag',
  '.ag-door',
  '.ag-opt',
  '.ag-mini',
  '.ag-ifold',
  '.ag-lfold',
  '.ag-c-fold',
]

export const PRESSABLE = PRESSABLE_LIST.join(',')

/** 这个事件目标算不算"可点元素"。只认 closest，认不出来就当不是（不猜）。 */
export function isPressable(target: unknown): boolean {
  const el = target as { closest?: (sel: string) => unknown } | null
  if (!el || typeof el.closest !== 'function') return false
  try {
    return !!el.closest(PRESSABLE)
  } catch (e) {
    return false
  }
}

/**
 * 结算的方向音：涨一声、跌一声，平盘不响（±0.5 是显示的取整门槛，跟 AssetHead 的 delta 同源）。
 * 纯函数，测试里可以直接喂数。
 */
export function settleSound(delta: number | null | undefined): UiSfx | null {
  if (delta == null || !isFinite(delta)) return null
  if (delta > 0.5) return 'gain'
  if (delta < -0.5) return 'fall'
  return null
}

export interface LeaveEnv {
  /** 注入 document 替身（测试用）；给 null 就当作没有 DOM。 */
  doc?: { querySelector?: (sel: string) => unknown } | null
  /** 注入定时器（测试用）。 */
  schedule?: (fn: () => void, ms: number) => void
}

/**
 * 出场：给弹层挂上 .ag-leave，等 ms 之后才执行 run（run 里才真正把 v-if 关掉）。
 * 返回 true 表示真的在播动画（有元素且时长 > 0）；返回 false 表示当场执行。
 */
export function leaveThen(sel: string, ms: number, run: () => void, env: LeaveEnv = {}): boolean {
  const doc = env.doc !== undefined ? env.doc : typeof document !== 'undefined' ? (document as unknown as LeaveEnv['doc']) : null
  const el = doc && typeof doc.querySelector === 'function' && ms > 0 ? (doc.querySelector(sel) as { classList?: { add(c: string): void } } | null) : null
  if (!el || !el.classList || typeof el.classList.add !== 'function') {
    run()
    return false
  }
  el.classList.add('ag-leave')
  const schedule = env.schedule || function (fn: () => void, m: number) {
    setTimeout(fn, m)
  }
  schedule(run, ms)
  return true
}

export interface Feel {
  /** 触发一次带出场的关闭；动画期间重复调用会被吞掉（防止连点把两次 choose 排进同一次）。 */
  leave(sel: string, run: () => void): void
  leaving: Ref<boolean>
  /** 结算方向音（页面拿到 delta 后调）。 */
  settle(delta: number | null | undefined): void
  /** 事件/弹层出现的提示音（不刺耳的那一声）。 */
  pop(): void
}

export function useFeel(sfx: Sfx): Feel {
  const leaving = ref(false)

  function leave(sel: string, run: () => void): void {
    if (leaving.value) return
    const ms = motionMs('modalOut')
    if (ms <= 0) {
      run()
      return
    }
    leaving.value = true
    leaveThen(sel, ms, function () {
      leaving.value = false
      run()
    })
  }

  function settle(delta: number | null | undefined): void {
    const s = settleSound(delta)
    if (s) sfx.play(s)
  }

  function pop(): void {
    sfx.play('intel')
  }

  // #ifdef H5
  let off: (() => void) | null = null
  onMounted(function () {
    if (typeof document === 'undefined') return
    function onDown(e: Event): void {
      sfx.unlock()
      if (isPressable(e.target)) sfx.play('click')
    }
    function onKey(e: KeyboardEvent): void {
      sfx.unlock()
      const k = e.key
      if (k === ' ' || k === 'Spacebar' || k === 'Enter' || k === 'l' || k === 'L' || k === 's' || k === 'S' || (k >= '1' && k <= '4')) {
        sfx.play('click')
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    off = function () {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  })
  onUnmounted(function () {
    if (off) {
      off()
      off = null
    }
  })
  // #endif

  return { leave: leave, leaving: leaving, settle: settle, pop: pop }
}
