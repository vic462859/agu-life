/**
 * 感官层（音效 / 震动）：表现层只说「发生了什么」，响不响、震不震由平台层给（runtime/*）。
 * 两个开关存在同一个槽里（agu_sfx_v1，一段 JSON），默认都开。
 * 这里不读系统时间、不摸平台全局 —— 纯函数，单测直接喂字符串就能验。
 */

/** 三个音效：点击 60ms / 结算涨 120ms / 结算跌 160ms（scripts/gen-sfx.mjs 的产物）。 */
export type SfxKind = 'click' | 'up' | 'down'

/** 三个震动时机：有效点击 / 每季结算 / 爆仓。 */
export type HapticKind = 'tap' | 'settle' | 'bust'

/** 平台层注入的「放一声」：宿主不支持就什么都不做（不许抛错）。 */
export type SfxPlay = (kind: SfxKind) => void
/** 平台层注入的「震一下」：同上。 */
export type HapticPlay = (kind: HapticKind) => void

export interface Senses {
  sfx: boolean
  haptic: boolean
}

/** 两个开关的存档槽：{"sfx":true,"haptic":true}；读不出来 / 坏档一律当开。 */
export const SENS_KEY = 'agu_sfx_v1'

export function readSenses(get: ((key: string) => string | null) | null): Senses {
  const on: Senses = { sfx: true, haptic: true }
  if (!get) return on
  let raw: string | null = null
  try {
    raw = get(SENS_KEY)
  } catch (e) {
    return on
  }
  if (!raw) return on
  try {
    const v = JSON.parse(raw) as { sfx?: unknown; haptic?: unknown }
    // 只有明确的 false 才算关：老档 / 缺字段 / 脏数据都回到「开」
    return { sfx: v.sfx !== false, haptic: v.haptic !== false }
  } catch (e) {
    return on
  }
}

export function writeSenses(set: ((key: string, value: string) => void) | null, s: Senses): void {
  if (!set) return
  try {
    set(SENS_KEY, JSON.stringify({ sfx: s.sfx, haptic: s.haptic }))
  } catch (e) {
    // 存储不可用不该影响这一局
  }
}
