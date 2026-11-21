/** 把逐月点位切成「年块·季线」，供剧本按年拼装。逻辑与原 game.js 的 buildBlocks 一致。 */
import type { BlockQuarter } from '../types'
import { M } from './market'

export function buildBlocks(): Record<number, BlockQuarter[]> {
  const idx: Record<number, number> = {}
  let i = 0
  idx[199012] = M[i++]
  for (let y = 1991; y <= 2026 && i < M.length; y++) {
    for (let m = 1; m <= 12 && i < M.length; m++) idx[y * 100 + m] = M[i++]
  }
  const bl: Record<number, BlockQuarter[]> = {}
  for (let y = 1991; y <= 2026; y++) {
    const qs: BlockQuarter[] = []
    for (let qi = 1; qi <= 4; qi++) {
      const ms = [y * 100 + qi * 3 - 2, y * 100 + qi * 3 - 1, y * 100 + qi * 3]
      let vals: number[] = []
      for (const k of ms) if (idx[k] != null) vals.push(idx[k])
      if (y === 2026 && qi === 4) vals = [idx[202610], idx[202611]].filter(function (v) { return v != null })
      if (!vals.length) continue
      const p0 = qi === 1 ? idx[(y - 1) * 100 + 12] : idx[y * 100 + qi * 3 - 3]
      if (p0 == null) continue
      const hi = Math.max.apply(null, vals) / p0 - 1
      const lo = Math.min.apply(null, vals) / p0 - 1
      const p3 = vals[vals.length - 1]
      qs.push({ p0: p0, hi: hi, lo: lo, ret: p3 / p0 - 1 })
    }
    bl[y] = qs
  }
  return bl
}

/** 真实史料季线（模块级只算一次）。 */
export const BL: Record<number, BlockQuarter[]> = buildBlocks()
