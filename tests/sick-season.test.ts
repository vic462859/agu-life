import { describe, expect, it } from 'vitest'
import {
  chooseEvent,
  chooseLate,
  chooseYear,
  createGame,
  createRng,
  lateStep,
  profileLines,
  step,
  type GameState,
} from '../src/core'
// 注意：把 cut 口径钉在 legacy 只是为了隔离"记账不变量"（病季补账不改变资产序列）：
// 这条指纹要证明的是"补账不动钱"，不是"线上是 legacy" —— 线上默认是 liquidate（清仓 +
// 按仓位与杠杆扣代价），那是平衡层的独立改动，由 tests/cut-semantics.test.ts 负责。
import { setCutMode } from '../src/core/engine/events'

/** 把身体压到 30 以下，让病季真的出现（每季 10% 概率）。 */
function sickify(g: GameState): GameState {
  return { ...g, s: { ...g.s, health: 10 } }
}

/** 整局：每季前把身体压到 10，事件/年度事件一律选第一个。返回资产序列与末局。 */
function playSick(seed: number) {
  const rng = createRng(seed)
  let g = createGame(0, 'real', seed, rng).state
  const series: number[] = []
  let guard = 0
  while (g.phase === 'trade' && guard++ < 3000) {
    if (g.pending) {
      if (g.pending.type === 'year') g = chooseYear(g, 0, rng).state
      else if (g.pending.type === 'event') g = chooseEvent(g, 0, rng).state
      else break
      continue
    }
    g = step(sickify(g), rng).state
    series.push(Math.round(g.s.asset * 1000) / 1000)
  }
  let lg = 0
  while (g.phase === 'late' && lg++ < 100) {
    g = lateStep(g, rng).state
    if (g.phase === 'end') break
    g = chooseLate(g, 0, rng).state
  }
  return { state: g, series: series }
}

/** 资产序列指纹（FNV-1a），用来把「修前修后一致」钉成断言。 */
function fingerprint(series: number[]): string {
  let h = 2166136261
  const buf = series.join(',')
  for (let i = 0; i < buf.length; i++) {
    h ^= buf.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

/** 从档案第一条里抠出四档仓位的百分比。 */
function posPcts(lines: string[]): number[] {
  const out: number[] = []
  const first = lines[0] || ''
  const re = /(满仓|半仓|四分之一仓|空仓) (\d+)%/g
  let m: RegExpExecArray | null
  while ((m = re.exec(first))) out.push(Number(m[2]))
  return out
}

describe('病季照常算一季（修理既有的少记一季）', () => {
  it('病季只扣医药费：资产恰好 ×0.94，H 里 pnl 记 0、仓位写当时持仓', () => {
    const seed = 20240101
    // 固定随机源：下一拍永远落在 0.0001 ⇒ 病季判定必中，可复跑
    const rng = { next: function () { return 0.0001 }, int: function () { return 0 } }
    let g = createGame(0, 'real', seed, createRng(seed)).state
    // 空仓才不会被市场结算干扰：先摆好仓位再下病害
    g = { ...g, s: { ...g.s, pos: 0.5, health: 10, fam: 100 } }
    const before = g.s.asset
    const out = step(g, rng)
    const sick = out.logs.some(function (l) { return l.text.indexOf('病了一场') >= 0 })
    expect(sick).toBe(true)
    // 只扣 6% 医药费，没有别的资产变动
    expect(out.state.s.asset).toBeCloseTo(before * 0.94, 6)
    // 这一季照常记一笔，但如实：没交易、没换板块
    expect(out.state.s.seasons).toBe(1)
    expect(out.state.s.H.length).toBe(1)
    const row = out.state.s.H[0]
    expect(row[3]).toBe(0.5) // 仓位 = 当时的真实持仓，不是 0 也不是 1
    expect(row[4]).toBe(0) // pnl 记 0
    expect(row[5]).toBe(0) // isChg
    expect(row[6]).toBe(0) // bang
    expect(row[7]).toBe(0) // hit
    expect(row[0]).toBe(1991)
    expect(row[1]).toBe(1)
  })

  it('一局里病了 7 次也还是 144 季：seasons == H == qi == 144', () => {
    const r = playSick(31337)
    expect(r.state.s.qi).toBe(144)
    expect(r.state.s.seasons).toBe(144)
    expect(r.state.s.H.length).toBe(144)
    expect(r.state.phase).toBe('end')
  })

  it('修前修后资产序列与结局资产完全一致（指纹取自修前那一版）', () => {
    setCutMode('legacy')
    try {
      const r = playSick(31337)
      // 这两个数是**把病季补账与 advance 兜底拿掉之后**跑出来的同一局：
      // 只有 交易季数/H 记账变了（135 → 144），资产序列一个数都没动。
      expect(fingerprint(r.series)).toBe('7feb5f41')
      expect(Math.round(r.state.s.asset * 1000) / 1000).toBe(30851.706)
      expect(r.series.length).toBe(144)
      // 同一 seed 再跑一遍：完全一致（病季没有额外的随机数消耗）
      const again = playSick(31337)
      expect(fingerprint(again.series)).toBe('7feb5f41')
      expect(again.state.s.seasons).toBe(144)
    } finally {
      setCutMode('liquidate')
    }
  })

  it('档案四档仓位的百分比加起来正好 100%', () => {
    const r = playSick(31337)
    const lines = profileLines(r.state.s)
    expect(lines.length).toBeGreaterThan(0)
    const p = posPcts(lines)
    expect(p.length).toBeGreaterThanOrEqual(1)
    const sum = p.reduce(function (a, b) { return a + b }, 0)
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.5)
    expect(lines[0]).toContain('你')
  })
})
