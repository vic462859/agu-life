/**
 * 图表几何内核 —— 纯 TS。
 * 硬约束：不含 uni./window./document.，不含 Date / 随机数（渲染必须确定性）。
 * H5 canvas、小程序 canvas、CSS 降级视图三处共用这一份结果，
 * 所以「同一份输入」在三处逐点一致，截图可复现。
 */

/** 一个数据点：t 是标签（年份/季度/序号），v 是数值。 */
export interface SeriesPoint {
  t: string
  v: number
}

/** 内边距（CSS 像素）。 */
export interface Padding {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PathOptions {
  width: number
  height: number
  /** 数字 = 四边相同；对象 = 缺的边取默认 8。 */
  padding?: number | Partial<Padding>
  /** true 时把 0 纳入 y 域，并给出 zeroY（画零轴用）。 */
  zeroLine?: boolean
  /**
   * 固定 y 域 [min, max]。不传 = 按本串数据自己的极值自动缩放。
   * 传了才能横向比坡度：多张图共用同一把尺子时，涨得多的那条就该更陡。
   */
  domain?: readonly [number, number] | null
}

export interface PathResult {
  /** SVG 风格的折线路径，M/L 开头。空数据为 ''。 */
  line: string
  /** 折线 + 回落到基线 + Z 的填充路径。不足 2 个点时为 ''。 */
  area: string
  /** 每个点的画布 x（CSS 像素）。 */
  xs: number[]
  /** 每个点的画布 y（CSS 像素）。 */
  ys: number[]
  yMin: number
  yMax: number
  /** zeroLine 生效时为 0 值对应的 y，否则 null。 */
  zeroY: number | null
  padding: Padding
}

/** 一次画布尺寸的三种口径，全部由 dpr 决定，不许在别处再乘一次。 */
export interface CanvasSize {
  /** CSS 像素宽——**几何唯一允许使用的宽度**。 */
  cssW: number
  /** CSS 像素高——同上。 */
  cssH: number
  dpr: number
  /** 位图像素宽 = cssW * dpr。只给 canvas.width 用。 */
  bitmapW: number
  /** 位图像素高 = cssH * dpr。只给 canvas.height 用。 */
  bitmapH: number
}

/**
 * CSS 尺寸 → 位图尺寸的唯一换算点。
 * 约定：pathFromPoints 永远吃 cssW/cssH，setTransform(dpr) 只负责把 CSS 坐标放大到位图。
 * 两者乘两次 = 内容被放大 dpr 倍、只剩一角在画布里（M1-C 的 dsf≥2 事故）。
 */
export function resolveCanvasSize(cssW: number, cssH: number, dpr: number): CanvasSize {
  const w = Math.max(1, Math.round(isFinite(cssW) && cssW > 0 ? cssW : 1))
  const h = Math.max(1, Math.round(isFinite(cssH) && cssH > 0 ? cssH : 1))
  const d = isFinite(dpr) && dpr > 0 ? Math.min(4, dpr) : 1
  return {
    cssW: w,
    cssH: h,
    dpr: d,
    bitmapW: Math.max(1, Math.round(w * d)),
    bitmapH: Math.max(1, Math.round(h * d)),
  }
}

const DEFAULT_PAD = 8

/** 保留 2 位小数：路径字符串要稳定，浮点尾巴会让 H5 与小程序算出不同字符。 */
function r2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 1/2/5/10 × 10^n 里最接近 raw 的那个。 */
function niceNum(raw: number, round: boolean): number {
  if (!isFinite(raw) || raw <= 0) return 1
  const exp = Math.floor(Math.log10(raw))
  const pow = Math.pow(10, exp)
  const f = raw / pow
  let nf: number
  if (round) {
    if (f < 1.5) nf = 1
    else if (f < 3) nf = 2
    else if (f < 7) nf = 5
    else nf = 10
  } else {
    if (f <= 1) nf = 1
    else if (f <= 2) nf = 2
    else if (f <= 5) nf = 5
    else nf = 10
  }
  return nf * pow
}

/**
 * 对齐到 1/2/5 刻度。数到 count 条左右，至少 3 条。
 * min === max（或极值差 < 1e-12）时先撑开一个对称区间，绝不返回空或 NaN。
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!isFinite(min) || !isFinite(max)) return []
  let lo = Math.min(min, max)
  let hi = Math.max(min, max)
  const c = Math.max(2, Math.min(12, Math.floor(count) || 5))
  if (hi - lo < 1e-12) {
    const pad = Math.abs(hi) * 0.1 || 1
    lo -= pad
    hi += pad
  }
  const step = niceNum(niceNum(hi - lo, false) / (c - 1), true)
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const out: number[] = []
  for (let i = 0; i < 64; i++) {
    const v = start + i * step
    if (v > end + step * 1e-9) break
    // 浮点累加会带出重复值，用相对容差去重。
    const last = out.length ? out[out.length - 1] : null
    if (last === null || Math.abs(v - last) > step * 1e-6) out.push(v)
  }
  if (!out.length) out.push(lo, hi)
  return out
}

export interface ScaleLinear {
  (v: number): number
  /** 反解：像素 → 数值。 */
  invert(p: number): number
  domain: [number, number]
  range: [number, number]
}

/** 数值域 → 像素域。域退化（min === max）时全部落中线上，不产生 NaN。 */
export function scaleLinear(
  domain: readonly number[],
  range: readonly number[],
): ScaleLinear {
  const d0 = Number(domain[0])
  const d1 = Number(domain[1])
  const r0 = Number(range[0])
  const r1 = Number(range[1])
  const span = d1 - d0
  const flat = !isFinite(span) || Math.abs(span) < 1e-12
  const mid = (r0 + r1) / 2
  const fn = function (v: number): number {
    if (!isFinite(v)) return mid
    if (flat) return mid
    return r0 + ((v - d0) / span) * (r1 - r0)
  } as ScaleLinear
  fn.domain = [d0, d1]
  fn.range = [r0, r1]
  fn.invert = function (p: number): number {
    if (flat || !isFinite(p) || r1 === r0) return d0
    return d0 + ((p - r0) / (r1 - r0)) * span
  }
  return fn
}

/** 数值数组 → 数据点。缺标签时用下标；非有限数按 0 处理（不把 NaN 带进几何）。 */
export function toSeries(
  values: readonly number[],
  labels?: readonly string[],
): SeriesPoint[] {
  const out: SeriesPoint[] = []
  const n = values ? values.length : 0
  for (let i = 0; i < n; i++) {
    const v = values[i]
    const lb = labels ? labels[i] : undefined
    out.push({ t: lb == null ? String(i) : String(lb), v: isFinite(Number(v)) ? Number(v) : 0 })
  }
  return out
}

/**
 * 保形抽稀（min-max 分桶）：输出长度 <= maxPoints，且首尾点必留。
 * 用于 144 季以外的长序列在窄屏上落地，不引入任何平滑误差。
 */
export function downsample(values: readonly number[], maxPoints: number): number[] {
  const n = values ? values.length : 0
  if (!n) return []
  const cap = Math.floor(Number(maxPoints))
  if (!isFinite(cap) || cap < 1) return []
  if (n <= cap) return values.slice(0, n)
  if (cap < 4) return [values[0]]
  const buckets = Math.max(1, Math.floor((cap - 2) / 2))
  const step = n / buckets
  const picked: number[] = [0]
  const push = function (i: number): void {
    if (picked[picked.length - 1] !== i) picked.push(i)
  }
  for (let b = 0; b < buckets; b++) {
    const s = Math.floor(b * step)
    const e = Math.min(n, Math.floor((b + 1) * step))
    let mi = s
    let ma = s
    for (let i = s; i < e; i++) {
      if (values[i] < values[mi]) mi = i
      if (values[i] > values[ma]) ma = i
    }
    if (mi <= ma) {
      push(mi)
      push(ma)
    } else {
      push(ma)
      push(mi)
    }
  }
  if (picked[picked.length - 1] !== n - 1) picked.push(n - 1)
  const out: number[] = []
  for (let i = 0; i < picked.length; i++) out.push(values[picked[i]])
  return out
}

function resolvePadding(p: PathOptions['padding'], w: number, h: number): Padding {
  const lim = Math.max(0, Math.min(w, h) / 2)
  const clamp = function (v: number): number {
    return isFinite(v) ? Math.max(0, Math.min(lim, v)) : 0
  }
  if (typeof p === 'number' && isFinite(p)) {
    const v = clamp(p)
    return { top: v, right: v, bottom: v, left: v }
  }
  const o = (p || {}) as Partial<Padding>
  return {
    top: clamp(o.top == null ? DEFAULT_PAD : Number(o.top)),
    right: clamp(o.right == null ? DEFAULT_PAD : Number(o.right)),
    bottom: clamp(o.bottom == null ? DEFAULT_PAD : Number(o.bottom)),
    left: clamp(o.left == null ? DEFAULT_PAD : Number(o.left)),
  }
}

/**
 * 点集 → 画布路径。空数据 / 零尺寸返回空字符串而不是抛错；
 * 单点返回一个 M（组件据此画圆点）；全等值落在中线上。
 */
export function pathFromPoints(
  points: readonly (SeriesPoint | number)[],
  opts: PathOptions,
): PathResult {
  const width = Number(opts.width)
  const height = Number(opts.height)
  const padding = resolvePadding(opts.padding, width, height)
  const empty: PathResult = {
    line: '',
    area: '',
    xs: [],
    ys: [],
    yMin: 0,
    yMax: 0,
    zeroY: null,
    padding,
  }
  const src = points || []
  const n = src.length
  if (!n || !isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) return empty

  const vs: number[] = []
  for (let i = 0; i < n; i++) {
    const raw = src[i]
    const v = typeof raw === 'number' ? raw : raw ? Number(raw.v) : NaN
    vs.push(isFinite(v) ? v : 0)
  }

  let lo = vs[0]
  let hi = vs[0]
  for (let i = 1; i < n; i++) {
    if (vs[i] < lo) lo = vs[i]
    if (vs[i] > hi) hi = vs[i]
  }
  // 外部给的固定域优先：多张图共用一把尺子，坡度才可比。
  const fixed = opts.domain
  if (fixed && fixed.length === 2 && isFinite(fixed[0]) && isFinite(fixed[1]) && fixed[0] !== fixed[1]) {
    lo = Math.min(fixed[0], fixed[1])
    hi = Math.max(fixed[0], fixed[1])
  } else if (opts.zeroLine) {
    if (lo > 0) lo = 0
    if (hi < 0) hi = 0
  }
  if (hi - lo < 1e-9) {
    const pad = Math.abs(hi) * 0.5 || 1
    lo -= pad
    hi += pad
  }

  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom
  const xAt =
    n === 1
      ? function (): number {
          return padding.left + innerW / 2
        }
      : scaleLinear([0, n - 1], [padding.left, padding.left + innerW])
  const yAt = scaleLinear([lo, hi], [padding.top + innerH, padding.top])

  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < n; i++) {
    xs.push(r2(xAt(i)))
    ys.push(r2(yAt(vs[i])))
  }

  let line = 'M' + xs[0] + ' ' + ys[0]
  for (let i = 1; i < n; i++) line += 'L' + xs[i] + ' ' + ys[i]

  let area = ''
  if (n > 1) {
    const base = r2(padding.top + innerH)
    area = line + 'L' + xs[n - 1] + ' ' + base + 'L' + xs[0] + ' ' + base + 'Z'
  }

  return {
    line,
    area,
    xs,
    ys,
    yMin: lo,
    yMax: hi,
    zeroY: opts.zeroLine ? r2(yAt(0)) : null,
    padding,
  }
}
