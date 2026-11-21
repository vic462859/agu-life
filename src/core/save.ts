/** 存档：core 只负责序列化格式与版本，读写落盘交给 platform/storage。 */
import type { GameState, Mode, Pending, Phase, PlayerState } from './types'

/** 存档格式版本。字段或语义变了就 +1，deserialize 会拒绝旧版本。 */
export const SAVE_VERSION = 1

/** 存档槽名（与原版一致）。 */
export const SAVE_KEY = 'agu_life_save_v1'

export interface SaveEnvelope {
  v: number
  mode: Mode
  map: number[]
  phase: Phase
  li: number
  pending: Pending | null
  seed: number
  s: PlayerState
  ts: number
}

/** 局面 → 字符串。 */
export function serialize(g: GameState, ts: number = 0): string {
  const env: SaveEnvelope = {
    v: SAVE_VERSION,
    mode: g.mode,
    map: g.map,
    phase: g.phase,
    li: g.li,
    pending: g.pending,
    seed: g.seed,
    s: g.s,
    ts: ts,
  }
  return JSON.stringify(env)
}

/** 字符串 → 局面。版本不对、结构不对、解析不了都返回 null（调用方当没存档）。 */
export function deserialize(raw: string | null | undefined): GameState | null {
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as SaveEnvelope
    if (!d || d.v !== SAVE_VERSION || !d.s || !Array.isArray(d.map)) return null
    return {
      mode: d.mode || 'real',
      map: d.map,
      phase: d.phase || 'trade',
      li: d.li || 0,
      pending: d.pending || null,
      seed: d.seed || 0,
      s: d.s,
    }
  } catch (e) {
    return null
  }
}
