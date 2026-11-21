/**
 * 结局卡的 36 年指数长图：只做几何与口径，不碰 canvas。
 * 数据来自 core：buildQuarters(map) 的季度点位；这里只做抽样与像素映射。
 * 纯函数：同样的序列 + 同样的画框 ⇒ 同样的点（不读时间、不取随机数）。
 */
import type { EndView } from '../../core'

export interface ChartPoint {
  x: number
  y: number
  /** 这一点的指数点位（原始值，不换算）。 */
  v: number
}

export interface EndChartLayout {
  points: ChartPoint[]
  /** 起点与终点的 x（画两条竖标记）。 */
  xFirst: number
  xLast: number
  yAt: (v: number) => number
  yMin: number
  yMax: number
  /** 面积的下边界（贴住画框底）。 */
  baseY: number
  /** 指数本身走了几倍（末点 / 首点）。 */
  indexMultiple: number
}

/** 四季一年的季度序列 → 每年取一个点（36 年 + 末点，最多 37 个）。 */
export function yearlySeries(quarterly: readonly number[]): number[] {
  const out: number[] = []
  const n = quarterly ? quarterly.length : 0
  for (let i = 0; i < n; i += 4) {
    const v = Number(quarterly[i])
    out.push(isFinite(v) ? v : 0)
  }
  if (n > 0) {
    const last = Number(quarterly[n - 1])
    if (isFinite(last) && out[out.length - 1] !== last) out.push(last)
  }
  return out
}

/**
 * 数值序列 → 画布坐标。x 等距铺满画框，y 按 [yMin, yMax] 线性映射；
 * 序列全等（或只有一个点）时落在中线，绝不出 NaN。
 */
export function layoutEndChart(
  values: readonly number[],
  width: number,
  height: number,
  padding = 10,
  /** true = 对数轴（对数只压缩"涨了很多倍"的那一段，单调性不变）。 */
  logScale = false,
): EndChartLayout {
  const w = Math.max(1, Number(width) || 1)
  const h = Math.max(1, Number(height) || 1)
  const pad = Math.max(0, Math.min(Number(padding) || 0, Math.min(w, h) / 3))
  const vals: number[] = []
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i])
    vals.push(isFinite(v) ? v : 0)
  }
  const n = vals.length
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < n; i++) {
    if (vals[i] < lo) lo = vals[i]
    if (vals[i] > hi) hi = vals[i]
  }
  const flat = n === 0 || !(hi - lo > 1e-9)
  if (n === 0) lo = 0
  if (flat) {
    const mid = n ? (lo + hi) / 2 : 0
    lo = mid - 1
    hi = mid + 1
  }
  const baseY = h - pad
  const topY = pad
  // 对数轴只在小值域上生效：有 <=0 的点就退回线性，不让 NaN 进来
  const useLog = logScale && lo > 0
  const logLo = useLog ? Math.log(lo) : 0
  const logSpan = useLog ? Math.log(hi) - logLo : 0
  const yAt = function (v: number): number {
    const n = Number(v)
    const t = useLog && logSpan > 1e-12 ? (Math.log(Math.max(n, lo)) - logLo) / logSpan : (n - lo) / (hi - lo)
    return baseY - t * (baseY - topY)
  }
  const points: ChartPoint[] = []
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? pad + (w - 2 * pad) / 2 : pad + ((w - 2 * pad) * i) / (n - 1)
    points.push({ x: x, y: yAt(vals[i]), v: vals[i] })
  }
  const first = n ? vals[0] : 0
  return {
    points: points,
    xFirst: points.length ? points[0].x : pad,
    xLast: points.length ? points[points.length - 1].x : w - pad,
    yAt: yAt,
    yMin: n ? lo : 0,
    yMax: n ? hi : 0,
    baseY: baseY,
    indexMultiple: first > 0 && n ? vals[n - 1] / first : 1,
  }
}

export type StillKind = 'glass' | 'case' | 'paper' | 'cane' | 'pill'

function rowNum(end: EndView, label: string): number {
  for (let i = 0; i < end.rows.length; i++) {
    if (end.rows[i].label !== label) continue
    const n = parseFloat(String(end.rows[i].value).replace(/[^0-9.-]/g, ''))
    return isFinite(n) ? n : 0
  }
  return 0
}

/**
 * 结局 → 一件象征物（纯函数，可单测）。
 * 判定顺序与理由：
 *   1. 爆仓 / 倍率 < 1 → paper（揉皱的报纸：这一把没做成）
 *   2. 倍率 ≥ 20（wealth ≥ 3 同一口径）→ glass（喝一杯）
 *   3. 身体 < 20 → pill（药瓶）
 *   4. 70 岁以上且身体不在壮年（< 50）→ cane（手杖）
 *   5. 其余 → case（公文包：还在场子里的人）
 * 注：这张卡永远写"八十五岁"，所以年龄从调用方传（缺省 85）；
 * 若把 cane 放在 pill 之前、且不给 cane 加健康条件，85 岁的人会一律拿到手杖，
 * case 这一档在这款游戏里就永远看不到 —— 因此 pill 先于 cane，cane 额外要求 health < 50。
 */
export function stillLifeFor(end: EndView, age = 85): StillKind {
  // 连"倍数"都没读到（存档缺失/字段改名）：不猜，退回最中性的一件
  let hasMult = false
  for (let i = 0; i < end.rows.length; i++) if (end.rows[i].label === '倍数') hasMult = true
  if (!hasMult) return 'case'
  const mult = rowNum(end, '倍数')
  const health = rowNum(end, '身体')
  const busted = end.title.indexOf('爆仓') >= 0
  if (busted || mult < 1) return 'paper'
  if (mult >= 20) return 'glass'
  if (health < 20) return 'pill'
  if (age >= 70 && health < 50) return 'cane'
  return 'case'
}