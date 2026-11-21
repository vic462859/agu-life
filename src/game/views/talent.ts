/**
 * 「带一样东西上路」：出身之后、开局之前那一屏（三选一 + 不带）。
 * 数据全部来自 core/meta 的 talentRows（记忆点 / 解锁 / 价格），这里只排版与登记命中。
 * 选中的 id 交回 app，由它走 meta.carryTalent + createGame 的 talent 参数。
 */
import type { TalentRow } from '../../core/meta'
import type { Layout, Rect } from '../layout'
import { box, center, line, para, paraHeight, pillSecondary, right, width } from '../paint'
import type { Ctx2D } from '../paint'
import { C, T } from '../theme'

const PAD = 12
const NAME_H = 22
const ACT_H = 18

export interface TalentData {
  /** 最多三条（解锁的在前，锁着的按价钱跟在后面）。 */
  rows: TalentRow[]
  /** 手上还没花掉的记忆点。 */
  points: number
  /** 这一局选的出身名（「不带天赋」那句话里要用）。 */
  orgName: string
}

/** 锁着的那条给一句话：可解锁就说价钱，不够就说差多少。 */
function lockText(t: TalentRow, points: number): string {
  return t.affordable ? '解锁（' + t.price + ' 点）' : '还差 ' + (t.price - points) + ' 点'
}

export function renderTalent(ctx: Ctx2D, L: Layout, d: TalentData): void {
  const col = L.col
  const inner = col.w - PAD * 2
  let y = col.y + 14

  line(ctx, '记忆点 ' + d.points + ' · 跨局累加', col.x, y + 13, {
    size: T.caption,
    weight: 700,
    color: C.teal0,
  })
  y += 24
  line(ctx, '带一样东西上路', col.x, y + T.title, { size: T.title, weight: 700, color: C.gold0 })
  y += T.title + 8
  const intro =
    '这些东西不是这一局攒的，是上一局留下的。每局最多带一样，也可以什么都不带 —— 不带的局才是干净的一局。'
  const introH = paraHeight(ctx, intro, col.w, { size: T.small, color: C.ink1 }, 4)
  para(ctx, intro, col.x, y + T.small, col.w, { size: T.small, color: C.ink1 }, 4)
  y += introH + 14
  L.seek(y)

  d.rows.forEach(function (t) {
    const descH = paraHeight(ctx, t.desc, inner, { size: T.small, color: t.unlocked ? C.ink1 : C.ink2 }, 3)
    const h = PAD + NAME_H + 4 + descH + 6 + ACT_H + PAD
    const r: Rect = L.block(h, 10)
    box(ctx, r, t.unlocked ? C.bg2 : C.bg1, t.unlocked ? C.line1 : C.line0)

    line(ctx, t.name, r.x + PAD, r.y + PAD + 16, {
      size: T.body,
      weight: 600,
      color: t.unlocked ? C.ink0 : C.ink2,
    })
    const nameW = width(ctx, t.name, T.body, 600)
    const tag = t.unlocked ? '已解锁' : '锁 · ' + t.price + ' 点'
    line(ctx, tag, r.x + PAD + nameW + 10, r.y + PAD + 16, {
      size: T.caption,
      weight: 600,
      color: t.unlocked ? C.teal0 : C.ink2,
    })
    para(ctx, t.desc, r.x + PAD, r.y + PAD + NAME_H + 4 + T.small, inner, {
      size: T.small,
      color: t.unlocked ? C.ink1 : C.ink2,
    }, 3)

    // 动作那一行：能带就是「带这一样」，锁着就是价钱（点得动就代表当场解锁）
    const actY = r.y + PAD + NAME_H + 4 + descH + 6 + 14
    const on = t.unlocked || t.affordable
    line(ctx, t.unlocked ? '带这一样 →' : lockText(t, d.points), r.x + PAD, actY, {
      size: T.small,
      weight: 600,
      color: on ? C.gold0 : C.ink2,
    })
    right(ctx, '价 ' + t.price + ' 点', r.x + r.w - PAD, actY, { size: T.caption, color: C.ink2 })
    L.hit('talent:' + t.id, r, on)
  })

  const none: Rect = L.block(48, 10)
  pillSecondary(ctx, none, '不带天赋 · 纯挑战', true, T.body)
  L.hit('talent:none', none, true)

  const hint =
    '带天赋的局，结局页会标「带天赋：XX」。挑战码里没有天赋信息 —— 同一个码、不同天赋的两局不能直接比大小。'
  const hintH = paraHeight(ctx, hint, col.w, { size: T.caption, color: C.ink2 }, 4)
  const hr: Rect = L.block(hintH + 16, 0)
  para(ctx, hint, hr.x, hr.y + 10 + T.caption, col.w, { size: T.caption, color: C.ink2 }, 4)
  L.block(8, 0)
}
