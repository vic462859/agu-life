/**
 * 交易页（MG2）：顶栏 / 目标条 / 贵贱条 / 板块 / 仓位 / 消息卡 / 行动点+七扇门 / 日志流。
 * 数值与文案全部来自 core 的 tradeView / intelView / SUBS，这里只做排版与命中。
 *
 * 竖直预算：一屏放不下，所以整页滚动由 Layout.at(scroll) 承担；
 * view 里所有坐标都当成「滚动前」的坐标写，命中区域登记同一批坐标。
 * 日志自己是第二层滚动：行高量化，只画窗口里那几行（见 logrows.ts）。
 */
import type { GameState, TradeView } from '../../core'
import { AP_PER_YEAR, SUBS, fmt, positionViews, progOf, sectorViews, tradeView } from '../../core'
import type { Layout, Rect } from '../layout'
import { LOG_AREA_ID, logRowH, logViewH, windowSlice } from '../logrows'
import type { LogRow } from '../logrows'
import { box, center, dotted, line, para, paraHeight, pill, pillSecondary, right, rule, width } from '../paint'
import type { Ctx2D } from '../paint'
import { truncate } from '../text'
import { BAR_TONE, C, T, TONE, ZONE_COLOR } from '../theme'
// 人物与板块走势都直接吃 H5 那两个纯函数模块：它们只 import core 的类型，不带任何 DOM。
import { drawPortrait, portraitFromTradeView } from '../../ui/share/portrait'
import { sectorSeries } from '../../ui/share/sectorSeries'

export interface TradeData {
  state: GameState
  /** 已经按年份分组拍平的日志行（窗口化的原料）。 */
  rows: LogRow[]
  /** 日志内层滚动偏移（像素，行高整数倍）。 */
  logScroll: number
  /** 当前展开的门 id。 */
  openGate: string | null
  delta: number | null
  deltaPct: number | null
  deltaLabel: string
  /** 资产大字的补间现值（结算时滚动；与 v.asset 的差就是「还在滚」）。 */
  asset: number
  /** 音效开关（顶栏那个 chip 的状态）。 */
  sfxOn: boolean
  /** 震动开关（顶栏那个 chip 的状态）。 */
  hapticOn: boolean
}

const PAD = 12
const GAP = 10
const SEC_H = 46
const SEC_GAP = 6

const TOP = { kick: 22, num: 38, delta: 20, where: 18, yline: 18, attr: 20, bar: 22 }
/** 顶栏头像：40×48（H5 那边是 37×48 的同一张图，这里给到 40 宽）。 */
const FACE_W = 40
const FACE_H = 48
const GOAL = { head: 20, track: 22, scale: 18, label: 20 }
const ZONE = { head: 20, bar: 20, text: 18 }
const ACT = { head: 22, gate: 46, ggap: 8, probe: 34, sub: 46, btn: 48, btnGap: 10 }

/** 一行文字的基线：把「行盒中心 + 字号视觉重心」算在一处。 */
function mid(y: number, h: number, size: number): number {
  return y + h / 2 + size * 0.36
}

function panel(ctx: Ctx2D, L: Layout, h: number, gap: number = GAP): Rect {
  const r = L.block(h, gap)
  box(ctx, r, C.bg2, C.line0)
  return r
}

function kick(ctx: Ctx2D, s: string, x: number, y: number): void {
  line(ctx, s, x, y, { size: T.caption, weight: 700, color: C.gold0 })
}

function goalColor(tone: TradeView['goal']['tone']): string {
  return tone === 'gold' ? C.gold0 : tone === 'ok' ? C.teal0 : tone === 'bad' ? C.red0 : C.ink1
}

function deltaColor(d: number | null): string {
  if (d === null || Math.abs(d) <= 0.5) return C.ink2
  return d > 0 ? C.red0 : C.teal0
}

/** 顶栏：资产大字 + 本季 Δ + 年龄/连盈 + 盘感人脉声望 + 家/身体两条进度条。 */
function topBar(ctx: Ctx2D, L: Layout, v: TradeView, d: TradeData): void {
  const h = PAD + TOP.kick + TOP.num + TOP.delta + TOP.where + (v.yearLine ? TOP.yline : 0) + TOP.attr +
    TOP.bar * v.bars.length + PAD
  const r = panel(ctx, L, h)
  // 头像竖着塞在牌子左上角：40×48 全落在「账户资产 + 大字」这两行里，
  // 所以牌子的高度一个像素都没变（分区预算见报告：头像不占新高度）。
  drawPortrait(ctx, portraitFromTradeView(v), r.x + PAD, r.y + PAD, FACE_W, FACE_H, {
    halo: false,
    ground: false,
  })
  const x = r.x + PAD + FACE_W + 10
  const w = r.w - PAD * 2 - FACE_W - 10
  let y = r.y + PAD

  kick(ctx, '账户资产', x, y + 14)
  // 第一行右侧的 chip（从右往左）：音效开关 / 震动开关 / 连盈（连盈为 none 时不占位）。
  // 两个开关都压成「两字 + 开/关」：内容列量过，再长就会顶到左边的「账户资产」。
  const chipH = TOP.kick - 4
  let cr = r.x + r.w - PAD
  const toggles: { id: string; text: string; on: boolean }[] = [
    { id: 'sfx', text: d.sfxOn ? '音效开' : '音效关', on: d.sfxOn },
    { id: 'hb', text: d.hapticOn ? '震动开' : '震动关', on: d.hapticOn },
  ]
  for (const t of toggles) {
    const tw = width(ctx, t.text, T.caption, 600) + 10
    const chip: Rect = { x: cr - tw, y: y, w: tw, h: chipH }
    box(ctx, chip, C.bg3, t.on ? C.line2 : C.line1)
    center(ctx, t.text, chip.x + tw / 2, mid(y, chipH, T.caption), {
      size: T.caption,
      weight: 600,
      color: t.on ? C.gold0 : C.ink2,
    })
    L.hit(t.id, chip, true)
    cr -= tw + 6
  }
  if (v.streak.tone !== 'none') {
    const sc = v.streak.tone === 'win' ? C.red0 : C.teal0
    const sw = width(ctx, v.streak.text, T.caption, 600) + 16
    box(ctx, { x: cr - sw, y: y, w: sw, h: chipH }, C.bg3, sc)
    center(ctx, v.streak.text, cr - sw / 2, mid(y, chipH, T.caption), {
      size: T.caption,
      weight: 600,
      color: sc,
    })
  }
  y += TOP.kick

  line(ctx, '¥', x, y + TOP.num - 12, { size: T.small, weight: 600, color: C.gold1 })
  const curW = width(ctx, '¥', T.small, 600)
  // 大字读的是补间值（d.asset）：结算后从旧数滚到新数，连点也不会排队
  const numText = fmt(d.asset)
  line(ctx, numText, x + curW + 4, y + TOP.num - 10, {
    size: T.hero,
    weight: 700,
    color: C.gold0,
    mono: true,
  })
  // 年龄挪到这一行右端：第一行要摆两个开关 + 连盈，内容列放不下四个 chip
  right(ctx, v.age + ' 岁', r.x + r.w - PAD, y + TOP.num - 12, {
    size: T.caption,
    weight: 600,
    color: C.ink1,
  })
  y += TOP.num

  const sign = d.delta === null ? '' : d.delta > 0 ? '+' : d.delta < 0 ? '−' : ''
  const pct =
    d.deltaPct === null
      ? ''
      : '（' + (d.deltaPct > 0 ? '+' : d.deltaPct < 0 ? '−' : '') + Math.abs(d.deltaPct).toFixed(1) + '%）'
  const dText = d.delta === null ? d.deltaLabel + ' —' : d.deltaLabel + ' ' + sign + fmt(Math.abs(d.delta)) + pct
  line(ctx, dText, x, y + 14, { size: T.small, weight: 600, color: deltaColor(d.delta) })
  right(ctx, v.yearText + ' 年 · Q' + v.quarter, r.x + r.w - PAD, y + 14, { size: T.small, color: C.ink1 })
  y += TOP.delta

  const where = truncate(v.whereText, w, (s) => width(ctx, s, T.caption))
  line(ctx, where, x, y + 13, { size: T.caption, color: C.ink2 })
  y += TOP.where

  if (v.yearLine) {
    const yl = truncate(v.yearLine, w, (s) => width(ctx, s, T.caption))
    line(ctx, yl, x, y + 13, { size: T.caption, color: C.ink1 })
    y += TOP.yline
  }

  // 盘感 / 人脉 / 声望（+ 案底）：核心给几项就画几项
  let ax = x
  for (const a of v.attrs) {
    const s = a.label + ' ' + a.value
    line(ctx, s, ax, y + 13, { size: T.caption, weight: 600, color: a.danger ? C.red0 : C.ink1 })
    ax += width(ctx, s, T.caption, 600) + 16
  }
  y += TOP.attr

  for (const b of v.bars) {
    line(ctx, b.label, x, mid(y, TOP.bar, T.caption) + 2, { size: T.caption, color: C.ink1 })
    const labW = 34
    const tw = w - labW - 36
    const track: Rect = { x: x + labW, y: y + 7, w: tw, h: 8 }
    box(ctx, track, C.bg3)
    const fw = Math.max(0, Math.min(tw, (tw * b.value) / 100))
    if (fw > 0) box(ctx, { x: track.x, y: track.y, w: fw, h: 8 }, BAR_TONE[b.tone])
    // 两道阈值刻度：30 与 55，与 core 的 barTone 同源（家 <30 红 / <55 黄 / 否则青）
    ctx.fillStyle = C.line2
    ctx.fillRect(track.x + tw * 0.3, track.y - 2, 1, 12)
    ctx.fillRect(track.x + tw * 0.55, track.y - 2, 1, 12)
    right(ctx, String(b.value), r.x + r.w - PAD, mid(y, TOP.bar, T.caption) + 2, {
      size: T.caption,
      weight: 600,
      color: C.ink1,
    })
    y += TOP.bar
  }
}

/** 目标条：对数刻度 0.5×–50×，1× 与 10× 两根刻度线 + 游标 + 「离上岸还差 N×」。 */
function goalBar(ctx: Ctx2D, L: Layout, v: TradeView): void {
  const h = PAD + GOAL.head + GOAL.track + GOAL.scale + GOAL.label + PAD
  const r = panel(ctx, L, h)
  const x = r.x + PAD
  const w = r.w - PAD * 2
  let y = r.y + PAD

  kick(ctx, '上岸进度', x, y + 13)
  const ratio = v.goal.ratio
  const ratioText = '×' + (ratio >= 10 ? ratio.toFixed(1) : ratio.toFixed(2)) + ' / 0.5–50×'
  right(ctx, ratioText, r.x + r.w - PAD, y + 13, { size: T.caption, color: C.ink1 })
  y += GOAL.head

  const track: Rect = { x: x, y: y + 8, w: w, h: 6 }
  box(ctx, track, C.bg3)
  const pct = progOf(ratio)
  const fw = Math.max(2, track.w * pct)
  box(ctx, { x: track.x, y: track.y, w: fw, h: 6 }, C.gold1)
  // 1× / 10× 两根刻度线（对数换算直接用 core 的 progOf，不在这里重算一遍）
  ctx.fillStyle = C.ink1
  ctx.fillRect(track.x + track.w * progOf(1), track.y - 4, 1, 14)
  ctx.fillRect(track.x + track.w * progOf(10), track.y - 4, 1, 14)
  // 当前位置游标
  ctx.fillStyle = C.gold0
  ctx.fillRect(track.x + Math.max(0, Math.min(track.w, track.w * pct)) - 1, track.y - 7, 3, 20)
  y += GOAL.track

  const scale: Array<[number, string]> = [
    [0, '0.5×'],
    [progOf(1), '1×'],
    [progOf(10), '10×'],
    [1, '50×'],
  ]
  for (const [at, label] of scale) {
    const px = track.x + track.w * at
    const lw = width(ctx, label, T.caption)
    const lx = at === 0 ? px : at === 1 ? px - lw : px - lw / 2
    line(ctx, label, lx, y + 12, { size: T.caption, color: C.ink2 })
  }
  y += GOAL.scale

  line(ctx, v.goal.label, x, y + 14, { size: T.small, weight: 600, color: goalColor(v.goal.tone) })
  right(ctx, v.goal.fromText, r.x + r.w - PAD, y + 14, { size: T.caption, color: C.ink2 })
}

/** 贵贱条：五档 + 游标 + 「比最近两年均价 便宜/贵 X%」。 */
function zoneBar(ctx: Ctx2D, L: Layout, v: TradeView): void {
  const h = PAD + ZONE.head + ZONE.bar + ZONE.text + PAD
  const r = panel(ctx, L, h)
  const x = r.x + PAD
  const w = r.w - PAD * 2
  let y = r.y + PAD

  kick(ctx, '贵贱', x, y + 13)
  right(ctx, v.zone.word, r.x + r.w - PAD, y + 13, {
    size: T.small,
    weight: 700,
    color: v.zone.tone === 'gold' ? C.gold0 : v.zone.tone === 'ok' ? C.teal0 : C.ink1,
  })
  y += ZONE.head

  const segGap = 3
  const segW = (w - segGap * 4) / 5
  for (let i = 0; i < 5; i++) {
    const sr: Rect = { x: x + i * (segW + segGap), y: y, w: segW, h: 12 }
    box(ctx, sr, C.bg3, i === v.zone.index ? C.ink0 : C.line0)
    ctx.fillStyle = ZONE_COLOR[i]
    ctx.fillRect(sr.x + 1, sr.y + 1, sr.w - 2, 3)
  }
  // 游标位置直接用 core 算好的 offsetPct（8% / 29% / 50% / 71% / 92%）
  const zp = Math.max(0, Math.min(1, parseFloat(v.zone.offsetPct) / 100))
  ctx.fillStyle = C.ink0
  ctx.fillRect(x + w * zp - 1, y - 4, 3, 20)
  y += ZONE.bar

  const zt = truncate(v.zone.text, w, (s) => width(ctx, s, T.caption))
  line(ctx, zt, x, y + 13, { size: T.caption, color: C.ink1 })
}

/** 迷你走势的尺寸（右下角，不占卡的高度）。 */
const SPARK = { w: 56, h: 14 }

/**
 * 一条 1px 折线：契约里没有 lineWidth，按列填竖条拼出来。
 * 数是 sectorSeries 给的「该板块相对大盘的累积超额」，首点 = 100 —— 不是板块点位。
 */
function spark(ctx: Ctx2D, series: number[], r: Rect, color: string): void {
  const n = series.length
  if (n < 2) return
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < n; i++) {
    if (series[i] < lo) lo = series[i]
    if (series[i] > hi) hi = series[i]
  }
  const span = hi - lo
  const yAt = function (v: number): number {
    return span < 1e-9 ? r.y + r.h / 2 : r.y + r.h - ((v - lo) / span) * r.h
  }
  ctx.fillStyle = color
  for (let i = 1; i < n; i++) {
    const x0 = r.x + (r.w * (i - 1)) / (n - 1)
    const x1 = r.x + (r.w * i) / (n - 1)
    const y0 = yAt(series[i - 1])
    const y1 = yAt(series[i])
    const cols = Math.max(1, Math.round(x1 - x0))
    for (let s = 0; s < cols; s++) {
      const t = cols === 1 ? 1 : s / cols
      ctx.fillRect(x0 + s, y0 + (y1 - y0) * t, 1, 1)
    }
  }
  // 末点：现在走到哪了一目了然
  ctx.fillStyle = C.gold0
  ctx.fillRect(r.x + r.w - 1, yAt(series[n - 1]) - 1, 2, 2)
}

function sectorCards(ctx: Ctx2D, L: Layout, v: TradeView, g: GameState): void {
  for (const s of v.sectors) {
    const r = L.block(SEC_H, SEC_GAP)
    box(ctx, r, s.on ? C.bg3 : C.bg1, s.on ? C.gold2 : C.line0)
    line(ctx, s.book, r.x + PAD, r.y + 20, { size: T.body, weight: 600, color: s.on ? C.gold0 : C.ink0 })
    // 左下的副标要让出右下角那条走势的宽度
    const sub = truncate(s.sub, r.w - PAD * 2 - SPARK.w - 10, (t) => width(ctx, t, T.caption))
    line(ctx, sub, r.x + PAD, r.y + 38, { size: T.caption, color: C.ink2 })
    right(ctx, s.k, r.x + r.w - PAD, r.y + 20, { size: T.small, color: C.ink1 })
    spark(
      ctx,
      sectorSeries(g.map, g.s.kty, s.id, g.s.qi, 12),
      { x: r.x + r.w - PAD - SPARK.w, y: r.y + 28, w: SPARK.w, h: SPARK.h },
      s.on ? C.gold0 : C.ink1,
    )
    L.hit('sector:' + s.id, r, true)
  }
}

function positionRow(ctx: Ctx2D, L: Layout, v: TradeView): void {
  const prow = L.block(38, 8)
  const gap = 8
  const pw = (prow.w - gap * 3) / 4
  v.positions.forEach((p, i) => {
    const r: Rect = { x: prow.x + i * (pw + gap), y: prow.y, w: pw, h: prow.h }
    pill(ctx, r, p.label, p.on, T.small)
    L.hit('pos:' + p.value, r, true)
  })

  // 杠杆 / 止损：开合状态用「实心/空心 + 文字」两重区分，不只靠颜色
  const frow = L.block(26, GAP)
  const fw = (frow.w - 8) / 2
  const flags: Array<[string, boolean, string]> = [
    ['lev', v.lev, '杠杆'],
    ['stop', v.stop, '止损'],
  ]
  flags.forEach(([id, on, label], i) => {
    const r: Rect = { x: frow.x + i * (fw + 8), y: frow.y, w: fw, h: frow.h }
    box(ctx, r, on ? C.bg3 : C.bg1, on ? C.gold2 : C.line0)
    line(ctx, label, r.x + 10, mid(r.y, r.h, T.caption), { size: T.caption, weight: 600, color: C.ink0 })
    right(ctx, on ? '● 已开' : '○ 已关', r.x + r.w - 10, mid(r.y, r.h, T.caption), {
      size: T.caption,
      weight: 600,
      color: on ? C.gold0 : C.ink2,
    })
    L.hit(id, r, true)
  })
}

/** 消息卡：甲/乙两行 + 打探按钮 + hint。真假靠符号 ◆/◇ + 实线/点线边框 + 文字标签。 */
function intelCard(ctx: Ctx2D, L: Layout, v: TradeView, apLeft: number): void {
  const iv = v.intel
  if (!iv.visible) return
  const inner = L.col.w - PAD * 2
  const textW = inner - 34
  const rowHs = iv.rows.map(function (row) {
    return 24 + paraHeight(ctx, row.text, textW, { size: T.small, color: C.ink1 }, 2) + 6
  })
  const hintH = paraHeight(ctx, iv.hint, inner, { size: T.caption, color: C.ink2 }, 3)
  const h = PAD + 22 + rowHs.reduce((a, b) => a + b, 0) + 10 + hintH + PAD
  const r = panel(ctx, L, h)
  const x = r.x + PAD
  let y = r.y + PAD

  kick(ctx, '今年的两条消息', x, y + 14)
  const canProbe = iv.canProbe && apLeft > 0
  const probeText = iv.canProbe ? '打探 · 1 次' : '已摸清来路'
  const pw = width(ctx, probeText, T.caption, 600) + 18
  const pr: Rect = { x: r.x + r.w - PAD - pw, y: y, w: pw, h: 22 }
  box(ctx, pr, iv.canProbe && canProbe ? C.gold1 : C.bg3, iv.canProbe && canProbe ? C.gold0 : C.line1)
  center(ctx, probeText, pr.x + pr.w / 2, mid(pr.y, pr.h, T.caption), {
    size: T.caption,
    weight: 600,
    color: iv.canProbe && canProbe ? C.inkInv : C.ink2,
  })
  L.hit('probe', pr, canProbe)
  y += 22

  iv.rows.forEach(function (row, i) {
    const rh = rowHs[i]
    const rr: Rect = { x: x, y: y, w: inner, h: rh }
    if (row.truth === 't') box(ctx, rr, C.bg1, C.gold0)
    else if (row.truth === 'f') {
      box(ctx, rr, C.bg1)
      dotted(ctx, rr, C.red0)
    } else box(ctx, rr, C.bg1, C.line0)

    const glyph = row.truth === 't' ? '◆' : row.truth === 'f' ? '◇' : '·'
    const tag = row.truth === 't' ? '真' : row.truth === 'f' ? '假的' : '未核'
    const tagColor = row.truth === 't' ? C.gold0 : row.truth === 'f' ? C.red0 : C.ink2
    line(ctx, glyph, rr.x + 10, rr.y + 18, { size: T.body, color: tagColor })
    line(ctx, row.name, rr.x + 26, rr.y + 18, { size: T.small, weight: 700, color: C.ink0 })
    const nameW = width(ctx, row.name, T.small, 700)
    line(ctx, tag, rr.x + 30 + nameW, rr.y + 18, { size: T.caption, weight: 600, color: tagColor })
    para(ctx, row.text, rr.x + 26, rr.y + 36, textW, { size: T.small, color: C.ink1 }, 2)
    y += rh
  })

  y += 10
  para(ctx, iv.hint, x, y + 10, inner, { size: T.caption, color: C.ink2 }, 3)
}

/** 行动点 + 七扇门 + 子行动 + 过一季/过一年。 */
function actionBlock(ctx: Ctx2D, L: Layout, v: TradeView, d: TradeData): void {
  const groups = v.groups
  const cols = 2
  const rows = Math.ceil(groups.length / cols)
  const open = d.openGate
  const subs = open ? SUBS[open] || [] : []
  const subsH = subs.length ? 8 + subs.length * ACT.sub : 0
  const h = PAD + ACT.head + rows * ACT.gate + (rows - 1) * ACT.ggap + ACT.ggap + ACT.probe + subsH +
    ACT.btnGap + ACT.btn + PAD
  const r = panel(ctx, L, h)
  const x = r.x + PAD
  const w = r.w - PAD * 2
  let y = r.y + PAD

  kick(ctx, '今年还能动', x, y + 14)
  // 行动点：AP_PER_YEAR 个格子，用了的就空了
  let cx = r.x + r.w - PAD
  right(ctx, v.apText, cx, y + 14, { size: T.caption, color: C.ink1 })
  cx -= width(ctx, v.apText, T.caption) + 10
  for (let i = 0; i < AP_PER_YEAR; i++) {
    const on = i < v.apLeft
    const cr: Rect = { x: cx - 12, y: y + 2, w: 12, h: 12 }
    box(ctx, cr, on ? C.gold0 : C.bg3, on ? C.gold0 : C.line1)
    cx -= 16
  }
  y += ACT.head

  const gw = (w - 8) / cols
  /** 禁用的门先登记（enabled=false），下面再盖一层提示区：点得到，但不做事，只给一句话。 */
  const blocked: Rect[] = []
  groups.forEach(function (g, i) {
    const col = i % cols
    const rowI = Math.floor(i / cols)
    const gr: Rect = {
      x: x + col * (gw + 8),
      y: y + rowI * (ACT.gate + ACT.ggap),
      w: gw,
      h: ACT.gate,
    }
    const active = open === g.id
    box(ctx, gr, active ? C.bg3 : C.bg1, active ? C.gold0 : g.disabled ? C.line0 : C.line1)
    line(ctx, g.t, gr.x + 10, gr.y + 20, {
      size: T.body,
      weight: 600,
      color: g.disabled ? C.ink2 : active ? C.gold0 : C.ink0,
    })
    const desc = truncate(g.d, gr.w - 20, (s) => width(ctx, s, T.caption))
    line(ctx, desc, gr.x + 10, gr.y + 36, { size: T.caption, color: C.ink2 })
    L.hit('gate:' + g.id, gr, !g.disabled)
    if (v.apLeft <= 0) blocked.push(gr)
  })
  y += rows * ACT.gate + (rows - 1) * ACT.ggap + ACT.ggap

  // 第七扇门：打探（消息卡的同一件事，这里再给一个入口）
  const pr: Rect = { x: x, y: y, w: w, h: ACT.probe }
  const probeOn = v.intel.visible && v.intel.canProbe && v.apLeft > 0
  box(ctx, pr, C.bg1, probeOn ? C.line1 : C.line0)
  line(ctx, '打探', pr.x + 10, mid(pr.y, pr.h, T.body), {
    size: T.body,
    weight: 600,
    color: probeOn ? C.ink0 : C.ink2,
  })
  const sub = truncate('花 1 次，看清甲和乙哪条是真的', pr.w - 110, (s) => width(ctx, s, T.caption))
  line(ctx, sub, pr.x + 52, mid(pr.y, pr.h, T.caption), { size: T.caption, color: C.ink2 })
  const doorTag = !v.intel.visible ? '—' : v.intel.canProbe ? '1 次' : '已用'
  right(ctx, doorTag, pr.x + pr.w - 10, mid(pr.y, pr.h, T.caption), {
    size: T.caption,
    weight: 600,
    color: probeOn ? C.gold0 : C.ink2,
  })
  L.hit('probe-door', pr, probeOn)
  if (v.apLeft <= 0) blocked.push(pr)
  y += ACT.probe

  if (subs.length) {
    y += 8
    const rep = d.state.s.rep
    subs.forEach(function (s, i) {
      const sr: Rect = { x: x, y: y + i * ACT.sub, w: w, h: ACT.sub - 4 }
      const need = typeof s.need === 'number'
      const ok = v.apLeft > 0 && (!need || rep >= (s.need as number))
      box(ctx, sr, C.bg1, ok ? C.line1 : C.line0)
      line(ctx, s.t, sr.x + 10, sr.y + 19, {
        size: T.small,
        weight: 600,
        color: ok ? C.ink0 : C.ink2,
      })
      const dd = truncate(s.d, sr.w - 110, (t) => width(ctx, t, T.caption))
      line(ctx, dd, sr.x + 10, sr.y + 35, { size: T.caption, color: C.ink2 })
      if (need) {
        right(ctx, '声望 ' + s.need, sr.x + sr.w - 10, sr.y + 19, {
          size: T.caption,
          color: rep >= (s.need as number) ? C.teal0 : C.red0,
        })
      }
      L.hit('sub:' + open + ':' + i, sr, ok)
    })
  }
  y += subsH

  // 两个按钮两级权重：过一季是这一步的正事（实心金），过一年 ×4 是快进（空心）
  y += ACT.btnGap
  const bw = (w - 8) / 2
  const q: Rect = { x: x, y: y, w: bw, h: ACT.btn }
  const yr: Rect = { x: x + bw + 8, y: y, w: bw, h: ACT.btn }
  pill(ctx, q, '过一季', v.canStep, T.body)
  pillSecondary(ctx, yr, '过一年 ×4', v.canStep, T.body)
  L.hit('step', q, v.canStep)
  L.hit('year', yr, v.canStep)

  // 行动点用完了还去点门：不许静默 —— 盖一层同坐标的 'ap' 区，点了只弹一句提示
  blocked.forEach(function (r) {
    L.hit('ap', r, true)
  })
}

/** 日志流：窗口化虚拟滚动（只画可见的 7 行）+ 年份分组 + tone 配色。 */
function logPanel(ctx: Ctx2D, L: Layout, d: TradeData): void {
  const viewH = logViewH()
  const h = PAD + 22 + viewH + PAD
  const r = panel(ctx, L, h)
  const x = r.x + PAD
  const w = r.w - PAD * 2
  let y = r.y + PAD

  kick(ctx, '流水', x, y + 14)
  const n = d.rows.filter(function (row) {
    return row.kind === 'item'
  }).length
  right(ctx, n + ' 条 · 最新在下', r.x + r.w - PAD, y + 14, { size: T.caption, color: C.ink2 })
  y += 22

  const vp: Rect = { x: x, y: y, w: w, h: viewH }
  box(ctx, vp, C.bg1, C.line0)
  // 登记一条禁用区域：它不参与点击，只把「日志区在哪」告诉手势分发（内层先消费）
  L.hit(LOG_AREA_ID, vp, false)

  if (!d.rows.length) {
    line(ctx, '还没有发生任何事。', vp.x + 10, vp.y + logRowH(), { size: T.caption, color: C.ink2 })
    return
  }

  const rh = logRowH()
  const win = windowSlice(d.rows, d.logScroll, viewH)
  for (let i = win.start; i < win.end; i++) {
    const row = d.rows[i]
    const ry = vp.y + (i - win.start) * rh
    if (row.kind === 'year') {
      const ty = mid(ry, rh, T.caption)
      line(ctx, row.text, vp.x + 10, ty, { size: T.caption, weight: 700, color: C.gold0 })
      const tw = width(ctx, row.text, T.caption, 700)
      rule(ctx, vp.x + 14 + tw, ty - 4, Math.max(0, vp.w - 22 - tw), C.line0)
    } else {
      const text = truncate(row.text, vp.w - 16, (s) => width(ctx, s, T.caption))
      line(ctx, text, vp.x + 10, mid(ry, rh, T.caption), { size: T.caption, color: TONE[row.tone] })
    }
  }
}

export function renderTrade(ctx: Ctx2D, L: Layout, d: TradeData): void {
  const v = tradeView(d.state)

  topBar(ctx, L, v, d)
  goalBar(ctx, L, v)
  zoneBar(ctx, L, v)
  sectorCards(ctx, L, v, d.state)
  positionRow(ctx, L, v)
  intelCard(ctx, L, v, v.apLeft)
  actionBlock(ctx, L, v, d)
  logPanel(ctx, L, d)
  L.block(8, 0)
}
