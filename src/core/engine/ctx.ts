/** 引擎内部上下文：可变草稿 + 随机源 + 本轮日志缓冲。只在 core 内使用。 */
import type { GameState, LogItem, OutcomeKind, RngLike, SfxName, StepOutcome, Tone } from '../types'
import { LATE } from '../data/events'
import { buildQuarters } from './market'

export interface Ctx {
  g: GameState
  rng: RngLike
  logs: LogItem[]
  fx: SfxName[]
  fast: boolean
  /** 显式指定这一批日志的年份（年末/晚年事件、开局的 1984 用）；不给就按当前季度推。 */
  year?: number
}

export function makeCtx(g: GameState, rng: RngLike): Ctx {
  return { g: g, rng: rng, logs: [], fx: [], fast: false }
}

/** 深拷贝局面：引擎拿副本、改副本、把副本交回去，外部状态不被就地修改。 */
export function cloneState(g: GameState): GameState {
  return JSON.parse(JSON.stringify(g)) as GameState
}

/** 这条日志属于哪一年：先看显式指定，晚年看晚年事件年，交易期看当前季度年。 */
function yearOf(c: Ctx): number | undefined {
  if (c.year != null) return c.year
  const g = c.g
  const Q = buildQuarters(g.map)
  if (g.phase === 'late') {
    // 刚走完 144 季、还没进第一个晚年事件：这批日志属于最后一年年末（2026）
    if (g.li === 0 && g.s.qi >= Q.length && Q.length) return Q[Q.length - 1].y
    const ev = LATE[g.li]
    return ev ? ev.y : undefined
  }
  const q = Q[g.s.qi]
  return q ? q.y : undefined
}

/** 记一条日志。迷雾模式下把年份抹掉（原 log() 的行为）。 */
export function log(c: Ctx, text: string, tone: Tone = 'dim'): void {
  let t = String(text)
  if (c.g.mode === 'fog') t = t.replace(/\d{4}\s*年/g, '某年').replace(/\d{4}/g, '某年')
  const item: LogItem = { text: t, tone: tone }
  const y = yearOf(c)
  if (y != null) item.year = y
  c.logs.push(item)
}

export function fxk(c: Ctx, name: SfxName): void {
  c.fx.push(name)
}

export function toOutcome(c: Ctx, kind: OutcomeKind): StepOutcome {
  return { state: c.g, logs: c.logs, kind: kind, fx: c.fx }
}
