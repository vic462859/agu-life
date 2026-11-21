/**
 * 结局屏：六层依次入场（身份 → 金额 → 12 项复盘 → 档案 → 那三十六年 → 彩蛋），0.26s/层，可跳过。
 * 入场与金额都用注入的 frame(dt) 推进（见 anim.ts），这里不读系统时间：
 * 同一串 dt 画出来的字与位置完全一致，截图能复现。
 *
 * 这一版把 H5 结局卡上的三件东西搬了过来（几何/口径全部复用，不重画一套）：
 *   · 96×120 胸像：ui/share/portrait.ts 的 drawBust + portraitFromEndView
 *   · 36 年指数长图：ui/share/endChart.ts 的 yearlySeries + layoutEndChart
 *   · 一件静物：stillLifeFor(end) 选，drawStillLife 画 —— 与 H5 结局卡调的是同一个函数
 *     （报纸的几何在共享层 ui/share/stillLife.ts，两端不再各有一份）
 * 滚动仍走 Layout.at(scroll)：整屏内容一路向下排，命中区域登记同一批坐标。
 */
import type { GameState } from '../../core'
import { endView, fmt, indexMultipleText } from '../../core'
import type { Layout, Rect } from '../layout'
import { box, center, line, para, paraHeight, pill, pillSecondary, right } from '../paint'
import type { Ctx2D } from '../paint'
import { C, T } from '../theme'
import { layoutEndChart, stillLifeFor } from '../../ui/share/endChart'
import type { StillKind } from '../../ui/share/endChart'
import { drawBust, drawStillLife, portraitFromEndView } from '../../ui/share/portrait'

export interface OverData {
  /** 六层的淡入进度 0..1（与下面 a[0..5] 一一对应）。 */
  alpha: number[]
  /** 金额补间当前值（收敛到 s.asset）。 */
  asset: number
  /** 六层演完没有：没演完只放「跳过」，演完才放开两个按钮。 */
  done: boolean
  /** 36 年指数年线（yearlySeries 的输出）；空数组就不画图，只留文字。 */
  chart: number[]
  /** 这一局带进来的天赋名（空串 = 没带）。 */
  talent: string
  /** 这一局结算到的记忆点（重复进结局页是 0）。 */
  earned: number
  /** 结算后手上的记忆点总数。 */
  points: number
}

const PAD = 12
const ROW_H = 26
/** 结局胸像：96×120 正好是 32×40 逻辑网格的 3 倍。 */
const FACE = { w: 96, h: 120 }
const FACE_GAP = 12
/** 长图与静物同一行：静物摆在长图右边（右下角），不额外占高度。 */
const CHART_H = 118
/** 静物画框：96×96 才够 32×32 网格的 3 倍（96/32 = 3），小一点点就只能 2 倍，看着像一块白斑。 */
const STILL_BOX = 96
const HEAD_H = 20

/** 一层：给它一个透明度画完就还原，免得写两次 globalAlpha。 */
function layer(ctx: Ctx2D, a: number, draw: () => void): void {
  if (a <= 0) return
  const prev = ctx.globalAlpha
  ctx.globalAlpha = prev * a
  draw()
  ctx.globalAlpha = prev
}

function kick(ctx: Ctx2D, s: string, x: number, y: number): void {
  line(ctx, s, x, y, { size: T.caption, weight: 700, color: C.gold0 })
}

/**
 * 36 年指数长图：面积一层 + 2px 折线带 + 进场/离场两根竖标 + 两个点。
 * 几何全部来自 endChart.ts 的 layoutEndChart（对数轴），这里只负责填色。
 */
function indexChart(ctx: Ctx2D, values: number[], r: Rect): void {
  const lay = layoutEndChart(values, r.w, r.h, 6, true)
  const pts = lay.points
  if (pts.length < 2) return
  const bx = r.x
  const by = r.y

  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.fillStyle = C.teal0
  ctx.beginPath()
  ctx.moveTo(bx + pts[0].x, by + lay.baseY)
  for (let i = 0; i < pts.length; i++) ctx.lineTo(bx + pts[i].x, by + pts[i].y)
  ctx.lineTo(bx + pts[pts.length - 1].x, by + lay.baseY)
  ctx.fill()
  ctx.restore()

  // 折线：上沿 + 反向下沿围成一条 2px 宽的带，一次 fill（契约里没有 lineWidth）
  const half = 1.1
  ctx.save()
  ctx.fillStyle = C.gold0
  ctx.beginPath()
  ctx.moveTo(bx + pts[0].x, by + pts[0].y - half)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(bx + pts[i].x, by + pts[i].y - half)
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(bx + pts[i].x, by + pts[i].y + half)
  ctx.fill()
  ctx.restore()

  // 进场 / 离场两根竖标：一眼看出「你在这三十年里哪一段」
  ctx.fillStyle = C.ink2
  ctx.fillRect(bx + Math.round(lay.xFirst), by, 1, lay.baseY)
  ctx.fillRect(bx + Math.round(lay.xLast) - 1, by, 1, lay.baseY)

  ctx.fillStyle = C.ink0
  ctx.beginPath()
  ctx.arc(bx + pts[0].x, by + pts[0].y, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(bx + pts[pts.length - 1].x, by + pts[pts.length - 1].y, 2.6, 0, Math.PI * 2)
  ctx.fill()
}

export function renderOver(ctx: Ctx2D, L: Layout, g: GameState, d: OverData): void {
  const v = endView(g)
  const col = L.col
  const inner = col.w - PAD * 2
  const a = d.alpha
  const open = d.done
  const still: StillKind = stillLifeFor(v)

  // ---- 1 身份：96×120 胸像 + 标题 / 一句话 ----
  const rightW = col.w - FACE.w - FACE_GAP
  const titleH = paraHeight(ctx, v.title, rightW, { size: T.title + 4, weight: 700, color: C.gold0 }, 3)
  const noteH = paraHeight(ctx, v.note, rightW, { size: T.small, color: C.ink1 }, 6)
  const idH = Math.max(FACE.h, titleH + 6 + noteH)
  const top = L.y + 6
  layer(ctx, a[0], function () {
    drawBust(ctx, portraitFromEndView(v), col.x, top + (idH - FACE.h) / 2, FACE.w, FACE.h, { ground: false })
    para(ctx, v.title, col.x + FACE.w + FACE_GAP, top + T.title + 4, rightW, {
      size: T.title + 4,
      weight: 700,
      color: C.gold0,
    }, 3)
    para(ctx, v.note, col.x + FACE.w + FACE_GAP, top + titleH + 6 + T.small, rightW, {
      size: T.small,
      color: C.ink1,
    }, 6)
  })
  L.seek(top + idH + 12)

  // ---- 2 金额（补间值，不是终值）+ 遗嘱 + 天赋/记忆点 ----
  const talentLine = (d.talent ? '带天赋：' + d.talent : '没带天赋 · 纯挑战') +
    '　记忆点 +' + d.earned + '（共 ' + d.points + '）'
  const amount: Rect = L.block(112, 10)
  layer(ctx, a[1], function () {
    box(ctx, amount, C.bg2, C.line0)
    center(ctx, '¥' + fmt(d.asset), L.w / 2, amount.y + 56, {
      size: T.hero + 4,
      weight: 700,
      color: C.ink0,
      mono: true,
    })
    if (v.willNote) {
      center(ctx, v.willNote, L.w / 2, amount.y + 78, { size: T.caption, color: C.ink2 })
    }
    center(ctx, talentLine, L.w / 2, amount.y + 98, { size: T.caption, color: C.teal0 })
  })

  // ---- 3 三十六年复盘（core 给的 12 项，两列） ----
  const rows = v.rows
  const gridH = Math.ceil(rows.length / 2) * ROW_H
  const ledger: Rect = L.block(PAD + 26 + gridH + PAD, 10)
  layer(ctx, a[2], function () {
    box(ctx, ledger, C.bg2, C.line0)
    kick(ctx, '三十六年复盘', ledger.x + PAD, ledger.y + PAD + 14)
    right(ctx, rows.length + ' 项', ledger.x + ledger.w - PAD, ledger.y + PAD + 14, {
      size: T.caption,
      color: C.ink2,
    })
    const cw = (ledger.w - PAD * 2 - 12) / 2
    rows.forEach(function (r, i) {
      const cx = ledger.x + PAD + (i % 2) * (cw + 12)
      const ry = ledger.y + PAD + 26 + Math.floor(i / 2) * ROW_H
      line(ctx, r.label, cx, ry + 17, { size: T.caption, color: C.ink2 })
      right(ctx, r.value, cx + cw, ry + 17, { size: T.small, weight: 600, color: C.ink0 })
    })
  })

  // ---- 4 档案（core 的 profile 六条，一行一个） ----
  const profile = v.profile
  const pLineH = profile.map(function (t) {
    return paraHeight(ctx, t, inner, { size: T.small, color: C.ink1 }, 4)
  })
  const pBodyH = pLineH.reduce(function (x, y) {
    return x + y + 8
  }, 0)
  const file: Rect = L.block(PAD + 26 + pBodyH + PAD, 10)
  layer(ctx, a[3], function () {
    box(ctx, file, C.bg2, C.line0)
    kick(ctx, '档案', file.x + PAD, file.y + PAD + 14)
    right(ctx, '一局一个人', file.x + file.w - PAD, file.y + PAD + 14, { size: T.caption, color: C.ink2 })
    let y = file.y + PAD + 26
    profile.forEach(function (t, i) {
      para(ctx, t, file.x + PAD, y + T.small, inner, { size: T.small, color: C.ink1 }, 4)
      y += pLineH[i] + 8
    })
  })

  // ---- 5 那三十六年：长图 + 静物 + 一段话 ----
  const chartW = inner - STILL_BOX - 12
  const headH = paraHeight(ctx, v.epochHead, inner, { size: T.small, color: C.ink1 }, 5)
  const tailH = paraHeight(ctx, v.epochTail, inner, { size: T.small, color: C.gold0 }, 5)
  const epoch: Rect = L.block(PAD + HEAD_H + CHART_H + 10 + headH + 8 + tailH + PAD, 10)
  const chartY = epoch.y + PAD + HEAD_H
  layer(ctx, a[4], function () {
    box(ctx, epoch, C.bg1, C.line0)
    kick(ctx, '那三十六年 · 指数', epoch.x + PAD, epoch.y + PAD + 14)
    right(ctx, '指数 ' + indexMultipleText(), epoch.x + epoch.w - PAD, epoch.y + PAD + 14, {
      size: T.caption,
      color: C.ink2,
    })
    indexChart(ctx, d.chart, { x: epoch.x + PAD, y: chartY, w: chartW, h: CHART_H })
    // 静物：摆在长图右边，与长图同一行（结局卡右下角那一件的同一套像素图）。
    // 给个框：一件小东西浮在大图旁边会看成一块脏点，框起来才读得出「这是留给你的那一件」。
    const sx = epoch.x + PAD + chartW + 12
    const sy = chartY + (CHART_H - STILL_BOX) / 2
    box(ctx, { x: sx, y: sy, w: STILL_BOX, h: STILL_BOX }, C.bg2, C.line0)
    drawStillLife(ctx, still, sx, sy, STILL_BOX, STILL_BOX)
    para(ctx, v.epochHead, epoch.x + PAD, chartY + CHART_H + 10 + T.small, inner, {
      size: T.small,
      color: C.ink1,
    }, 5)
    para(ctx, v.epochTail, epoch.x + PAD, chartY + CHART_H + 10 + headH + 8 + T.small, inner, {
      size: T.small,
      color: C.gold0,
    }, 5)
  })

  // ---- 6 彩蛋（墓志铭） ----
  const eggH = paraHeight(ctx, v.egg, inner, { size: T.small, color: C.ink2 }, 8)
  const egg: Rect = L.block(PAD + eggH + PAD, 14)
  layer(ctx, a[5], function () {
    box(ctx, egg, C.bg1, C.line0)
    para(ctx, v.egg, egg.x + PAD, egg.y + PAD + T.small, inner, { size: T.small, color: C.ink2 }, 8)
  })

  // ---- 出口：生成战报（主）/ 再来一次（次） ----
  const block: Rect = L.block(48, 14)
  const bw = (block.w - 8) / 2
  const posterBtn: Rect = { x: block.x, y: block.y, w: bw, h: 48 }
  const again: Rect = { x: block.x + bw + 8, y: block.y, w: bw, h: 48 }
  pill(ctx, posterBtn, '生成战报', open, T.body)
  pillSecondary(ctx, again, '再来一次', open, T.body)
  L.hit('poster', posterBtn, open)
  L.hit('again', again, open)
  L.block(8, 0)

  // 「跳过」贴在屏幕右上角（不随内容滚走，也不参与内容高度）
  if (!open) {
    const chip: Rect = { x: L.w - 16 - 64, y: 16, w: 64, h: 26 }
    box(ctx, chip, C.bg3, C.line1)
    center(ctx, '跳过', chip.x + chip.w / 2, chip.y + chip.h / 2 + T.caption * 0.36, {
      size: T.caption,
      weight: 600,
      color: C.ink1,
    })
    L.hit('skip', chip, true, false)
  }
}
