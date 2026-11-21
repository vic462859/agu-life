/** 一季的结算、推进、进入晚年、收尾。原 settle / advance / enterLate / finish。 */
import type { GameState, OutcomeKind, Quarter, RngLike, SectorId } from '../types'
import { YEV } from '../data/events'
import { BOOK, K, ORDER } from '../data/sectors'
import { cl, fmt } from './state'
import { Ctx, fxk, log } from './ctx'
import { buildQuarters } from './market'

/** 进入晚年。 */
export function enterLate(c: Ctx): OutcomeKind {
  c.g.phase = 'late'
  c.g.li = 0
  log(c, '2026 年末，你把最后一只票卖了。', 'w')
  log(c, '你 60 岁。往后二十三年，不再有仓位。', 'a')
  return 'late'
}

/** 收尾。返回 busted / end。 */
export function finish(c: Ctx): OutcomeKind {
  if (c.g.s.over) return c.g.s.busted ? 'busted' : 'end'
  if (!c.g.s.busted) fxk(c, 'end')
  c.g.s.over = true
  c.g.phase = 'end'
  c.g.pending = null
  return c.g.s.busted ? 'busted' : 'end'
}

/** 推进一季：年底给身体回一点血，翻页，可能撞上年度人生事件。 */
export function advance(c: Ctx, q: Quarter, total: number): OutcomeKind {
  const s = c.g.s
  if (q.q === 4) s.health = cl(s.health + 5)
  s.qi++
  // 兜底：任何跳过结算的路径（特殊年份事件里 cut 的"一刀割在最低点"就是直接 advance）
  // 都在这里补一条空账，保证 交易季数 == H 的条数 == 走过的季数。只记账，不动钱、不动随机数。
  if (s.H.length < s.qi) {
    s.seasons++
    s.H.push([q.y, q.q, ORDER.indexOf(s.sect), s.pos, 0, 0, 0, 0])
  }
  // 顺序要紧：先查这一年的年度事件，再看季度有没有走满。
  // 反过来的话，最后一季（2026 Q4）qi 会先满 144 直接进晚年，末年的年度事件永远弹不出来。
  if (q.q === 4) {
    const yev = YEV.find(function (e) { return e.y === q.y })
    if (yev) {
      c.g.pending = { type: 'year', year: yev.y, qi: s.qi }
      return 'year'
    }
  }
  if (s.qi >= total) return enterLate(c)
  return 'settled'
}

/**
 * 年底人生事件选完之后：季度已经走满（末年的那一张）就进晚年，否则留在交易期。
 * 这是「先弹末年事件、再进晚年」那一半，与 advance() 的调序成对出现。
 */
export function afterYearEvent(c: Ctx): OutcomeKind {
  if (c.g.s.qi >= buildQuarters(c.g.map).length) return enterLate(c)
  return 'settled'
}

/** 结算一季。数值、概率、随机数调用顺序与原 settle 完全一致。 */
export function settle(c: Ctx, q: Quarter, total: number): OutcomeKind {
  const s = c.g.s
  const rng = c.rng

  if (s.health < 30 && rng.next() < 0.1) {
    const cost = s.asset * 0.06
    s.asset -= cost
    s.health = cl(s.health - 8)
    // 病季也是一季：补上 seasons 与 H，但如实记 —— 这一季没有交易，
    // pnl 记 0、没换板块(isChg=0)、没追去年的猛票(bang=0/hit=0)，仓位写当时真实持仓。
    // 只动这两样账目：资产只扣上面那笔医药费，rng 一次都没在这里多调。
    s.seasons++
    s.H.push([q.y, q.q, ORDER.indexOf(s.sect), s.pos, 0, 0, 0, 0])
    log(c, q.y + ' Q' + q.q + '　你病了一场，一整季没看盘。医药费 ' + fmt(cost) + '。', 'g')
    fxk(c, 'health')
    return advance(c, q, total)
  }

  const ed = s.kty && s.kty[q.my] && s.kty[q.my][s.sect] ? s.kty[q.my][s.sect] : 0
  let r = q.ret * K[s.sect] + ed * 0.15 + (rng.next() - 0.5) * 0.02

  let hit = ''
  if (q.q === 2 && s.intel && !s.miss && s.probed) {
    if (s.sect === s.intel[1]) {
      hit = 'real'
      r = r + 0.1
      fxk(c, 'intel')
      log(c, '　甲对上了。' + s.intel[1] + '那条是真的，你在 Q2 兑现。', 'r')
    } else if (s.sect === s.intel[3]) {
      hit = 'fake'
      r = r - 0.12
      fxk(c, 'intel')
      log(c, '　乙是编的。你被引到 ' + s.intel[3] + ' 上，成了接盘的那个。', 'g')
    }
  }

  const senseK = s.sense >= 60 ? 0.5 : s.sense >= 40 ? 0.75 : 1
  if (s.sect === '壳' && rng.next() < 0.005 * senseK) {
    r = -0.5
    log(c, q.y + ' Q' + q.q + '：那只壳被按了暂停键，复牌直接一字板。', 'g')
  }
  if (s.sect === '成长' && rng.next() < 0.015 * senseK * (s.fa ? 0.5 : 1) * (s.safe ? 0.5 : 1)) {
    r = -0.14 - rng.next() * 0.06
    log(c, q.y + ' Q' + q.q + '：财报出来，比所有人想的都差。', 'g')
  }
  if (s.sect === '题材' && rng.next() < 0.02 * senseK) {
    r -= 0.18
    log(c, q.y + ' Q' + q.q + '：故事讲到一半，接棒的人没来。', 'g')
  }

  if (s.stop && !s.stopUsed && r < -0.34) {
    s.stopUsed = true
    r = -0.32
    log(c, q.y + ' Q' + q.q + '　止损单成交。', 'g')
  }
  r = Math.max(-0.62, Math.min(2.0, r))
  if (s.lev) r *= 1.5

  if (s.pos * r <= -0.93) {
    s.busted = true
    s.asset = 0
    log(c, q.y + ' Q' + q.q + '：两根线交叉的时候，你的账户被强平了。', 'g')
    fxk(c, 'bust')
    return finish(c)
  }

  const old = s.asset
  let pnl = old * s.pos * r
  if (s.stop && s.pos > 0) pnl -= old * 0.001
  if (s.fee > 0) pnl -= old * s.fee
  if (s.scam) {
    const lose = old * 0.12
    pnl -= lose
    log(c, '　杀猪盘结了这一笔：' + fmt(lose) + '。', 'g')
    s.scam = false
  }
  s.asset = old + pnl
  s.seasons++
  {
    const si = ORDER.indexOf(s.sect)
    const prev = s.H.length ? s.H[s.H.length - 1] : null
    const isChg = prev && prev[2] !== si ? 1 : 0
    let bang = 0
    let hitYear = 0
    if (isChg) {
      const pe = s.kty ? s.kty[q.my - 1] : null
      if (pe) {
        const rk = ORDER.map(function (k) { return pe[k] }).sort(function (a, b) { return b - a })
        bang = pe[s.sect] >= rk[1] ? 1 : 0
      }
    }
    {
      const ce = s.kty ? s.kty[q.my] : null
      if (ce) {
        const rk2 = ORDER.map(function (k) { return ce[k] }).sort(function (a, b) { return b - a })
        hitYear = ce[s.sect] >= rk2[1] ? 1 : 0
      }
    }
    s.H.push([q.y, q.q, si, s.pos, Math.round(pnl), isChg, bang, hitYear])
  }
  if (s.asset <= 1) {
    s.busted = true
    s.asset = 0
    log(c, q.y + ' Q' + q.q + '：归零。', 'g')
    fxk(c, 'bust')
    return finish(c)
  }
  if (s.lev && s.pos * r <= -0.7) {
    s.busted = true
    s.asset = 0
    log(c, q.y + ' Q' + q.q + '：杠杆把你压穿了。券商在开盘前就平了仓，你连卖出的机会都没有。', 'g')
    fxk(c, 'bust')
    return finish(c)
  }
  if (s.asset > s.peak) s.peak = s.asset
  const dd = (s.peak - s.asset) / s.peak
  if (dd > s.maxDD) s.maxDD = dd

  if (s.pos > 0) {
    if (r > 0) s.streak = s.streak > 0 ? s.streak + 1 : 1
    else s.streak = s.streak < 0 ? s.streak - 1 : -1
  } else s.streak = 0
  if (s.streak > s.best) s.best = s.streak

  if (!c.fast) fxk(c, 'settle')
  if (old < s.start * 10 && s.asset >= s.start * 10) fxk(c, 'up')

  const word = s.pos === 0 ? '你空仓，看着' : s.pos === 1 ? '你满仓' : '你拿了 ' + s.pos * 100 + '% 仓，'
  const tail =
    s.pos === 0
      ? r >= 0
        ? '它涨了 ' + (r * 100).toFixed(1) + '%，你在场外。'
        : '它跌了，你躲过了。'
      : pnl >= 0
        ? '赚了 ' + fmt(Math.abs(pnl)) + '（' + (r * 100).toFixed(1) + '%）。'
        : '亏了 ' + fmt(Math.abs(pnl)) + '（' + (r * 100).toFixed(1) + '%）。'
  log(c, q.y + ' Q' + q.q + '　' + word + '那只' + bookOf(s.sect) + '，' + tail, pnl >= 0 ? 'r' : 'g')

  if (s.streak === 4) {
    s.net = cl(s.net + 4)
    log(c, '　营业部的老张开始问你：这波你看什么？', 'gold')
  }
  if (s.streak === 8) {
    s.net = cl(s.net + 8)
    s.rep = cl(s.rep + 6)
    log(c, '　有人开始管你叫老师。你自己知道，你只是运气还没用完。', 'gold')
  }
  if (s.streak === -8) {
    s.fam = cl(s.fam - 6)
    log(c, '　老婆把卡收走了。', 'g')
  }
  if (old < 1e6 && s.asset >= 1e6) log(c, '　账户过了 100 万。你第一次觉得，这条路能走。', 'gold')
  if (old < 1e7 && s.asset >= 1e7) {
    s.rep = cl(s.rep + 12)
    log(c, '　账户过了 1000 万。营业部给你留了座。', 'gold')
  }

  (s.slots || []).forEach(function (slot) { slot.left-- })
  s.slots = (s.slots || []).filter(function (slot) {
    if (slot.left > 0) return true
    if (slot.kind === 'loan') {
      if (rng.next() < 0.15) {
        log(c, '　借出去的那笔钱，人跑了。', 'g')
        return false
      }
      const back = slot.amt * 1.2
      s.asset += back
      log(c, '　放贷回款 ' + fmt(back) + '。', 'gold')
      return false
    }
    if (slot.kind === 'factory') {
      const back = slot.amt * (slot.mult || 1)
      s.asset += back
      log(c, '　厂子转出去了，拿回 ' + fmt(back) + '。', 'gold')
      return false
    }
    return false
  })

  if (s.prop > 0) s.asset += s.prop * 0.015

  return advance(c, q, total)
}

function bookOf(s: SectorId): string {
  return BOOK[s]
}
