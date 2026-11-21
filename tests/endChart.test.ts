import { describe, expect, it } from 'vitest'
import type { EndView } from '../src/core'
import { layoutEndChart, stillLifeFor, yearlySeries } from '../src/ui/share/endChart'

const end = (title: string, rows: Array<[string, string]>): EndView => ({
  title: title,
  note: '',
  willNote: '',
  assetText: '',
  rows: rows.map(function (r) {
    return { label: r[0], value: r[1] }
  }),
  profile: [],
  egg: '',
  epochHead: '',
  epochTail: '',
})

describe('endChart · 长图点位', () => {
  it('x 等距铺满画框、y 落在内边距内、点数等于序列长度', () => {
    const values = [100, 120, 90, 300]
    const l = layoutEndChart(values, 320, 180, 10)
    expect(l.points.length).toBe(4)
    expect(l.points[0].x).toBeCloseTo(10, 5)
    expect(l.points[3].x).toBeCloseTo(310, 5)
    for (let i = 1; i < l.points.length; i++) expect(l.points[i].x).toBeGreaterThan(l.points[i - 1].x)
    for (const p of l.points) {
      expect(p.y).toBeGreaterThanOrEqual(10 - 1e-6)
      expect(p.y).toBeLessThanOrEqual(170 + 1e-6)
    }
    // 最大值（300，下标 3）贴顶、最小值（90，下标 2）贴底
    expect(l.points[3].y).toBeCloseTo(10, 5)
    expect(l.points[2].y).toBeCloseTo(170, 5)
  })

  it('全等值 / 单点 / 空序列都不产生 NaN', () => {
    const flat = layoutEndChart([5, 5, 5], 200, 120, 8)
    for (const p of flat.points) expect(Number.isFinite(p.y)).toBe(true)
    expect(flat.points[1].y).toBeCloseTo(60, 5)
    const one = layoutEndChart([7], 200, 120, 8)
    expect(one.points.length).toBe(1)
    expect(Number.isFinite(one.points[0].y)).toBe(true)
    const none = layoutEndChart([], 200, 120, 8)
    expect(none.points.length).toBe(0)
    expect(none.indexMultiple).toBe(1)
  })

  it('对数轴：单调、极值仍贴边，一个"倍"的距离是常数', () => {
    const vals = [100, 200, 400, 800]
    const lin = layoutEndChart(vals, 200, 120, 8)
    const log = layoutEndChart(vals, 200, 120, 8, true)
    expect(log.points[0].y).toBeCloseTo(112, 5)
    expect(log.points[3].y).toBeCloseTo(8, 5)
    for (let i = 1; i < log.points.length; i++) expect(log.points[i].y).toBeLessThan(log.points[i - 1].y)
    const d1 = log.points[0].y - log.points[1].y
    const d2 = log.points[2].y - log.points[3].y
    expect(Math.abs(d1 - d2)).toBeLessThan(1e-6)
    const l1 = lin.points[0].y - lin.points[1].y
    const l2 = lin.points[2].y - lin.points[3].y
    expect(Math.abs(l1 - l2)).toBeGreaterThan(1)
  })

  it('指数倍率按首末点算，缺首值时不炸', () => {
    expect(layoutEndChart([127, 500, 3533], 100, 100, 4).indexMultiple).toBeCloseTo(3533 / 127, 5)
    expect(layoutEndChart([0, 10], 100, 100, 4).indexMultiple).toBe(1)
  })

  it('季度序列按年抽样：144 → 37 个点，且末点是最后那个季度', () => {
    const q: number[] = []
    for (let i = 0; i < 144; i++) q.push(100 + i)
    const y = yearlySeries(q)
    expect(y.length).toBe(37)
    expect(y[0]).toBe(100)
    expect(y[y.length - 1]).toBe(q[143])
  })
})

describe('endChart · 象征物映射', () => {
  it('爆仓 / 倍率 < 1 → 揉皱的报纸', () => {
    expect(stillLifeFor(end('爆仓', [['倍数', '3.5×'], ['身体', '80']]))).toBe('paper')
    expect(stillLifeFor(end('白干一场', [['倍数', '0.6×'], ['身体', '80']]))).toBe('paper')
  })

  it('倍数 ≥ 20 → 酒杯；身体 < 20 → 药瓶', () => {
    expect(stillLifeFor(end('大户', [['倍数', '25.0×'], ['身体', '80']]))).toBe('glass')
    expect(stillLifeFor(end('温饱', [['倍数', '3.0×'], ['身体', '15']]))).toBe('pill')
  })

  it('老且身子弱 → 手杖；壮年普通人 → 公文包', () => {
    expect(stillLifeFor(end('温饱', [['倍数', '3.0×'], ['身体', '42']]))).toBe('cane')
    expect(stillLifeFor(end('温饱', [['倍数', '3.0×'], ['身体', '72']]))).toBe('case')
    expect(stillLifeFor(end('温饱', [['倍数', '3.0×'], ['身体', '42']]), 60)).toBe('case')
  })

  it('缺字段时退回公文包，不抛错', () => {
    expect(stillLifeFor(end('温饱', []))).toBe('case')
  })
})