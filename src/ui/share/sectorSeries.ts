/**
 * 板块相对强弱的迷你走势数据 —— 纯函数，只吃 core 的季度与 kty。
 *
 * ## 口径（先把话说清，再画）
 *
 * 每季该项 = 板块收益 − 大盘收益
 *          = (ret × K[板块] + kty[年][板块] × 0.15) − ret
 *          = ret × (K[板块] − 1) + kty[年][板块] × 0.15
 *
 * 括号里前半截就是 core 结算的板块收益项（engine/settle.ts: r = q.ret * K[s.sect] + kty * 0.15），
 * 减掉大盘自己那一季的 ret（ret 就是上证季线 p0 的变化，见 data/blocks.ts + engine/market.ts），
 * 剩下的才是「比大盘多赚/少赚的那一份」。不扣 ret 的话五条线只是同一条大盘分别乘 0.95~1.10，
 * 形状一模一样，玩家看不出强弱 —— 而那正是这张图存在的理由。
 *
 * 所以：这串数是**该板块相对大盘的累积超额**（首点 = 100），
 *   - 不是板块指数（不画点位），
 *   - 不是你的净值（不含仓位、杠杆、手续费、事件、随机扰动）。
 *
 * 复利累乘：100 × Π(1 + e_i)，不做年化、不平滑、不插值。
 * 纯函数：不读时间、不读随机、不读存档；同一 (map, kty, sect, uptoQi, span) 永远同一串数。
 */
import { buildQuarters } from '../../core'
import { K } from '../../core/data/sectors'
import type { SectorId } from '../../core'

/** 默认窗口：最近 12 季（三年）。见报告里的取值理由。 */
export const DEFAULT_SPAN = 12

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/**
 * 该板块在 [uptoQi- span, uptoQi) 这段季度里的相对大盘累积超额，首点归一化到 100。
 *
 * @param map     剧本年份表（GameState.map）
 * @param kty     年度板块超额表（GameState.s.kty），缺省按 0 处理
 * @param sect    板块
 * @param uptoQi  已经走完的季度数（直接传 s.qi；当前待结算的那季还没算进去）
 * @param span    窗口长度（季），缺省 12；<= 0 夹到 1，超过可用季度数就夹到全部
 * @returns 点数 = min(span, uptoQi) + 1，首点恒为 100；没有可画的数据时返回 []
 */
export function sectorSeries(
  map: readonly number[] | null | undefined,
  kty: Record<number, Record<SectorId, number>> | null | undefined,
  sect: SectorId,
  uptoQi: number,
  span: number = DEFAULT_SPAN,
): number[] {
  if (!map || !map.length) return []
  const quarters = buildQuarters(map)
  const rawEnd = Number(uptoQi)
  if (!isFinite(rawEnd)) return []
  const end = Math.max(0, Math.min(quarters.length, Math.floor(rawEnd)))
  if (end < 1) return []

  const rawSpan = Number(span)
  const win = Math.max(1, Math.floor(isFinite(rawSpan) ? rawSpan : DEFAULT_SPAN))
  const from = Math.max(0, end - win)

  const k = K[sect] == null ? 1 : K[sect]
  const out: number[] = [100]
  let v = 100
  for (let i = from; i < end; i++) {
    const q = quarters[i]
    const ret = isFinite(q.ret) ? q.ret : 0
    const row = kty ? kty[q.my] : null
    const ed = row && isFinite(row[sect]) ? row[sect] : 0
    v = v * (1 + ret * (k - 1) + ed * 0.15)
    out.push(round3(v))
  }
  return out
}
