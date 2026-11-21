/** 战报卡的数据整理与绘制：纯函数，不碰平台 API（canvas 上下文由调用方给）。 */
import type { EndView } from '../../core'
import { P } from './palette'
import { drawQr } from './qr'

export const POSTER_W = 1080
export const POSTER_H = 1440

/** 只声明用得到的 2D 能力：双端 canvas 2d 都满足。 */
export interface PosterCtx {
  save(): void
  restore(): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, r: number, a0: number, a1: number): void
  closePath(): void
  fill(): void
  stroke(): void
  fillRect(x: number, y: number, w: number, h: number): void
  clearRect(x: number, y: number, w: number, h: number): void
  createLinearGradient?(x0: number, y0: number, x1: number, y1: number): { addColorStop(o: number, c: string): void } | null
  fillText?(t: string, x: number, y: number): void
  measureText?(t: string): { width: number }
  setLineDash?(d: number[]): void
  font?: string
  textAlign?: string
  textBaseline?: string
  fillStyle?: unknown
  strokeStyle?: unknown
  lineWidth?: number
  globalAlpha?: number
}

export interface PosterData {
  title: string
  note: string
  willNote: string
  startText: string
  finalText: string
  multiple: string
  maxDD: string
  bestStreak: string
  seasons: string
  highlights: string[]
  /** 年代标签（80s…20s），画在标题右侧当印章。 */
  eraLabel: string
}

function rowOf(end: EndView, label: string): string {
  for (let i = 0; i < end.rows.length; i++) if (end.rows[i].label === label) return end.rows[i].value
  return ''
}

/** 从档案里挑 2 条最有画面的：带数字、够长、有转折词的优先；仍按原文顺序输出。 */
export function pickHighlights(lines: string[]): string[] {
  const scored: { i: number; s: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i] || ''
    if (t.length < 12) continue
    const digits = (t.match(/[0-9]/g) || []).length
    const verbs = (t.match(/亏|赚|换|追|忍|留|卖|买|满仓|空仓/g) || []).length
    const s = digits * 3 + verbs * 2 + Math.min(t.length, 60) / 10
    scored.push({ i: i, s: s })
  }
  scored.sort(function (a, b) { return b.s - a.s })
  const picked = scored.slice(0, 2).map(function (x) { return x.i }).sort(function (a, b) { return a - b })
  return picked.map(function (i) { return lines[i] })
}

export function buildPosterData(end: EndView, assetText: string, eraLabel = ''): PosterData {
  return {
    title: end.title,
    note: end.note,
    willNote: end.willNote,
    startText: rowOf(end, '起始'),
    finalText: assetText,
    multiple: rowOf(end, '倍数'),
    maxDD: rowOf(end, '最大回撤'),
    bestStreak: rowOf(end, '最长连盈'),
    seasons: rowOf(end, '交易季数'),
    highlights: pickHighlights(end.profile),
    eraLabel: eraLabel,
  }
}

/* ---------- 绘制小工具 ---------- */

/** 量宽前必须先把字体设成目标字号，否则量到的是上一段的字号（会算小、然后溢出）。 */
function estWidth(ctx: PosterCtx, t: string, size: number): number {
  setFont(ctx, size, false)
  if (typeof ctx.measureText === 'function') {
    try {
      const m = ctx.measureText(t)
      if (m && isFinite(m.width)) return m.width
    } catch (e) {
      /* 落到估算 */
    }
  }
  let w = 0
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i)
    w += c > 255 ? size : size * 0.58
  }
  return w
}

function setFont(ctx: PosterCtx, size: number, bold: boolean): void {
  ctx.font = (bold ? 'bold ' : '') + size + 'px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
}

function wrap(ctx: PosterCtx, text: string, size: number, maxW: number): string[] {
  setFont(ctx, size, false)
  const out: string[] = []
  let line = ''
  for (let i = 0; i < text.length; i++) {
    const next = line + text[i]
    if (estWidth(ctx, next, size) > maxW && line) {
      out.push(line)
      line = text[i]
    } else {
      line = next
    }
  }
  if (line) out.push(line)
  return out
}

function roundRect(ctx: PosterCtx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0)
  ctx.lineTo(x + w, y + h - r)
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2)
  ctx.lineTo(x + r, y + h)
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI)
  ctx.lineTo(x, y + r)
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5)
  ctx.closePath()
}

function text(ctx: PosterCtx, t: string, x: number, y: number, size: number, color: string, bold: boolean, align: string): void {
  if (typeof ctx.fillText !== 'function') return
  setFont(ctx, size, bold)
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(t, x, y)
}

/* ---------- 主绘制 ---------- */

export function drawPoster(ctx: PosterCtx, d: PosterData): void {
  const W = POSTER_W
  const H = POSTER_H
  const pad = 80

  ctx.clearRect(0, 0, W, H)
  const g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, H) : null
  if (g) {
    g.addColorStop(0, P.bg1)
    g.addColorStop(1, P.bg0)
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = P.bg0
  }
  ctx.fillRect(0, 0, W, H)

  // 网格（与 UI 背景同一种语汇）
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'
  ctx.lineWidth = 1
  for (let x = 0; x <= W; x += 54) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = 0; y <= H; y += 54) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  // 顶部金光
  if (ctx.createLinearGradient) {
    const gl = ctx.createLinearGradient(0, 0, 0, 460)
    if (gl) {
      gl.addColorStop(0, 'rgba(246,207,114,0.20)')
      gl.addColorStop(1, 'rgba(246,207,114,0)')
      ctx.fillStyle = gl
      ctx.fillRect(0, 0, W, 460)
    }
  }

  // 页眉
  text(ctx, 'A股人生 · 1991—2026', pad, 92, 28, P.ink2, false, 'left')
  text(ctx, '36 年 · 144 季', W - pad, 92, 28, P.ink2, false, 'right')
  ctx.strokeStyle = P.line
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pad, 120)
  ctx.lineTo(W - pad, 120)
  ctx.stroke()

  // 标题（长标题自动缩字号）
  let tSize = 104
  while (tSize > 54 && estWidth(ctx, d.title, tSize) > W - pad * 2) tSize -= 6
  text(ctx, d.title, pad, 260, tSize, P.gold, true, 'left')

  // 年代印章（标题右侧，标题太长就不画，避免压字）
  if (d.eraLabel) {
    const tw = estWidth(ctx, d.title, tSize)
    const sw = estWidth(ctx, d.eraLabel, 26) + 40
    const sx = W - pad - sw
    if (pad + tw + 40 < sx) {
      ctx.setLineDash && ctx.setLineDash([])
      roundRect(ctx, sx, 200, sw, 52, 12)
      ctx.strokeStyle = P.gold1
      ctx.lineWidth = 2
      ctx.stroke()
      text(ctx, d.eraLabel, sx + 20, 236, 26, P.gold1, false, 'left')
    }
  }

  // 一句话
  let y = 322
  setFont(ctx, 34, false)
  const notes = wrap(ctx, d.note, 34, W - pad * 2)
  for (let i = 0; i < notes.length && i < 3; i++) {
    text(ctx, notes[i], pad, y, 34, P.ink1, false, 'left')
    y += 48
  }
  if (d.willNote) {
    y += 8
    text(ctx, d.willNote, pad, y, 28, P.ink2, false, 'left')
    y += 40
  }

  // 起点 → 终点
  const boxY = Math.max(y + 40, 470)
  roundRect(ctx, pad, boxY, W - pad * 2, 214, 20)
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  ctx.fill()
  ctx.strokeStyle = P.line
  ctx.lineWidth = 2
  ctx.stroke()

  const halfW = (W - pad * 2) / 2
  text(ctx, '起始', pad + 40, boxY + 62, 28, P.ink2, false, 'left')
  text(ctx, d.startText || '—', pad + 40, boxY + 122, 48, P.ink0, true, 'left')
  text(ctx, '最终', pad + halfW + 30, boxY + 62, 28, P.ink2, false, 'left')
  text(ctx, d.finalText || '—', pad + halfW + 30, boxY + 126, 60, P.gold, true, 'left')
  text(ctx, '→', pad + halfW - 26, boxY + 118, 40, P.ink2, false, 'center')

  // 三个统计块
  const chipY = boxY + 250
  const chips = [
    { k: '倍数', v: d.multiple || '—' },
    { k: '最多回撤', v: d.maxDD || '—' },
    { k: '最长连盈', v: d.bestStreak || '—' },
  ]
  const chipW = (W - pad * 2 - 24 * 2) / 3
  for (let i = 0; i < chips.length; i++) {
    const x = pad + i * (chipW + 24)
    roundRect(ctx, x, chipY, chipW, 132, 18)
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    ctx.fill()
    ctx.strokeStyle = P.line
    ctx.lineWidth = 2
    ctx.stroke()
    text(ctx, chips[i].k, x + 26, chipY + 46, 24, P.ink2, false, 'left')
    text(ctx, chips[i].v, x + 26, chipY + 100, 40, P.ink0, true, 'left')
  }

  // 两条档案高光
  let hy = chipY + 200
  text(ctx, '这一局的两句话', pad, hy, 26, P.ink2, false, 'left')
  hy += 40
  for (let i = 0; i < d.highlights.length && i < 2; i++) {
    const lines = wrap(ctx, d.highlights[i], 34, W - pad * 2 - 44)
    const rows = Math.min(lines.length, 3)
    ctx.fillStyle = P.gold1
    ctx.fillRect(pad, hy - 30, 5, 30 + (rows - 1) * 52)
    for (let k = 0; k < rows; k++) {
      text(ctx, lines[k], pad + 28, hy, 34, P.ink1, false, 'left')
      hy += 52
    }
    hy += 26
  }

  // 页脚
  // 页脚分隔线在二维码左侧收口，避免压到码
  const qr = 190
  const qx = W - pad - qr
  const qy = H - 24 - qr
  ctx.strokeStyle = P.line
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pad, H - 168)
  ctx.lineTo(qx - 24, H - 168)
  ctx.stroke()

  text(ctx, '模拟游戏，不构成投资建议', pad, H - 108, 28, P.ink2, false, 'left')
  if (d.seasons) text(ctx, '交易 ' + d.seasons, pad, H - 66, 26, P.ink2, false, 'left')

  // 右下角二维码：扫了直接开线上 H5
  drawQr(ctx, qx, qy, qr, '#f2f4f7', '#0a0f14')
}
