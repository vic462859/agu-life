/**
 * canvas 契约 + 值绘制原语。
 * 表现层只许用下面这几个成员（H5 canvas 与小游戏 canvas 的交集），
 * 描边也走 fillRect —— 契约里没有 strokeStyle/lineWidth，别指望它们存在。
 */
import { fitLines } from './text'
import type { Measure } from './text'
import { C, T, font as fontOf, lh, numFont } from './theme'
import type { Rect } from './layout'

export interface Ctx2D {
  fillStyle: string
  font: string
  globalAlpha: number
  fillRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  measureText(text: string): { width: number }
  save(): void
  restore(): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, r: number, a0: number, a1: number): void
  fill(): void
  stroke(): void
}

export interface TextOpts {
  size: number
  weight?: number
  color: string
  /** true = 等宽数字（资产大字用：位数变化时不左右抖）。 */
  mono?: boolean
}

export function setFont(ctx: Ctx2D, size: number, weight?: number): void {
  ctx.font = fontOf(size, weight)
}

function fontFor(o: TextOpts): string {
  const weight = o.weight || 400
  return o.mono ? numFont(o.size, weight) : fontOf(o.size, weight)
}

/** 量宽：先设字体再量，避免量到上一档字号。 */
export function width(ctx: Ctx2D, s: string, size: number, weight?: number, mono?: boolean): number {
  ctx.font = mono ? numFont(size, weight) : fontOf(size, weight)
  return ctx.measureText(s).width
}

/** 单行，y 是基线。 */
export function line(ctx: Ctx2D, s: string, x: number, y: number, o: TextOpts): void {
  ctx.font = fontFor(o)
  ctx.fillStyle = o.color
  ctx.fillText(s, x, y)
}

export function right(ctx: Ctx2D, s: string, xRight: number, y: number, o: TextOpts): void {
  line(ctx, s, xRight - width(ctx, s, o.size, o.weight, o.mono), y, o)
}

export function center(ctx: Ctx2D, s: string, cx: number, y: number, o: TextOpts): void {
  line(ctx, s, cx - width(ctx, s, o.size, o.weight, o.mono) / 2, y, o)
}

/** 段落：自动换行 + 行数上限，返回下一行的基线 y。 */
export function para(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  w: number,
  o: TextOpts,
  maxLines: number = 99,
): number {
  const m: Measure = (s) => width(ctx, s, o.size, o.weight, o.mono)
  const rows = fitLines(text, w, maxLines, m)
  const step = lh(o.size)
  let cy = y
  for (const r of rows) {
    line(ctx, r, x, cy, o)
    cy += step
  }
  return cy
}

/** 一段文字在给定宽度里占几行、总高多少（排版先量后画，避免溢出）。 */
export function paraHeight(ctx: Ctx2D, text: string, w: number, o: TextOpts, maxLines: number = 99): number {
  const m: Measure = (s) => width(ctx, s, o.size, o.weight, o.mono)
  return fitLines(text, w, maxLines, m).length * lh(o.size)
}

/** 填充块，可带 1px 边框（四条 fillRect，不用 strokeStyle）。 */
export function box(ctx: Ctx2D, r: Rect, fill: string, border?: string): void {
  ctx.fillStyle = fill
  ctx.fillRect(r.x, r.y, r.w, r.h)
  if (!border) return
  ctx.fillStyle = border
  ctx.fillRect(r.x, r.y, r.w, 1)
  ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1)
  ctx.fillRect(r.x, r.y, 1, r.h)
  ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h)
}

/** 点线边框：假消息靠「符号 + 边框形态 + 文字标签」三重区分，不只靠颜色。 */
export function dotted(ctx: Ctx2D, r: Rect, color: string): void {
  ctx.fillStyle = color
  for (let x = r.x; x < r.x + r.w; x += 5) {
    ctx.fillRect(x, r.y, 3, 1)
    ctx.fillRect(x, r.y + r.h - 1, 3, 1)
  }
  for (let y = r.y; y < r.y + r.h; y += 5) {
    ctx.fillRect(r.x, y, 1, 3)
    ctx.fillRect(r.x + r.w - 1, y, 1, 3)
  }
}

/** 一条 1px 分隔线。 */
export function rule(ctx: Ctx2D, x: number, y: number, w: number, color: string = C.line0): void {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, 1)
}

/** 主按钮 / 档位块：实心金，一屏只该有一个（一屏两个就分不出主次）。 */
export function pill(
  ctx: Ctx2D,
  r: Rect,
  label: string,
  on: boolean,
  size: number = 14,
): void {
  box(ctx, r, on ? C.gold1 : C.bg3, on ? C.gold0 : C.line1)
  center(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + size * 0.36, {
    size: size,
    weight: 600,
    color: on ? C.inkInv : C.ink0,
  })
}

/** 次按钮：空心 + 细金边。与主按钮是「底 vs 边」两级，不只靠颜色深浅。 */
export function pillSecondary(
  ctx: Ctx2D,
  r: Rect,
  label: string,
  on: boolean,
  size: number = 14,
): void {
  box(ctx, r, on ? C.bg2 : C.bg3, on ? C.line2 : C.line0)
  center(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + size * 0.36, {
    size: size,
    weight: 600,
    color: on ? C.gold0 : C.ink2,
  })
}

/** 轻提示：一行浮在屏幕底部（不占布局、不接点击），由调用方给存活时间。 */
export function notice(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
): void {
  const w = Math.min(maxW, width(ctx, text, T.small) + 28)
  const h = 30
  const bx = x - w / 2
  const prev = ctx.globalAlpha
  ctx.globalAlpha = 0.96
  box(ctx, { x: bx, y: y, w: w, h: h }, C.bg3, C.line2)
  ctx.globalAlpha = prev
  center(ctx, text, x, y + h / 2 + T.small * 0.36, { size: T.small, weight: 600, color: C.ink0 })
}
