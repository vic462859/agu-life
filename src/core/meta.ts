/**
 * 跨局记忆（meta progression）：记忆点 + 天赋解锁 + 本局带入的天赋。
 *
 * 独立存档 agu_meta_v1，与单局存档（agu_life_save_v1）、挑战码互不影响：
 * 这里出任何问题都不该让一局打不下去，所以所有解析都不抛，坏档一律当空档。
 */
import type { PlayerState } from './types'
import { TALENTS, talentById } from './data/talents'

/** 记忆点存档槽名。 */
export const META_KEY = 'agu_meta_v1'

/** 存档格式版本。字段语义变了就 +1，解析会拒绝旧版本（当空档）。 */
export const META_VERSION = 1

/** 一局最多结算多少记忆点。 */
export const POINTS_PER_RUN_CAP = 5

export interface MetaState {
  v: number
  /** 手上还没花掉的记忆点。 */
  points: number
  /** 已永久解锁的天赋 id。 */
  unlocked: string[]
  /** 上一局结算的指纹：同一局重复进结局页不再加点（也防止刷新刷点）。 */
  lastSettled: string | null
  /** 本局带入的天赋 id。单局存档里没有这个字段，标注与公平性提示都读它。 */
  currentTalent: string | null
}

export function emptyMeta(): MetaState {
  return { v: META_VERSION, points: 0, unlocked: [], lastSettled: null, currentTalent: null }
}

/** 字符串 → meta。坏档、旧版本、缺字段都退回空档（调用方永远拿到一个能用的对象）。 */
export function parseMeta(raw: string | null | undefined): MetaState {
  const base = emptyMeta()
  if (!raw) return base
  try {
    const d = JSON.parse(raw) as Partial<MetaState>
    if (!d || typeof d !== 'object' || d.v !== META_VERSION) return base
    const points = Math.floor(Number(d.points))
    const unlocked = Array.isArray(d.unlocked) ? d.unlocked.filter(function (x) { return typeof x === 'string' && !!talentById(x) }) : []
    return {
      v: META_VERSION,
      points: isFinite(points) && points > 0 ? points : 0,
      unlocked: unlocked,
      lastSettled: typeof d.lastSettled === 'string' ? d.lastSettled : null,
      currentTalent: talentById(typeof d.currentTalent === 'string' ? d.currentTalent : null) ? String(d.currentTalent) : null,
    }
  } catch (e) {
    return base
  }
}

export function serializeMeta(m: MetaState): string {
  return JSON.stringify({ v: META_VERSION, points: m.points, unlocked: m.unlocked, lastSettled: m.lastSettled, currentTalent: m.currentTalent })
}

/** 倍数档位 0..3：1 倍、3 倍、10 倍。 */
export function multTier(mult: number): number {
  if (!isFinite(mult) || mult < 1) return 0
  if (mult >= 10) return 3
  if (mult >= 3) return 2
  return 1
}

export interface SettlePart {
  label: string
  value: number
}

export interface SettleResult {
  /** 实际记进账的点数（封顶 POINTS_PER_RUN_CAP）。 */
  total: number
  /** 封顶前的原始合计。 */
  raw: number
  parts: SettlePart[]
}

/** 一局结束按结局结算记忆点：倍数档 0–3 + 家 +1 + 身体 +1 + 走到头 +1，封顶 5。 */
export function settleRun(s: PlayerState): SettleResult {
  const mult = s.start ? s.asset / s.start : 0
  const parts: SettlePart[] = [
    { label: '倍数 ' + mult.toFixed(2) + '×', value: multTier(mult) },
    { label: '家 ' + Math.round(s.fam), value: s.fam >= 60 ? 1 : 0 },
    { label: '身体 ' + Math.round(s.health), value: s.health >= 40 ? 1 : 0 },
    { label: '走到头', value: s.over && !s.busted ? 1 : 0 },
  ]
  let raw = 0
  for (let i = 0; i < parts.length; i++) raw += parts[i].value
  return { total: Math.min(POINTS_PER_RUN_CAP, raw), raw: raw, parts: parts }
}

/** 一局的指纹：同一个 seed 同一个结局算同一局，重复进结局页不再加点。 */
export function runToken(s: PlayerState, seed: number): string {
  return [Math.round(seed), s.seasons, Math.round(s.asset), s.busted ? 'b' : 'e'].join(':')
}

export interface AwardResult {
  meta: MetaState
  /** 这一局加了几点（重复结算时为 0）。 */
  earned: number
  /** 是不是同一局重复进结局页（true ⇒ 没加点）。 */
  duplicate: boolean
  settle: SettleResult
}

/** 结算一局。只有真正走到 end 的局才算；同一指纹只算一次。 */
export function award(m: MetaState, s: PlayerState, seed: number): AwardResult {
  const settle = settleRun(s)
  if (!s.over) return { meta: m, earned: 0, duplicate: false, settle: settle }
  const token = runToken(s, seed)
  if (m.lastSettled === token) return { meta: m, earned: 0, duplicate: true, settle: settle }
  const next: MetaState = {
    v: META_VERSION,
    points: m.points + settle.total,
    unlocked: m.unlocked.slice(),
    lastSettled: token,
    currentTalent: m.currentTalent,
  }
  return { meta: next, earned: settle.total, duplicate: false, settle: settle }
}

export function isUnlocked(m: MetaState, id: string | null | undefined): boolean {
  if (!id) return false
  return m.unlocked.indexOf(id) >= 0
}

/** 这个天赋现在能不能带进本局（存在且已解锁）。 */
export function canCarry(m: MetaState, id: string | null | undefined): boolean {
  return !!talentById(id) && isUnlocked(m, id)
}

export interface UnlockResult {
  meta: MetaState
  ok: boolean
  /** 失败原因：owned=已经解锁过，points=点数不够，unknown=没有这个天赋。 */
  reason?: 'owned' | 'points' | 'unknown'
}

/** 花点数永久解锁一个天赋。点数不够或已经解锁都不动 meta。 */
export function unlock(m: MetaState, id: string): UnlockResult {
  const t = talentById(id)
  if (!t) return { meta: m, ok: false, reason: 'unknown' }
  if (isUnlocked(m, id)) return { meta: m, ok: false, reason: 'owned' }
  if (m.points < t.price) return { meta: m, ok: false, reason: 'points' }
  const next: MetaState = {
    v: META_VERSION,
    points: m.points - t.price,
    unlocked: m.unlocked.concat([id]),
    lastSettled: m.lastSettled,
    currentTalent: m.currentTalent,
  }
  return { meta: next, ok: true }
}

/** 记下本局带的天赋（null = 纯挑战）。 */
export function carryTalent(m: MetaState, id: string | null | undefined): MetaState {
  const ok = canCarry(m, id)
  const next: MetaState = {
    v: META_VERSION,
    points: m.points,
    unlocked: m.unlocked.slice(),
    lastSettled: m.lastSettled,
    currentTalent: ok ? String(id) : null,
  }
  return next
}

/** 天赋池 + 当前解锁状态（选天赋的卡直接吃这个）。 */
export interface TalentRow {
  id: string
  name: string
  desc: string
  price: number
  unlocked: boolean
  affordable: boolean
}

export function talentRows(m: MetaState): TalentRow[] {
  return TALENTS.map(function (t) {
    return {
      id: t.id,
      name: t.name,
      desc: t.desc,
      price: t.price,
      unlocked: isUnlocked(m, t.id),
      affordable: m.points >= t.price,
    }
  })
}
