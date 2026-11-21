/**
 * 把几何结果画到 2D 上下文。
 * ctx 用结构化类型描述（H5 与小程序 2d canvas 的公共子集），所以这里既不 import
 * 任何平台 API，也不需要 `any`。
 */
import type { Padding } from './geometry'

export interface GradientLike {
  addColorStop(stop: number, color: string): void
}

export interface Ctx2D {
  save(): void
  restore(): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  closePath(): void
  stroke(): void
  fill(): void
  arc(x: number, y: number, r: number, a0: number, a1: number): void
  clearRect(x: number, y: number, w: number, h: number): void
  setLineDash?(d: number[]): void
  createLinearGradient?(x0: number, y0: number, x1: number, y1: number): GradientLike | null
  fillText?(t: string, x: number, y: number): void
  globalAlpha: number
  lineWidth: number
  strokeStyle: unknown
  fillStyle: unknown
  lineCap: string
  lineJoin: string
  font?: string
  textAlign?: string
  textBaseline?: string
}

export interface ChartFrame {
  width: number
  height: number
  padding: Padding
}

/** #rgb / #rrggbb → rgba()。非法颜色原样返回（不抛）。 */
export function withAlpha(color: string, alpha: number): string {
  const c = String(color || '').trim()
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
  if (!m) return c
  const h = m[1]
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
}

/** 横向网格线。ticks 是数值刻度，scaleY 把它换成像素。 */
export function drawGrid(
  ctx: Ctx2D,
  frame: ChartFrame,
  ticks: readonly number[],
  scaleY: (v: number) => number,
  color: string,
  lineWidth = 1,
): void {
  if (!ticks.length) return
  const x0 = frame.padding.left
  const x1 = frame.width - frame.padding.right
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  for (let i = 0; i < ticks.length; i++) {
    const y = Math.round(scaleY(ticks[i])) + 0.5
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
  }
  ctx.restore()
}

/** 零轴（一条更实的横线）。 */
export function drawZero(ctx: Ctx2D, y: number, frame: ChartFrame, color: string): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(frame.padding.left, Math.round(y) + 0.5)
  ctx.lineTo(frame.width - frame.padding.right, Math.round(y) + 0.5)
  ctx.stroke()
  ctx.restore()
}

/** 折线下方的填充。有 createLinearGradient 就渐变，没有就纯色半透明。 */
export function drawArea(
  ctx: Ctx2D,
  frame: ChartFrame,
  xs: readonly number[],
  ys: readonly number[],
  baseY: number,
  accent: string,
): void {
  const n = xs.length
  if (n < 2) return
  ctx.save()
  let style: unknown = withAlpha(accent, 0.16)
  if (typeof ctx.createLinearGradient === 'function') {
    const g = ctx.createLinearGradient(0, frame.padding.top, 0, baseY)
    if (g && typeof g.addColorStop === 'function') {
      g.addColorStop(0, withAlpha(accent, 0.32))
      g.addColorStop(1, withAlpha(accent, 0.02))
      style = g
    }
  }
  ctx.fillStyle = style
  ctx.beginPath()
  ctx.moveTo(xs[0], baseY)
  for (let i = 0; i < n; i++) ctx.lineTo(xs[i], ys[i])
  ctx.lineTo(xs[n - 1], baseY)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** 折线本体。 */
export function drawLine(
  ctx: Ctx2D,
  xs: readonly number[],
  ys: readonly number[],
  accent: string,
  lineWidth = 2,
): void {
  const n = xs.length
  if (!n) return
  ctx.save()
  ctx.strokeStyle = accent
  ctx.lineWidth = lineWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (n === 1) {
    // 单点画不出线，画一个实心圆代替。
    ctx.fillStyle = accent
    ctx.arc(xs[0], ys[0], lineWidth, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.moveTo(xs[0], ys[0])
    for (let i = 1; i < n; i++) ctx.lineTo(xs[i], ys[i])
    ctx.stroke()
  }
  ctx.restore()
}

/** 一个圆点。 */
export function drawDot(
  ctx: Ctx2D,
  x: number,
  y: number,
  r: number,
  color: string,
  ringWidth = 2,
  ringColor = '',
): void {
  ctx.save()
  if (ringColor && ringWidth > 0) {
    ctx.beginPath()
    ctx.strokeStyle = ringColor
    ctx.lineWidth = ringWidth
    ctx.arc(x, y, r + ringWidth, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export interface MarkSpec {
  idx: number
  label?: string
  color?: string
}

/** 当前位置标记：一条竖虚线 + 圆点 + 可选文字。idx 越界直接跳过。 */
export function drawMarks(
  ctx: Ctx2D,
  frame: ChartFrame,
  marks: readonly MarkSpec[],
  xs: readonly number[],
  ys: readonly number[],
  accent: string,
  labelColor: string,
): void {
  if (!marks || !marks.length) return
  for (let i = 0; i < marks.length; i++) {
    const mk = marks[i]
    const idx = Math.floor(Number(mk && mk.idx))
    if (!isFinite(idx) || idx < 0 || idx >= xs.length) continue
    const color = (mk && mk.color) || accent
    const x = xs[idx]
    const y = ys[idx]
    ctx.save()
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([3, 3])
    ctx.strokeStyle = withAlpha(color, 0.55)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(Math.round(x) + 0.5, frame.padding.top)
    ctx.lineTo(Math.round(x) + 0.5, frame.height - frame.padding.bottom)
    ctx.stroke()
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([])
    ctx.restore()
    drawDot(ctx, x, y, 3, color, 2, withAlpha(color, 0.35))
    const text = mk && mk.label
    if (text && typeof ctx.fillText === 'function') {
      ctx.save()
      ctx.fillStyle = labelColor
      if (typeof ctx.font === 'string') ctx.font = '10px sans-serif'
      ctx.textAlign = x > frame.width * 0.72 ? 'right' : 'left'
      ctx.textBaseline = 'top'
      ctx.globalAlpha = 0.95
      const tx = x > frame.width * 0.72 ? x - 5 : x + 5
      ctx.fillText(String(text), tx, Math.max(frame.padding.top, Math.min(y - 14, frame.height - frame.padding.bottom - 12)))
      ctx.restore()
    }
  }
}
