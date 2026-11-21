/** 推季：step 推一季，stepYear 把这一年剩下的季连推。原 step / stepYear。 */
import type { GameState, OutcomeKind, RngLike, StepOutcome } from '../types'
import { EV } from '../data/events'
import { LINES } from '../data/lines'
import { cloneState, Ctx, fxk, log, makeCtx, toOutcome } from './ctx'
import { buildQuarters, mkIntel, shuffle } from './market'
import { enterLate, settle } from './settle'
import { showEvent } from './events'
import { cl, fmt } from './state'

/** 推一季。 */
export function step(state: GameState, rng: RngLike): StepOutcome {
  const c = makeCtx(cloneState(state), rng)
  return toOutcome(c, stepInto(c))
}

/** 连过一年：最多 4 季，撞上事件 / 到年底 / 结束就停。 */
export function stepYear(state: GameState, rng: RngLike): StepOutcome {
  const c = makeCtx(cloneState(state), rng)
  const g = c.g
  if (g.phase !== 'trade' || g.s.over) return toOutcome(c, 'idle')
  c.fast = true
  let kind: OutcomeKind = 'idle'
  let k = 0
  while (k < 4 && g.phase === 'trade' && !g.s.over) {
    const r = stepInto(c)
    if (r !== 'idle') kind = r
    if (g.pending) break
    if (g.s.over) break
    if (g.s.qi % 4 === 0) break
    k++
  }
  c.fast = false
  return toOutcome(c, kind)
}

/** 一季的全部内容：年初换传闻发行动点 → 特殊年份事件 → 结算。 */
function stepInto(c: Ctx): OutcomeKind {
  const g = c.g
  const s = g.s
  if (g.phase !== 'trade' || s.over || g.pending) return 'idle'
  const Q = buildQuarters(g.map)
  const q = Q[s.qi]
  if (!q) return enterLate(c)

  if (q.q === 1) {
    const ls = LINES[q.y]
    if (ls) {
      const arr = ls.slice()
      shuffle(arr, c.rng)
      s.lines = arr.slice(0, 4)
    }
    const it = mkIntel(g, q.y, q.my)
    if (it) {
      s.intel = it
      s.flip = c.rng.next() < 0.5
      s.probed = false
      s.hintOk = c.rng.next() < Math.min(0.88, (s.sense || 0) / 100 + (s.rep || 0) / 300)
      s.hintSect = c.rng.next() < 0.5
    }
    s.ap = 3
    s.scam = false
    s.safe = false
    s.miss = false
    s.stopUsed = false
    if (s.fam < 30 && c.rng.next() < 0.1) {
      const lose = s.asset * 0.18
      s.asset = Math.max(1, s.asset - lose)
      s.fam = cl(s.fam + 8)
      log(c, '　她把房子过户到了自己名下。' + fmt(lose) + '，你签了字。', 'g')
      fxk(c, 'settle')
    }
    if (s.flag >= 15 && c.rng.next() < 0.08) {
      const fine = s.asset * 0.12
      s.asset = Math.max(1, s.asset - fine)
      s.flag = cl(s.flag - 6)
      log(c, '　有人把你请去喝茶。罚没 ' + fmt(fine) + '，那一笔算是销了。', 'g')
      fxk(c, 'settle')
    }
  }

  const evKey = q.y + '-' + q.q
  if (EV[evKey]) return showEvent(c, evKey, q)
  return settle(c, q, Q.length)
}
