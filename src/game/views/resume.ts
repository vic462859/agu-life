/**
 * 续玩弹层：启动时读到能接的存档才出现，两个明确选项（继续 / 重开），不让人误点。
 * 与事件卡同一套层：压暗下面那屏（出身页）+ 卡片 + 两个选项。
 */
import type { GameState } from '../../core'
import { fmt } from '../../core'
import type { Layout, Rect } from '../layout'
import { box, line, para, paraHeight } from '../paint'
import type { Ctx2D } from '../paint'
import { C, T } from '../theme'

const PAD = 16
const OPT_GAP = 10
const OPT_PAD = 13

/** 存档一句话：从 core 的局面里读，不自己记一份。 */
function savedLine(g: GameState): string {
  const s = g.s
  const phase = g.phase === 'trade' ? '交易期' : g.phase === 'late' ? '晚年' : '已结束'
  const mode = g.mode === 'real' ? '史实' : g.mode === 'fog' ? '迷雾' : '抽签'
  const season = g.phase === 'trade' ? '第 ' + (s.qi + 1) + ' 季 · ' : ''
  return phase + ' · ' + season + '账户 ¥' + fmt(s.asset) + ' · ' + mode + '模式'
}

interface Opt {
  id: string
  t: string
  d: string
}

const OPTS: Opt[] = [
  { id: 'resume:go', t: '继续上一局', d: '从存档的季度接着往下走，日志重新开始记。' },
  { id: 'resume:new', t: '重新开始', d: '清掉存档，回到 1984 年重新选出身。' },
]

export function renderResume(ctx: Ctx2D, L: Layout, g: GameState | null): void {
  ctx.fillStyle = C.mask
  ctx.fillRect(0, 0, L.w, L.h)
  L.hit('mask', { x: 0, y: 0, w: L.w, h: L.h }, true, false)
  if (!g) return

  const col = L.col
  const inner = col.w - PAD * 2
  const info = savedLine(g)
  const infoH = paraHeight(ctx, info, inner, { size: T.small, color: C.ink1 }, 3)
  const optH = OPTS.map(function (o) {
    return OPT_PAD + 20 + 6 + paraHeight(ctx, o.d, inner - 24, { size: T.small, color: C.ink1 }, 3) + OPT_PAD
  })
  const total =
    PAD + 26 + 34 + infoH + 14 + optH.reduce(function (a, b) {
      return a + b
    }, 0) + OPT_GAP + PAD

  const avail = L.h - col.y * 2
  const top = L.y + (total < avail ? (avail - total) / 2 : 0)
  const frame: Rect = { x: col.x, y: top, w: col.w, h: total }
  box(ctx, frame, C.bg2, C.line1)
  ctx.fillStyle = C.line2
  ctx.fillRect(frame.x, frame.y, frame.w, 2)

  let y = top + PAD
  line(ctx, '检测到上一局', col.x + PAD, y + 14, { size: T.caption, weight: 700, color: C.ink2 })
  y += 26
  line(ctx, '接着走，还是从头来', col.x + PAD, y + T.title, { size: T.title, weight: 600, color: C.gold0 })
  y += 34
  para(ctx, info, col.x + PAD, y + T.small, inner, { size: T.small, color: C.ink1 }, 3)
  y += infoH + 14

  OPTS.forEach(function (o, i) {
    const r: Rect = { x: col.x + PAD, y: y, w: inner, h: optH[i] }
    box(ctx, r, C.bg1, C.line1)
    line(ctx, String(i + 1), r.x + 12, r.y + OPT_PAD + 16, { size: T.small, weight: 700, color: C.gold0 })
    line(ctx, o.t, r.x + 30, r.y + OPT_PAD + 16, { size: T.body, weight: 600, color: C.ink0 })
    para(ctx, o.d, r.x + 30, r.y + OPT_PAD + 40, inner - 42, { size: T.small, color: C.ink1 }, 3)
    L.hit(o.id, r, true)
    y += optH[i] + OPT_GAP
  })
  L.seek(top + total)
}
