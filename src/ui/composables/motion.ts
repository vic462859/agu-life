/**
 * 动效时长的 JS 侧。
 *
 * 为什么 JS 里还要一份数字：CSS 的 var(--dur-*) 只对 CSS 过渡有效，而这里有两处
 * 必须由 JS 自己掐时间 ——
 * ① 数字补间（useCountUp 的 setInterval 需要 ms，且要能返回 0 表示"直接就位"）；
 * ② 弹层出场（要等动画播完才撤 v-if，见 useFeel.leave）。
 *
 * 唯一的出处仍是 styles/tokens.css：有 document 时优先读那几个 CSS 变量，
 * 读不到（小程序 / node 测试）才回落到下面的表。两边由 tests/h5-motion.test.ts 对着守，
 * 改 tokens.css 不同步改这里，测试会红。
 *
 * prefers-reduced-motion: reduce 命中时一律返回 0 —— 位移与缩放变瞬时，
 * 但终态、状态机、音效都不受影响（功能完全不变）。
 */

export type DurKind = 'press' | 'modalIn' | 'modalOut' | 'count' | 'rise'

/** 与 tokens.css 的 --dur-* 一一对应（reduced 时 CSS 那边也会归零）。 */
export const DUR: Record<DurKind, number> = {
  press: 120,
  modalIn: 180,
  modalOut: 140,
  count: 460,
  rise: 280,
}

/** 变量名（读 CSS 用时按这张表去取）。 */
export const DUR_VAR: Record<DurKind, string> = {
  press: '--dur-press',
  modalIn: '--dur-modal-in',
  modalOut: '--dur-modal-out',
  count: '--dur-count',
  rise: '--dur-rise',
}

export const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

type MediaLike = { matchMedia?: (q: string) => { matches?: boolean } | null }

/** 命中 reduce 没有。没有 matchMedia（小程序 / node）时按"没命中"处理，版式不动。 */
export function prefersReduced(view?: MediaLike | null): boolean {
  const w = view || (typeof window !== 'undefined' ? (window as unknown as MediaLike) : null)
  if (!w || typeof w.matchMedia !== 'function') return false
  try {
    const m = w.matchMedia(REDUCED_QUERY)
    return !!(m && m.matches)
  } catch (e) {
    return false
  }
}

/** 读一个 --dur-* 变量当前的值（ms）。读不到返回 null。 */
export function cssMs(name: string): number | null {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return null
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    if (!raw) return null
    const ms = /^([0-9.]+)ms$/.exec(raw)
    if (ms) return Number(ms[1])
    const s = /^([0-9.]+)s$/.exec(raw)
    if (s) return Number(s[1]) * 1000
  } catch (e) {
    return null
  }
  return null
}

/**
 * 这一类动效该走多少毫秒。reduced 命中 ⇒ 0（瞬时）。
 * 第二个参数显式给 reduced 是给补间留的退路：一次补间只判一次，中途切系统设置也不会变调。
 */
export function motionMs(kind: DurKind, reduced: boolean = prefersReduced()): number {
  if (reduced) return 0
  const v = cssMs(DUR_VAR[kind])
  const n = v === null ? DUR[kind] : v
  return isFinite(n) && n > 0 ? n : 0
}

/** 数字补间用的缓动：与 useCountUp 里那三行是同一个式子。 */
export function easeOutCubic(k: number): number {
  const t = k < 0 ? 0 : k > 1 ? 1 : k
  return 1 - Math.pow(1 - t, 3)
}

/* ---------------- 文案里的数字：抽出来、补间完再写回去 ----------------
 * 「离上岸还差 8.3×」这一句的数在 core 里算（10/m ×1 位小数），组件不去重算规则，
 * 只把这个数从文案里抽出来补间，再按原样的小数位写回去 —— 于是文案仍然只有 core 一个出处，
 * 而数字能滚。抽不出数字的文案（传说 / 已上岸 / 还没回本）原样返回。 */
const NUM_RE = /([0-9]+(?:\.[0-9]+)?)\s*×/

export function parseLabelNum(text: string): number | null {
  const m = NUM_RE.exec(String(text == null ? '' : text))
  if (!m) return null
  const v = Number(m[1])
  return isFinite(v) ? v : null
}

export function withNum(text: string, n: number): string {
  const s = String(text == null ? '' : text)
  const m = NUM_RE.exec(s)
  if (!m) return s
  const dec = (m[1].split('.')[1] || '').length
  const v = isFinite(n) ? n : Number(m[1])
  return s.slice(0, m.index) + v.toFixed(dec) + s.slice(m.index + m[1].length)
}
