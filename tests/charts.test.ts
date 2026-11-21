import { describe, expect, it } from 'vitest'
import geometryRaw from '../src/ui/components/charts/geometry.ts?raw'
import {
  downsample,
  niceTicks,
  pathFromPoints,
  resolveCanvasSize,
  scaleLinear,
  toSeries,
} from '../src/ui/components/charts/geometry'

const finite = (a: number[]): boolean => a.every((v) => Number.isFinite(v))
const ascending = (a: number[]): boolean => a.every((v, i) => i === 0 || a[i - 1] <= v)

describe('geometry.niceTicks', () => {
  it('对齐到 1/2/5 台阶、升序、无 NaN', () => {
    const t = niceTicks(0, 1000, 5)
    expect(t.length).toBeGreaterThanOrEqual(3)
    expect(finite(t)).toBe(true)
    expect(ascending(t)).toBe(true)
    expect(t).toContain(0)
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(1000)
    expect(t[1] % 200).toBe(0)
  })

  it('min === max（全等值）时撑开区间而不是返回空', () => {
    for (const v of [0, 100, -7.5]) {
      const t = niceTicks(v, v, 5)
      expect(t.length).toBeGreaterThanOrEqual(3)
      expect(finite(t)).toBe(true)
      expect(ascending(t)).toBe(true)
      expect(t[0]).toBeLessThan(v)
      expect(t[t.length - 1]).toBeGreaterThan(v)
    }
  })

  it('极值差 1e-9 时不退化为 0、不产生 NaN 或重复', () => {
    const t = niceTicks(1e-9, 2e-9, 5)
    expect(t.length).toBeGreaterThanOrEqual(3)
    expect(finite(t)).toBe(true)
    expect(ascending(t)).toBe(true)
    expect(new Set(t).size).toBe(t.length)
  })

  it('非有限输入返回空数组（不抛错）', () => {
    expect(niceTicks(NaN, 1)).toEqual([])
    expect(niceTicks(0, Infinity)).toEqual([])
  })
})

describe('geometry.scaleLinear', () => {
  it('线性映射与 invert 往返一致', () => {
    const s = scaleLinear([0, 100], [0, 200])
    expect(s(0)).toBe(0)
    expect(s(50)).toBe(100)
    expect(s(100)).toBe(200)
    expect(s.invert(150)).toBe(75)
  })

  it('退化 domain（min === max）落在中线且不产生 NaN', () => {
    const s = scaleLinear([5, 5], [0, 100])
    expect(s(5)).toBe(50)
    expect(s(-999)).toBe(50)
    expect(s(NaN)).toBe(50)
    expect(Number.isFinite(s.invert(0))).toBe(true)
  })
})

describe('geometry.toSeries', () => {
  it('缺标签用下标补，非有限数按 0', () => {
    expect(toSeries([1, 2])).toEqual([
      { t: '0', v: 1 },
      { t: '1', v: 2 },
    ])
    expect(toSeries([1, NaN], ['2020', '2021'])[1]).toEqual({ t: '2021', v: 0 })
  })
})

describe('geometry.pathFromPoints', () => {
  it('空数组：不抛错，路径为空、xs 为空', () => {
    const r = pathFromPoints([], { width: 300, height: 120 })
    expect(r.line).toBe('')
    expect(r.area).toBe('')
    expect(r.xs).toEqual([])
    expect(r.zeroY).toBeNull()
  })

  it('单点：一个 x，line 以 M 开头，area 为空', () => {
    const r = pathFromPoints(toSeries([42]), { width: 300, height: 120 })
    expect(r.xs.length).toBe(1)
    expect(r.line.startsWith('M')).toBe(true)
    expect(r.area).toBe('')
    expect(r.xs[0]).toBeGreaterThan(0)
  })

  it('全等值：得到一条水平线（所有 y 相同且在画布内）', () => {
    const r = pathFromPoints(toSeries([7, 7, 7, 7]), { width: 300, height: 120 })
    expect(new Set(r.ys).size).toBe(1)
    expect(r.ys[0]).toBeGreaterThan(0)
    expect(r.ys[0]).toBeLessThan(120)
  })

  it('含负值 + zeroLine：域含 0，zeroY 落在画布内且单调', () => {
    const r = pathFromPoints(toSeries([-5, 10, -3]), {
      width: 300,
      height: 120,
      zeroLine: true,
    })
    expect(r.yMin).toBeLessThanOrEqual(0)
    expect(r.yMax).toBeGreaterThanOrEqual(0)
    expect(r.zeroY).not.toBeNull()
    expect(r.zeroY as number).toBeGreaterThan(0)
    expect(r.zeroY as number).toBeLessThan(120)
    // 负值在零轴下方，正值在上方。
    expect(r.ys[0]).toBeGreaterThan(r.zeroY as number)
    expect(r.ys[1]).toBeLessThan(r.zeroY as number)
  })

  it('domain 固定域：两串数共用一把尺子，涨得多的那条一定更高', () => {
    const domain = [90, 150] as const
    const flat = pathFromPoints(toSeries([100, 103]), { width: 300, height: 120, domain })
    const up = pathFromPoints(toSeries([100, 140]), { width: 300, height: 120, domain })
    expect(flat.yMin).toBe(90)
    expect(flat.yMax).toBe(150)
    expect(up.yMin).toBe(90)
    // y 轴向下：末点 y 越小 = 越高。
    expect(up.ys[1]).toBeLessThan(flat.ys[1])
    // 两个域相同的图，同一个值的像素位置必须一致（这才是"同一把尺子"）。
    const a = pathFromPoints(toSeries([100, 120]), { width: 300, height: 120, domain })
    const b = pathFromPoints(toSeries([100, 130]), { width: 300, height: 120, domain })
    expect(a.ys[0]).toBe(b.ys[0])
  })

  it('domain 非法（NaN / 两端相等 / 缺一）时退回自动缩放，不产生 NaN', () => {
    const base = pathFromPoints(toSeries([1, 5, 3]), { width: 200, height: 100 })
    for (const bad of [[NaN, 10], [5, 5], [1, Infinity]] as [number, number][]) {
      const r = pathFromPoints(toSeries([1, 5, 3]), { width: 200, height: 100, domain: bad })
      expect(finite(r.ys)).toBe(true)
      expect(r.ys).toEqual(base.ys)
    }
  })

  it('极值差 1e-9 与零尺寸 / 负尺寸都不崩', () => {
    const tiny = pathFromPoints(toSeries([1e-9, 2e-9]), { width: 200, height: 100 })
    expect(finite(tiny.xs)).toBe(true)
    expect(finite(tiny.ys)).toBe(true)
    for (const w of [0, -10, NaN]) {
      const r = pathFromPoints(toSeries([1, 2, 3]), { width: w, height: 100 })
      expect(r.line).toBe('')
      expect(r.xs).toEqual([])
    }
  })

  it('144 个点的 x 单调递增且在画布内', () => {
    const vals = Array.from({ length: 144 }, (_, i) => 100 + i * 3)
    const r = pathFromPoints(toSeries(vals), { width: 640, height: 260, padding: 12 })
    expect(r.xs.length).toBe(144)
    expect(ascending(r.xs)).toBe(true)
    expect(r.xs[0]).toBe(12)
    expect(r.xs[143]).toBe(628)
    expect(r.ys.every((y) => y >= 12 && y <= 248)).toBe(true)
  })
})

describe('geometry.downsample', () => {
  it('不超上限、保留首尾、长度不变时原样返回', () => {
    expect(downsample([1, 2, 3], 10)).toEqual([1, 2, 3])
    const long = Array.from({ length: 500 }, (_, i) => i)
    const out = downsample(long, 20)
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out[0]).toBe(0)
    expect(out[out.length - 1]).toBe(499)
  })

  it('保形：单点尖峰不会被抽掉', () => {
    const series = Array.from({ length: 200 }, () => 1)
    series[50] = 99
    expect(downsample(series, 16)).toContain(99)
  })

  it('空输入与非法上限返回空数组', () => {
    expect(downsample([], 10)).toEqual([])
    expect(downsample([1, 2, 3], 0)).toEqual([])
  })
})

describe('geometry.resolveCanvasSize（dsf≥2 回归护栏）', () => {
  it('位图 = CSS × dpr，CSS 尺寸不随 dpr 变', () => {
    for (const dpr of [1, 1.5, 2, 3]) {
      const s = resolveCanvasSize(763, 471, dpr)
      expect(s.cssW).toBe(763)
      expect(s.cssH).toBe(471)
      expect(s.dpr).toBe(dpr)
      expect(s.bitmapW).toBe(Math.round(763 * dpr))
      expect(s.bitmapH).toBe(Math.round(471 * dpr))
    }
  })

  it('几何入参恒为 CSS 尺寸：dpr=1/2/3 下路径点位逐点相同', () => {
    const vals = Array.from({ length: 144 }, (_, i) => 500 + Math.round(Math.sin(i / 7) * 400))
    const series = toSeries(vals)
    const base = pathFromPoints(series, { width: 763, height: 471, padding: { top: 16, right: 10, bottom: 10, left: 10 } })
    for (const dpr of [2, 3]) {
      const size = resolveCanvasSize(763, 471, dpr)
      const r = pathFromPoints(series, {
        width: size.cssW,
        height: size.cssH,
        padding: { top: 16, right: 10, bottom: 10, left: 10 },
      })
      expect(r.xs).toEqual(base.xs)
      expect(r.ys).toEqual(base.ys)
      expect(r.line).toBe(base.line)
      // 位图只用来定 canvas.width / ctx.setTransform，绝不参与几何
      expect(size.bitmapW).toBe(763 * dpr)
    }
  })

  it('dpr 到 4 封顶，非法输入退回 1；0 尺寸兜底为 1', () => {
    expect(resolveCanvasSize(100, 50, 8).dpr).toBe(4)
    expect(resolveCanvasSize(100, 50, 8).bitmapW).toBe(400)
    for (const bad of [0, -2, NaN, Infinity]) {
      const s = resolveCanvasSize(100, 50, bad)
      expect(s.dpr).toBe(1)
      expect(s.bitmapW).toBe(100)
    }
    const z = resolveCanvasSize(0, NaN, 2)
    expect(z.cssW).toBe(1)
    expect(z.cssH).toBe(1)
    expect(z.bitmapW).toBe(2)
  })

  it('dpr=2 时位图恰好装得下 CSS 坐标系（不放大也不留边）', () => {
    const size = resolveCanvasSize(763, 471, 2)
    const geo = pathFromPoints(
      toSeries(Array.from({ length: 40 }, (_, i) => i)),
      { width: size.cssW, height: size.cssH, padding: 10 },
    )
    for (const x of geo.xs) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(size.cssW)
      expect(x * size.dpr).toBeLessThanOrEqual(size.bitmapW)
    }
  })
})

describe('geometry 纯度自检', () => {
  it('源码不含平台 API / 时间 / 随机（剥掉注释后检查）', () => {
    const src = String(geometryRaw)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    for (const banned of ['uni.', 'window.', 'document.', 'localStorage', 'Math.random', 'Date.now']) {
      expect(src.includes(banned), banned).toBe(false)
    }
  })
})
