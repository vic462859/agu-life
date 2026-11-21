/** 出身三选一 + 本局挑战码。数据全部来自 core 的 ORG，文案一个字都不在这里编。 */
import { fmt, ORG } from '../../core'
import type { Layout, Rect } from '../layout'
import { box, center, line, para, paraHeight, width } from '../paint'
import type { Ctx2D } from '../paint'
import { C, T } from '../theme'

const PAD = 16
const CODE_ROW = 28

/** 开局屏要显示的那点东西：码、平台能不能读写剪贴板、跨局记忆点。 */
export interface OrgData {
  code: string
  /** 平台层有没有剪贴板（没有就只显示码，不摆一个按不动的按钮）。 */
  clip: boolean
  points: number
}

/** 一格 chip：底色 + 文字，返回矩形（调用方拿它登记命中）。 */
function chip(ctx: Ctx2D, x: number, y: number, label: string, on: boolean): Rect {
  const w = width(ctx, label, T.caption, 600) + 20
  const r: Rect = { x: x - w, y: y, w: w, h: CODE_ROW }
  box(ctx, r, on ? C.bg3 : C.bg1, on ? C.line2 : C.line0)
  center(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + T.caption * 0.36, {
    size: T.caption,
    weight: 600,
    color: on ? C.gold0 : C.ink2,
  })
  return r
}

/**
 * 挑战码面板：一行放得下「码 + 复制 + 粘贴」。
 * 小游戏没有输入框，所以入口只有两个：把这一局的码复制走 / 把剪贴板里那条码粘进来。
 */
function codePanel(ctx: Ctx2D, L: Layout, d: OrgData): void {
  const h = 12 + 18 + 6 + CODE_ROW + 12
  const r = L.block(h, 12)
  box(ctx, r, C.bg2, C.line0)
  line(ctx, '挑战码 · 同一个码就是同一局', r.x + 12, r.y + 22, { size: T.caption, weight: 700, color: C.gold0 })

  const y = r.y + 12 + 18 + 6
  const midY = y + CODE_ROW / 2 + 5
  line(ctx, d.code, r.x + 12, midY, { size: T.body, weight: 600, color: C.ink0, mono: true })
  const codeW = width(ctx, d.code, T.body, 600, true)
  // 码本体也是复制入口（长按 / 点一下都行）：手指戳 11 位字符比戳 chip 容易
  L.hit('code:copy', { x: r.x + 6, y: y, w: codeW + 12, h: CODE_ROW }, true)

  if (!d.clip) {
    const tip = '这个环境不能复制'
    line(ctx, tip, r.x + codeW + 26, midY, { size: T.caption, color: C.ink2 })
    return
  }
  const paste = chip(ctx, r.x + r.w - 12, y, '粘贴上次的码', true)
  const copy = chip(ctx, paste.x - 6, y, '复制', true)
  L.hit('code:paste', paste, true)
  L.hit('code:copy', copy, true)
}

export function renderOrg(ctx: Ctx2D, L: Layout, d: OrgData): void {
  const col = L.col
  let y = col.y + 18

  center(ctx, 'A股人生', L.w / 2, y + T.hero, { size: T.hero, weight: 700, color: C.gold0 })
  y += T.hero + 12
  center(ctx, '1984 年，你 18 岁。先选一个出身。', L.w / 2, y + T.small, {
    size: T.small,
    color: C.ink2,
  })
  y += T.small + 26
  L.seek(y)

  ORG.forEach((o, i) => {
    const inner = col.w - PAD * 2
    const descH = paraHeight(ctx, o.d, inner, { size: T.small, color: C.ink1 })
    // 五项属性自己一行：和「本金 30,000 元」挤一行时，窄屏上会压成一团（390 宽实测重叠）
    const ATTR_H = 20
    const h = PAD + 26 + 20 + ATTR_H + 6 + descH + 4
    const r = L.block(h, 12)
    box(ctx, r, C.bg2, C.line0)
    line(ctx, o.k, r.x + PAD, r.y + PAD + 18, { size: T.title, weight: 600, color: C.ink0 })
    line(ctx, '本金 ' + fmt(o.start) + ' 元', r.x + PAD, r.y + PAD + 44, {
      size: T.small,
      weight: 600,
      color: C.gold0,
    })
    const attr =
      '盘感 ' + o.sense + '　人脉 ' + o.net + '　声望 ' + o.rep + '　身体 ' + o.health + '　家 ' + o.fam
    line(ctx, attr, r.x + PAD, r.y + PAD + 44 + ATTR_H, { size: T.caption, color: C.ink2 })
    para(ctx, o.d, r.x + PAD, r.y + PAD + 68 + ATTR_H, inner, { size: T.small, color: C.ink1 }, 4)
    L.hit('org:' + i, r, true)
  })

  codePanel(ctx, L, d)

  // 脚注：记忆点跨局累加，这里只报一个数，花它的地方在「带一样东西上路」那一屏
  const foot = L.bottom(24, 4)
  const tip = '点一张卡片，开始这一生'
  center(ctx, tip, L.w / 2, foot.y + 16, { size: T.caption, color: C.ink2 })
  if (d.points > 0) {
    const pw = width(ctx, '记忆点 ' + d.points, T.caption, 600)
    line(ctx, '记忆点 ' + d.points, L.w - 16 - pw, foot.y + 16, {
      size: T.caption,
      weight: 600,
      color: C.teal0,
    })
  }
}
