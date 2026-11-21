/** 三段事件：年中特殊年份事件、年底人生事件、晚年事件。原 EV / YEV / LATE 的结算逻辑。 */
import type { GameState, LifeEffect, OutcomeKind, Quarter, RngLike, StepOutcome } from '../types'
import { EV, LATE, YEV } from '../data/events'
import { cloneState, Ctx, log, makeCtx, toOutcome } from './ctx'
import { buildQuarters } from './market'
import { advance, afterYearEvent, enterLate, finish, settle } from './settle'
import { cl, fmt } from './state'

/**
 * 割肉代价：割掉之后资产乘 (1 - cutLoss(pos, lev))。
 *
 * 为什么随仓位变：割完那一季是空仓，等于白得一个"躲过下跌"的期权，而这份期权价值与仓位成正比。
 * 常数代价扫不出解 —— 扫描（--sweep，200 局）里满仓过零 ≈26.1%、半仓 ≈18.0%，
 * 两条 ±5% 可行区间在 22.2% / 22.3% 擦肩而过；由两端过零点插值得到仓位这一项的斜率。
 * 为什么还要随杠杆变：杠杆把同一份期权价值再放大 1.5 倍（满仓+杠杆那组在只有仓位项时平均倍数还高 10.6%），
 * 所以再加一项 CUT_LOSS_LEV × lev。值域夹在 [0.10, 0.40]：低于一成没痛感，高于四成就是劝退。
 *
 * CUT_LOSS_LEV 的扫描（--sweep-c，三组 200 局，Δ平均倍数）：c=0.04 → 杠杆组 +4.54%；
 * c=0.06 → +1.51%；c=0.08 → −1.52%；c=0.10 → −4.55%（三组爆仓率全程 Δ0.00pp），近零点 ≈0.07。
 * 选值规则：取 |Δ| 最小者，同分取更小 c —— 0.06 与 0.08 并列（1.51% / 1.52%），故取 0.06。
 * （不取 0.04 的理由：它只靠 0.46pp 的余量刚好过线，而这里要的是把效应抵消掉，不是改动最小。）
 */
export const CUT_LOSS_BASE = 0.1
export const CUT_LOSS_SLOPE = 0.17
export const CUT_LOSS_LEV = 0.06
export const CUT_LOSS_MIN = 0.1
export const CUT_LOSS_MAX = 0.4

// 只给量化脚本用：临时改写杠杆项系数（扫 c），线上永远走 CUT_LOSS_LEV
let cutLev = CUT_LOSS_LEV
export function setCutLev(v: number): void {
  cutLev = v
}
export function getCutLev(): number {
  return cutLev
}

/** 这一刀有多疼：基础一成 + 仓位线性加价 + 杠杆加价，夹在 [0.10, 0.40]。 */
export function cutLoss(pos: number, lev: number | boolean = 0): number {
  const p = isFinite(pos) ? pos : 0
  const l = lev === true ? 1 : lev === false ? 0 : isFinite(Number(lev)) ? Number(lev) : 0
  const raw = CUT_LOSS_BASE + CUT_LOSS_SLOPE * p + cutLev * l
  return Math.max(CUT_LOSS_MIN, Math.min(CUT_LOSS_MAX, raw))
}

// 只给量化脚本/回归测试用：把代价钉成常数（null = 走上面的公式）
let cutLossOverride: number | null = null
export function setCutLoss(v: number | null): void {
  cutLossOverride = v
}
export function getCutLoss(pos: number, lev: number | boolean = 0): number {
  return cutLossOverride != null ? cutLossOverride : cutLoss(pos, lev)
}

/**
 * cut（割在最低点）的结算口径。
 * - liquidate（默认）：割了就真清仓，pos 归零，按 cutLoss(pos, lev) 扣，本季不结算，下一季从空仓开始；
 *   空仓时点割不扣钱、换一句实话（这一刀没割到人）。
 * - legacy：历史上那样，只扣 10%、仓位不动（下一季继续吃涨跌）—— 只留作对照与回归。
 */
export type CutMode = 'legacy' | 'liquidate'
let cutMode: CutMode = 'liquidate'
export function setCutMode(m: CutMode): void {
  cutMode = m
}
export function getCutMode(): CutMode {
  return cutMode
}

/** 人生事件选项的效果落地（原 applyA）。 */
export function applyA(c: Ctx, a?: LifeEffect): void {
  if (!a) return
  const s = c.g.s
  if (typeof a.cash === 'number') s.asset = Math.max(1, s.asset * (1 + a.cash))
  if (a.sell) {
    s.pos = 0
    s.lev = false
  }
  if (a.fam) s.fam = cl(s.fam + a.fam)
  if (a.health) s.health = cl(s.health + a.health)
  if (a.sense) s.sense = cl(s.sense + a.sense)
  if (a.net) s.net = cl(s.net + a.net)
  if (a.rep) s.rep = cl(s.rep + a.rep)
  if (a.flag) s.flag = cl(s.flag + a.flag)
  if (a.kids) s.kids += a.kids
  if (a.married) s.married = 1
  if (typeof a.bet === 'number') {
    const amt = s.asset * a.bet
    s.asset -= amt
    if (c.rng.next() < 0.3) {
      s.asset += amt * 2.2
      log(c, '　那笔投资居然成了。', 'gold')
    } else {
      log(c, '　' + fmt(amt) + ' 打了水漂，连个回执都没有。', 'g')
    }
  }
  if (a.will) s.will = a.will
}

/** 停在特殊年份事件上等选。 */
export function showEvent(c: Ctx, key: string, q: Quarter): OutcomeKind {
  c.g.pending = { type: 'event', key: key, qi: c.g.s.qi }
  return 'event'
}

/** 选特殊年份事件的第 index 个选项。 */
export function chooseEvent(state: GameState, index: number, rng: RngLike): StepOutcome {
  const c = makeCtx(cloneState(state), rng)
  const g = c.g
  const p = g.pending
  if (g.phase !== 'trade' || !p || p.type !== 'event') return toOutcome(c, 'idle')
  const ev = EV[p.key]
  if (!ev) {
    g.pending = null
    return toOutcome(c, 'idle')
  }
  const opt = ev.o[index] || ev.o[0]
  const f = opt.f
  g.pending = null
  const Q = buildQuarters(g.map)
  const q = Q[p.qi]
  if (!q) return toOutcome(c, enterLate(c))
  const s = g.s
  if (f === 'sub') {
    const amt = Math.min(s.asset * 0.33, 10000)
    if (rng.next() < 0.7) {
      const back = amt * 4.2
      s.asset += back - amt
      log(c, '　中了。' + fmt(amt) + ' 变成 ' + fmt(back) + '。', 'gold')
    } else {
      log(c, '　没中。三十块一张的表，成了废纸。', 'g')
    }
  } else if (f === 'cut') {
    // 空仓时"割在最低点"不成立：这一刀没割到人，不扣钱，只说一句实话。
    if (s.pos === 0 && cutMode !== 'legacy') {
      log(c, '　你本来就空着，这一刀没割到你。', 'a')
      return toOutcome(c, advance(c, q, Q.length))
    }
    const loss = cutMode === 'legacy' ? 0.1 : getCutLoss(s.pos, s.lev ? 1 : 0)
    s.asset *= 1 - loss
    // 割了就是真的卖了：本季不结算，仓位归零，下一季从空仓开始。
    if (cutMode !== 'legacy') s.pos = 0
    log(c, '　割在最低点，这一刀割掉 ' + Math.round(loss * 100) + '%。', 'g')
    // 这一季的 H 由 advance() 兜底记（此时 pos 已是 0：在场，但已清仓、没交易）
    return toOutcome(c, advance(c, q, Q.length))
  } else if (f === 'allin') {
    s.pos = 1
    s.sect = '成长'
  } else if (f === 'greed') {
    s.pos = 1
    s.lev = true
  } else if (f === 'out') {
    s.pos = 0
  } else if (f === 'swap') {
    s.sect = '题材'
    s.pos = 1
    log(c, '　你换了。', 'g')
  } else if (f === 'swap2') {
    s.sect = '红利'
    s.pos = 1
    log(c, '　你换成了那些老掉牙的票。', 'g')
  }
  return toOutcome(c, settle(c, q, Q.length))
}

/** 选年底人生事件的第 index 个选项。 */
export function chooseYear(state: GameState, index: number, rng: RngLike): StepOutcome {
  const c = makeCtx(cloneState(state), rng)
  const g = c.g
  const p = g.pending
  if (!p || p.type !== 'year') return toOutcome(c, 'idle')
  const ev = YEV.find(function (e) { return e.y === p.year })
  g.pending = null
  if (!ev) return toOutcome(c, 'idle')
  const opt = ev.o[index] || ev.o[0]
  c.year = ev.y
  applyA(c, opt.a)
  log(c, ev.y + ' 年底　' + ev.h + ' → ' + opt.k, 'w')
  // 末年的年度事件选完才进晚年；其余年份这里是 'settled'，行为与原来一致
  return toOutcome(c, afterYearEvent(c))
}

/** 晚年：开下一个事件（原 lateStep）。 */
export function lateStep(state: GameState, rng: RngLike): StepOutcome {
  const c = makeCtx(cloneState(state), rng)
  const g = c.g
  if (g.phase !== 'late') return toOutcome(c, 'idle')
  if (g.li >= LATE.length) return toOutcome(c, finish(c))
  g.pending = { type: 'late', index: g.li }
  return toOutcome(c, 'late')
}

/** 晚年：选第 index 个选项。 */
export function chooseLate(state: GameState, index: number, rng: RngLike): StepOutcome {
  const c = makeCtx(cloneState(state), rng)
  const g = c.g
  const p = g.pending
  if (g.phase !== 'late' || !p || p.type !== 'late') return toOutcome(c, 'idle')
  const ev = LATE[p.index]
  g.pending = null
  if (!ev) return toOutcome(c, 'idle')
  const opt = ev.o[index] || ev.o[0]
  c.year = ev.y
  applyA(c, opt.a)
  log(c, ev.y + '　' + ev.h + ' → ' + opt.k, 'w')
  g.li++
  return toOutcome(c, 'late')
}
