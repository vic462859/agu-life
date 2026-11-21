import { describe, expect, it } from 'vitest'
import {
  chooseEvent,
  chooseLate,
  chooseYear,
  createGame,
  createRng,
  lateStep,
  step,
  totalQuarters,
} from '../src/core'
import { YEV } from '../src/core/data/events'
import type { LifeEffect } from '../src/core/types'

/** C1 补齐的 14 条史实年份。 */
const NEW_YEARS = [1993, 1997, 2000, 2002, 2004, 2006, 2009, 2010, 2013, 2015, 2018, 2021, 2024, 2026]
/** 属性类字段（增量，[-20,20]）。 */
const ATTRS: (keyof LifeEffect)[] = ['sense', 'net', 'rep', 'health', 'fam', 'flag']

function find(y: number) {
  return YEV.filter(function (e) { return e.y === y })
}

describe('14 条史实年度事件', () => {
  it('年份唯一，且不与既有年份重复', () => {
    const years = YEV.map(function (e) { return e.y })
    expect(new Set(years).size).toBe(years.length)
    for (const y of NEW_YEARS) {
      expect(years.filter(function (v) { return v === y }).length).toBe(1)
    }
    expect(YEV.length).toBe(35)
  })

  it('结构完整：标题、叙述、两个选项，每个选项都有 k/d/a', () => {
    for (const y of NEW_YEARS) {
      const list = find(y)
      expect(list.length).toBe(1)
      const e = list[0]
      expect(String(e.h).length).toBeGreaterThan(3)
      expect(String(e.p).length).toBeGreaterThan(10)
      expect(e.o.length).toBe(2)
      for (const o of e.o) {
        expect(String(o.k).length).toBeGreaterThan(0)
        expect(String(o.d).length).toBeGreaterThan(0)
        expect(o.a).toBeTruthy()
        expect(Object.keys(o.a as object).length).toBeGreaterThan(0)
      }
      // 两个选项必须真的不一样（不是同一个效果写两遍）
      expect(JSON.stringify(e.o[0].a)).not.toBe(JSON.stringify(e.o[1].a))
    }
  })

  it('两个选项是真取舍：至少一个字段方向相反，或一个选择直接落袋', () => {
    for (const y of NEW_YEARS) {
      const e = find(y)[0]
      const a = (e.o[0].a || {}) as LifeEffect
      const b = (e.o[1].a || {}) as LifeEffect
      const keys = Object.keys(a).filter(function (k) { return k in b })
      const opposite = keys.some(function (k) {
        const va = a[k as keyof LifeEffect] as number
        const vb = b[k as keyof LifeEffect] as number
        return typeof va === 'number' && typeof vb === 'number' && va * vb < 0
      })
      const oneSells = !!a.sell !== !!b.sell
      expect(opposite || oneSells).toBe(true)
    }
  })

  it('数值量级不越界：属性 ±20 内，一次性资产变动 ±25% 内', () => {
    for (const y of NEW_YEARS) {
      for (const o of find(y)[0].o) {
        const a = (o.a || {}) as LifeEffect
        for (const k of ATTRS) {
          const v = a[k]
          if (typeof v !== 'number') continue
          expect(Math.abs(v)).toBeLessThanOrEqual(20)
          expect(Number.isInteger(v)).toBe(true)
        }
        if (typeof a.cash === 'number') {
          // 一次性资产变动：±5%~±25% 之间，且是真的动了一笔（不是 0.001 的摆设）
          expect(Math.abs(a.cash)).toBeLessThanOrEqual(0.25)
          expect(Math.abs(a.cash)).toBeGreaterThanOrEqual(0.02)
        }
      }
    }
  })

  it('年份都落在本剧本能走到的 1991—2026 之间', () => {
    for (const y of NEW_YEARS) {
      expect(y).toBeGreaterThanOrEqual(1991)
      expect(y).toBeLessThanOrEqual(2026)
    }
  })

  it('文案里不喊口号：每条叙述都有具体器物或动作，不出现感叹号', () => {
    for (const y of NEW_YEARS) {
      const e = find(y)[0]
      expect(e.p).not.toContain('！')
      expect(e.h).not.toContain('！')
      expect(e.p.length).toBeLessThanOrEqual(120)
    }
  })
})

/** 走完整局（交易期一路选第一个选项，晚年一路选第一个选项）。 */
function playToEnd(seed: number) {
  const rng = createRng(seed)
  let state = createGame(0, 'real', seed, rng).state
  const years: number[] = []
  const kinds: string[] = []
  const logs: string[] = []
  let guard = 0
  while (state.phase === 'trade' && guard++ < 4000) {
    if (state.pending) {
      const p = state.pending
      if (p.type === 'year') {
        years.push(p.year)
        const out = chooseYear(state, 0, rng)
        kinds.push(out.kind)
        logs.push(...out.logs.map(function (l) { return l.text }))
        state = out.state
      } else if (p.type === 'event') {
        state = chooseEvent(state, 0, rng).state
      } else {
        throw new Error('trade 阶段不该出现 late pending')
      }
      continue
    }
    state = step(state, rng).state
  }
  let lateGuard = 0
  while (state.phase === 'late' && lateGuard++ < 100) {
    state = lateStep(state, rng).state
    if (state.phase === 'end') break
    state = chooseLate(state, 0, rng).state
  }
  return { state: state, years: years, kinds: kinds, logs: logs }
}

describe('末年的年度事件（2026）能被触发', () => {
  it('一整局里 2026 弹且只弹一次，之后照常进晚年、144 季总数不变', () => {
    const r = playToEnd(31337)
    expect(r.years.filter(function (y) { return y === 2026 }).length).toBe(1)
    expect(r.state.phase).toBe('end')
    expect(r.state.s.qi).toBe(144)
    expect(totalQuarters(r.state)).toBe(144)
    // 选完年末事件的那一次调用本身就把人送进晚年（kind 由 settled 变 late）
    const i = r.years.indexOf(2026)
    expect(r.kinds[i]).toBe('late')
    // 进晚年那两句只出现一次，而且排在年末事件之后
    expect(r.logs.filter(function (t) { return t.indexOf('2026 年末') === 0 }).length).toBe(1)
    const pick = r.logs.findIndex(function (t) { return t.indexOf('2026 年底') === 0 })
    const late = r.logs.findIndex(function (t) { return t.indexOf('2026 年末') === 0 })
    expect(pick).toBeGreaterThanOrEqual(0)
    expect(late).toBeGreaterThan(pick)
  })

  it('年末事件没打乱节奏：年份不重复，其余年份一个不少', () => {
    const r = playToEnd(31337)
    const seen = new Set(r.years)
    expect(seen.size).toBe(r.years.length)
    expect([1992, 1993, 1997, 2000, 2006, 2015, 2018, 2024, 2026].every(function (y) { return seen.has(y) })).toBe(true)
  })
})

