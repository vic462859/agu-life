import { describe, expect, it } from 'vitest'
import { buildMap, buildQuarters, createRng } from '../src/core'
import type { SectorId } from '../src/core'
import { K } from '../src/core/data/sectors'
import { DEFAULT_SPAN, sectorSeries } from '../src/ui/share/sectorSeries'

/** 史实模式的剧本（1991..2026 顺排），够 drawQuarters 拼满 144 季。 */
const MAP = buildMap('real', createRng(19911219))

/** 一份「整段时间里 龙头 一直超额、红利 一直落后」的 kty，用来验口径方向。 */
function tilted(mid: number): Record<number, Record<SectorId, number>> {
  const out: Record<number, Record<SectorId, number>> = {}
  for (let i = 0; i < MAP.length; i++) {
    out[MAP[i]] = { 龙头: mid, 题材: mid / 2, 成长: 0, 红利: -mid, 壳: -mid / 2 }
  }
  return out
}

describe('sectorSeries 口径', () => {
  it('首点恒为 100，点数 = min(span, 已走季度) + 1', () => {
    const a = sectorSeries(MAP, null, '龙头', 8, 12)
    expect(a[0]).toBe(100)
    expect(a.length).toBe(9)
    const b = sectorSeries(MAP, null, '龙头', 40, 12)
    expect(b[0]).toBe(100)
    expect(b.length).toBe(13)
    expect(a.every((v) => Number.isFinite(v))).toBe(true)
  })

  it('空数据返回空数组；单季只有一个基准点', () => {
    expect(sectorSeries([], null, '龙头', 8, 12)).toEqual([])
    expect(sectorSeries(null, null, '龙头', 8, 12)).toEqual([])
    expect(sectorSeries(MAP, null, '龙头', 0, 12)).toEqual([])
    expect(sectorSeries(MAP, null, '龙头', -3, 12)).toEqual([])
    const one = sectorSeries(MAP, null, '龙头', 1, 12)
    expect(one.length).toBe(2)
    expect(one[0]).toBe(100)
  })

  it('span 越界自动夹住：<=0 夹到 1，超长夹到全部', () => {
    expect(sectorSeries(MAP, null, '龙头', 10, 3).length).toBe(4)
    expect(sectorSeries(MAP, null, '龙头', 10, 0).length).toBe(2)
    expect(sectorSeries(MAP, null, '龙头', 10, -7).length).toBe(2)
    expect(sectorSeries(MAP, null, '龙头', 10, 999).length).toBe(11)
    expect(sectorSeries(MAP, null, '龙头', 10, Number.NaN).length).toBe(11)
    expect(DEFAULT_SPAN).toBe(12)
    expect(sectorSeries(MAP, null, '龙头', 40).length).toBe(13)
  })

  it('同一 map + uptoQi 结果稳定（两次调用、拷贝后调用都逐点相同）', () => {
    const kty = tilted(0.6)
    const a = sectorSeries(MAP, kty, '题材', 17, 12)
    const b = sectorSeries(MAP.slice(), tilted(0.6), '题材', 17, 12)
    expect(a).toEqual(b)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    // 中间点只取决于窗口内的季度，不取决于之前发生过什么
    expect(sectorSeries(MAP, kty, '题材', 18, 12).length).toBe(13)
  })

  it('口径单调性：一直超额 > 0 ⇒ 末点 > 首点；一直落后 ⇒ 末点 < 首点', () => {
    const kty = tilted(0.8)
    const up = sectorSeries(MAP, kty, '龙头', 20, 12)
    const down = sectorSeries(MAP, kty, '红利', 20, 12)
    expect(up[up.length - 1]).toBeGreaterThan(100)
    expect(down[down.length - 1]).toBeLessThan(100)
    // 每一步都朝同一方向走：末点 > 首点且逐步抬升
    for (let i = 1; i < up.length; i++) expect(up[i]).toBeGreaterThan(up[i - 1])
    for (let i = 1; i < down.length; i++) expect(down[i]).toBeLessThan(down[i - 1])
  })

  it('单季数值 = 100 × (1 + ret × (K-1) + kty 年 × 0.15)，与 core 结算项同源', () => {
    const q = buildQuarters(MAP)[0]
    const kty = tilted(0.4)
    const got = sectorSeries(MAP, kty, '龙头', 1, 12)
    const want = 100 * (1 + q.ret * (K['龙头'] - 1) + kty[q.my]['龙头'] * 0.15)
    expect(got[1]).toBeCloseTo(want, 2)
    // 同一季里，成长（K=1）的差异只来自 kty
    const growth = sectorSeries(MAP, kty, '成长', 1, 12)
    expect(growth[1]).toBeCloseTo(100, 3)
  })
})
