/** 局面构造与最基础的纯函数（clamp / 金额格式 / 目标条 / 贵贱分档）。 */
import type { GameState, Mode, PlayerState, Quarter, RngLike, StepOutcome } from '../types'
import { LINES } from '../data/lines'
import { ORG } from '../data/org'
import { applyTalent, armedTalent } from '../data/talents'
import { log, makeCtx, toOutcome } from './ctx'
import { buildKty, buildMap, mkIntel, shuffle } from './market'

/** 属性一律夹在 0..100。 */
export function cl(v: number): number {
  return Math.max(0, Math.min(100, v))
}

/** 千分位（原实现是 toLocaleString；这里手写，保证双端输出一致）。 */
function group(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 金额人话：亿 / 万 / 元。 */
export function fmt(n: number): string {
  if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿'
  if (n >= 1e7) return (n / 1e4).toFixed(0) + ' 万'
  if (n >= 1e5) return (n / 1e4).toFixed(1) + ' 万'
  return group(n)
}

/** 目标条按对数走：0.5 倍在起点，1 倍约 15%，10 倍约 65%，50 倍满格。 */
export function progOf(x: number): number {
  if (!isFinite(x) || x <= 0) return 0
  const p = Math.log10(x / 0.5) / Math.log10(100)
  return Math.max(0, Math.min(1, p))
}

/** 贵贱分档 0..4。 */
export function zone(q: Quarter): number {
  const r = q.rel
  if (r < 0.85) return 0
  if (r < 0.95) return 1
  if (r < 1.06) return 2
  if (r < 1.2) return 3
  return 4
}

const ZONE_WORDS = ['极低', '偏低', '中位', '偏高', '极高']
const ZONE_WORDS_RENDER = ['很低', '偏低', '中位', '偏高', '很高']

export function zoneWord(z: number): string {
  return ZONE_WORDS[z] || ZONE_WORDS[2]
}

/** 面板上用的那套档位词。 */
export function zoneWordRender(z: number): string {
  return ZONE_WORDS_RENDER[z] || ZONE_WORDS_RENDER[2]
}

/** 身家档位 0..5。 */
export function rankOf(s: PlayerState): number {
  const a = s.asset
  if (a >= 2e7) return 5
  if (a >= 8e6) return 4
  if (a >= 2e6) return 3
  if (a >= 5e5) return 2
  if (a >= 1e5) return 1
  return 0
}

/** 原 reset()：一局开局时的最低状态。 */
export function createPlayerState(): PlayerState {
  return {
    asset: 30000, start: 30000, qi: 0, sect: '成长', pos: 0.5, lev: false, stop: false,
    streak: 0, peak: 30000, maxDD: 0, busted: false, best: 0, seasons: 0, over: false,
    sense: 40, net: 5, rep: 0, health: 80, fam: 50, flag: 0, married: 0, kids: 0, will: null,
    ap: 3, probed: false, intel: null, flip: false, scam: false, safe: false, fa: false, emo: false,
    miss: false, fee: 0, prop: 0, slots: [], hintOk: true, hintSect: false, kty: null,
    stopUsed: false, H: [], act: {}, lines: null,
  }
}

/**
 * 开一局：建剧本 → 建板块强弱 → 落出身 → 1991 年第一条传闻。
 * 随机消耗顺序与原 begin() 一致：map 洗牌（仅抽签）→ kty → 传闻洗牌 → flip。
 *
 * talent：本局带的天赋 id。不给（undefined）就读 armTalent() 的交接位，
 * 显式给 null 就是「这一局纯挑战」。天赋只改初始字段，一次随机数都不多调。
 */
export function createGame(orgIndex: number, mode: Mode, seed: number, rng: RngLike, talent?: string | null): StepOutcome {
  const map = buildMap(mode, rng)
  const g: GameState = {
    mode: mode, map: map, phase: 'trade', li: 0, pending: null, seed: seed,
    s: createPlayerState(),
  }
  g.s.kty = buildKty(rng)
  const o = ORG[orgIndex] || ORG[0]
  g.s.start = o.start
  g.s.asset = o.start
  g.s.peak = o.start
  g.s.sense = o.sense
  g.s.net = o.net
  g.s.rep = o.rep
  g.s.health = o.health
  g.s.fam = o.fam
  applyTalent(g.s, talent === undefined ? armedTalent() : talent)
  const c = makeCtx(g, rng)
  c.year = 1984
  log(c, '1984 年，你 18 岁，' + o.k + '。', 'w')
  log(c, o.d, 'a')
  c.year = 1991
  log(c, '1991 年，你带着 ' + fmt(g.s.start) + ' 进了营业部。', 'a')
  const ls = LINES[1991]
  if (ls) {
    const arr = ls.slice()
    shuffle(arr, rng)
    g.s.lines = arr.slice(0, 4)
  }
  g.s.intel = mkIntel(g, 1991, 1991)
  g.s.flip = rng.next() < 0.5
  g.s.probed = false
  g.s.ap = 3
  return toOutcome(c, 'settled')
}

/** 只改字段，不推进时间（原 pickSect / pickPos / toggle）。 */
export function setSector(state: GameState, sect: PlayerState['sect']): StepOutcome {
  return noop(state, function (g) {
    if (g.phase !== 'trade' || g.s.over) return
    g.s.sect = sect
  })
}

export function setPosition(state: GameState, pos: number): StepOutcome {
  return noop(state, function (g) {
    if (g.phase !== 'trade' || g.s.over) return
    g.s.pos = pos
  })
}

/** 开关：lev（杠杆）/ stop（止损）。 */
export function toggle(state: GameState, key: 'lev' | 'stop'): StepOutcome {
  return noop(state, function (g) {
    if (g.phase !== 'trade' || g.s.over) return
    g.s[key] = !g.s[key]
  })
}

function noop(state: GameState, apply: (g: GameState) => void): StepOutcome {
  const g = JSON.parse(JSON.stringify(state)) as GameState
  apply(g)
  const c = makeCtx(g, { next: function () { return 0 }, int: function () { return 0 } })
  return toOutcome(c, 'settled')
}
