/** 剧本生成：年块拼季度、板块年度强弱、两条消息的真答案。全部走注入的 RngLike。 */
import type { GameState, IntelRow, Mode, Quarter, RngLike, SectorId } from '../types'
import { BL } from '../data/blocks'
import { INTEL } from '../data/intel'
import { ORDER } from '../data/sectors'

/** 年度板块超额表：年份 → 板块 → 超额。 */
export type Kty = Record<number, Record<SectorId, number>>

/** 原地洗牌（原 buildMap / 传闻洗牌用的同一套算法）。 */
export function shuffle<T>(arr: T[], rng: RngLike): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

/** 36 年的剧本顺序：史实/迷雾是顺的，抽签是打乱的。 */
export function buildMap(mode: Mode, rng: RngLike): number[] {
  const a: number[] = []
  for (let y = 1991; y <= 2026; y++) a.push(y)
  if (mode === 'draw') shuffle(a, rng)
  return a
}

/** 把年块按剧本拼成 144 个季度，并算出「贵贱」rel。 */
export function buildQuarters(map: readonly number[]): Quarter[] {
  const qs: Quarter[] = []
  for (let i = 0; i < 36; i++) {
    const y = 1991 + i
    const my = map[i] || 1991
    const bs = BL[my] || BL[1991] || []
    bs.forEach(function (b, k) {
      qs.push({ y: y, my: my, q: k + 1, p0: b.p0, hi: b.hi, lo: b.lo, ret: b.ret, bench: 0, rel: 1 })
    })
  }
  qs.forEach(function (q, i) {
    const from = Math.max(0, i - 8)
    let s = 0
    let n = 0
    for (let j = from; j < i; j++) { s += qs[j].p0; n++ }
    q.bench = n ? s / n : q.p0
    q.rel = q.bench ? q.p0 / q.bench : 1
  })
  return qs
}

/** 每年各板块的超额，五者之和为 0，带惯性。 */
export function buildKty(rng: RngLike): Kty {
  const E: Kty = {}
  let prev: Record<SectorId, number> | null = null
  for (let i = 0; i < 36; i++) {
    const y = 1991 + i
    const cur = {} as Record<SectorId, number>
    ORDER.forEach(function (s) {
      cur[s] = (prev ? prev[s] * 0.72 : 0) + (rng.next() - 0.5) * 0.17
    })
    let m = 0
    ORDER.forEach(function (s) { m += cur[s] })
    m /= ORDER.length
    ORDER.forEach(function (s) { cur[s] -= m })
    E[y] = cur
    prev = cur
  }
  return E
}

/** 今年的两条消息：真答案取当年第二强的赛道（不和追涨同源），假的取最弱。 */
export function mkIntel(g: GameState, y: number, my: number): IntelRow | null {
  const it = INTEL[y - 1991]
  if (!it) return null
  let ts: SectorId = it[1]
  let fs: SectorId = it[3]
  const cur = g.s.kty ? g.s.kty[my || y] : null
  if (cur) {
    const ord = ORDER.slice().sort(function (a, b) { return cur[b] - cur[a] })
    ts = ord[1]
    fs = ord[4]
  }
  return [it[0], ts, it[2], fs, it[4]]
}
