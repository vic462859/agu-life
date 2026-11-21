/**
 * 事件卡层：特殊年份事件 / 年底人生事件 / 晚年事件共用一张卡（复用 core 的 pendingView 三型）。
 * 表现为「层叠」而不是「换页」：交易页留在下面被压暗，卡片盖上来。
 *
 * 滚动只走 Layout.at(scroll) 一套：整张卡（含框）随内容一起上移，命中区域登记的是同一批坐标，
 * 所以「画在哪」和「点在哪」永远同一个数 —— 卡里不做第二处偏移减法。
 * 画布里没有 clip，因此卡片不做「固定窗口 + 内部滚动」，而是整张卡上移（框跟着内容走）。
 */
import type { GameState } from '../../core'
import type { PendingEventView } from '../../core'
import { pendingView } from '../../core'
import type { Layout, Rect } from '../layout'
import { box, line, para, paraHeight } from '../paint'
import type { Ctx2D } from '../paint'
import { C, T } from '../theme'

const PAD = 16
const OPT_GAP = 10
/** 选项块内部留白（上/下）。 */
const OPT_PAD = 12
/** 卡片标题行 / 正文标题行的固定高度。 */
const KICK_H = 26
const HEAD_H = 30

interface Weights {
  bodyH: number
  optH: number[]
}

/** 先量后画：框的高度必须在画框之前就知道（没有 clip，框小了会露边，大了会留白）。 */
function weigh(ctx: Ctx2D, v: PendingEventView, w: number): Weights {
  const inner = w - PAD * 2
  const bodyH = paraHeight(ctx, v.body, inner, { size: T.body, color: C.ink1 }, 60)
  const optH = v.options.map(function (o) {
    return OPT_PAD + 20 + 6 + paraHeight(ctx, o.d, inner - 24, { size: T.small, color: C.ink1 }, 6) + OPT_PAD
  })
  return { bodyH: bodyH, optH: optH }
}

/** 遮罩：铺满整屏、压暗下层，并登记一条「吃掉点击但不做任何事」的区域 —— 不许点穿。 */
function mask(ctx: Ctx2D, L: Layout): void {
  ctx.fillStyle = C.mask
  ctx.fillRect(0, 0, L.w, L.h)
  L.hit('mask', { x: 0, y: 0, w: L.w, h: L.h }, true, false)
}

export function renderEvent(ctx: Ctx2D, L: Layout, g: GameState): void {
  mask(ctx, L)
  const v = pendingView(g)
  if (!v) return

  const col = L.col
  const inner = col.w - PAD * 2
  const w = weigh(ctx, v, col.w)
  const whoH = v.who ? 22 : 0
  const optSum = w.optH.reduce(function (a, b) {
    return a + b
  }, 0)
  const total =
    PAD + KICK_H + HEAD_H + w.bodyH + 12 + whoH + optSum + OPT_GAP * Math.max(0, w.optH.length - 1) + PAD

  // 装得下就居中（弹层在屏幕中间，底下的页面只当背景）；装不下就贴顶，交给整卡滚动
  const avail = L.h - col.y * 2
  const top = L.y + (total < avail ? (avail - total) / 2 : 0)
  const frame: Rect = { x: col.x, y: top, w: col.w, h: total }
  box(ctx, frame, C.bg2, C.line1)
  // 顶部一条金线：卡片从哪开始，一眼看得出来
  ctx.fillStyle = C.line2
  ctx.fillRect(frame.x, frame.y, frame.w, 2)

  let y = top + PAD
  line(ctx, v.title, col.x + PAD, y + 14, { size: T.caption, weight: 700, color: C.ink2 })
  y += KICK_H
  line(ctx, v.heading, col.x + PAD, y + T.title, { size: T.title, weight: 600, color: C.gold0 })
  y += HEAD_H
  para(ctx, v.body, col.x + PAD, y + T.body, inner, { size: T.body, color: C.ink1 }, 60)
  y += w.bodyH + 12
  if (v.who) {
    line(ctx, v.who, col.x + PAD, y + 13, { size: T.caption, color: C.ink2 })
    y += whoH
  }

  v.options.forEach(function (o, i) {
    const r: Rect = { x: col.x + PAD, y: y, w: inner, h: w.optH[i] }
    box(ctx, r, C.bg1, o.locked ? C.line0 : C.line1)
    line(ctx, o.k, r.x + 12, r.y + OPT_PAD + 16, { size: T.body, weight: 600, color: C.ink0 })
    para(ctx, o.d, r.x + 12, r.y + OPT_PAD + 40, inner - 24, { size: T.small, color: C.ink1 }, 6)
    L.hit('ev:' + i, r, !o.locked)
    y += w.optH[i] + OPT_GAP
  })

  // 光标推到卡片底边：滚动上限由它算，卡里没有第二个 magic number
  L.seek(top + total)
}
