import { describe, expect, it } from 'vitest'
import { chooseEvent, createGame, createRng, type GameState } from '../src/core'
// cut 的口径与代价都只在本模块（core 对外出口本轮不动）
import {
  CUT_LOSS_BASE,
  CUT_LOSS_LEV,
  CUT_LOSS_MAX,
  CUT_LOSS_MIN,
  CUT_LOSS_SLOPE,
  cutLoss,
  getCutLoss,
  getCutMode,
  setCutLoss,
  setCutLev,
  setCutMode,
} from '../src/core/engine/events'

/** 造一局停在 1994 Q3 特殊事件（EV['1994-3']：第 0 项就是 cut）上的局面。 */
function atCut(pos: number, asset?: number, lev: boolean = false): GameState {
  const seed = 19940103
  const g = createGame(0, 'real', seed, createRng(seed)).state
  const qi = 14 // 1994 Q3
  const s = { ...g.s, qi: qi, pos: pos, lev: lev, health: 100, fam: 100 }
  if (asset != null) s.asset = asset
  return { ...g, pending: { type: 'event', key: '1994-3', qi: qi }, s: s }
}

describe('cut（割在最低点）：清仓 + 代价随仓位缩放', () => {
  it('默认口径已经是 liquidate；代价 = 一成 + 0.17×仓位 + 0.06×杠杆，夹在 [0.10, 0.40]', () => {
    expect(getCutMode()).toBe('liquidate')
    expect(CUT_LOSS_BASE).toBe(0.1)
    expect(CUT_LOSS_SLOPE).toBe(0.17)
    expect(CUT_LOSS_LEV).toBe(0.06)
    expect(cutLoss(0)).toBeCloseTo(0.1, 10)
    expect(cutLoss(0.25)).toBeCloseTo(0.1425, 10)
    expect(cutLoss(0.5)).toBeCloseTo(0.185, 10)
    expect(cutLoss(1)).toBeCloseTo(0.27, 10)
    // 杠杆项：同一仓位加上杠杆就更疼
    expect(cutLoss(1, 1)).toBeCloseTo(0.33, 10)
    expect(cutLoss(1, true)).toBeCloseTo(0.33, 10)
    expect(cutLoss(0.5, 1)).toBeCloseTo(0.245, 10)
    expect(cutLoss(1, 1)).toBeGreaterThan(cutLoss(1, 0))
    // 越界夹住：仓位不会被喂到 10 或 -1，但公式本身得挡得住
    expect(cutLoss(10)).toBeCloseTo(CUT_LOSS_MAX, 10)
    expect(cutLoss(-1)).toBeCloseTo(CUT_LOSS_MIN, 10)
    expect(cutLoss(10, 1)).toBeCloseTo(CUT_LOSS_MAX, 10)
    expect(getCutLoss(0.5)).toBeCloseTo(0.185, 10)
  })

  it('liquidate：满仓割下去 = 清仓 + ×0.73（只扣一次），H 那季记 pos=0/pnl=0', () => {
    const out = chooseEvent(atCut(1, 100000), 0, createRng(7))
    expect(out.state.s.pos).toBe(0)
    expect(out.state.s.asset).toBeCloseTo(100000 * (1 - cutLoss(1)), 6)
    const row = out.state.s.H[out.state.s.H.length - 1]
    expect(row[3]).toBe(0)
    expect(row[4]).toBe(0)
    expect(row[5]).toBe(0)
    expect(out.logs.filter(function (l) { return l.text.indexOf('割在最低点') >= 0 }).length).toBe(1)
    expect(out.logs.some(function (l) { return l.text.indexOf('27%') >= 0 })).toBe(true)
  })

  it('liquidate：半仓割下去 = 清仓 + ×0.815（仓位越轻这一刀越轻）', () => {
    const out = chooseEvent(atCut(0.5, 100000), 0, createRng(7))
    expect(out.state.s.pos).toBe(0)
    expect(out.state.s.asset).toBeCloseTo(100000 * (1 - cutLoss(0.5)), 6)
    expect(out.state.s.asset).toBeGreaterThan(100000 * (1 - cutLoss(1)))
  })

  it('liquidate：满仓 + 杠杆 = ×0.67，比不加杠杆再疼一档', () => {
    const out = chooseEvent(atCut(1, 100000, true), 0, createRng(7))
    expect(out.state.s.pos).toBe(0)
    expect(out.state.s.asset).toBeCloseTo(100000 * (1 - cutLoss(1, 1)), 6)
    expect(out.state.s.asset).toBeLessThan(100000 * (1 - cutLoss(1, 0)))
  })

  it('杠杆项只有一个旋钮：setCutLev(0.10) 时满仓+杠杆就是 ×0.63，复位后回到 0.06 那一档', () => {
    setCutLev(0.1)
    try {
      const out = chooseEvent(atCut(1, 100000, true), 0, createRng(7))
      expect(out.state.s.asset).toBeCloseTo(63000, 6)
      expect(cutLoss(1, 1)).toBeCloseTo(0.37, 10)
    } finally {
      setCutLev(CUT_LOSS_LEV)
    }
    expect(cutLoss(1, 1)).toBeCloseTo(0.33, 10)
  })

  it('liquidate：空仓时点割不扣钱、资产一动不动，只换一句实话', () => {
    const out = chooseEvent(atCut(0, 100000), 0, createRng(7))
    expect(out.state.s.asset).toBeCloseTo(100000, 6)
    expect(out.state.s.pos).toBe(0)
    expect(out.logs.some(function (l) { return l.text.indexOf('没割到你') >= 0 })).toBe(true)
    expect(out.logs.some(function (l) { return l.text.indexOf('割在最低点') >= 0 })).toBe(false)
  })

  it('legacy（对照与回归）：仓位不动，仍扣 10%，H 写原仓位', () => {
    setCutMode('legacy')
    try {
      const out = chooseEvent(atCut(0.5, 100000), 0, createRng(7))
      expect(out.state.s.pos).toBe(0.5)
      expect(out.state.s.asset).toBeCloseTo(90000, 6)
      expect(out.state.s.H[out.state.s.H.length - 1][3]).toBe(0.5)
    } finally {
      setCutMode('liquidate')
    }
  })

  it('代价只有一个旋钮：钉成常数时按常数扣，复位后回到公式', () => {
    setCutLoss(0.4)
    try {
      const out = chooseEvent(atCut(1, 100000), 0, createRng(7))
      expect(out.state.s.asset).toBeCloseTo(60000, 6)
    } finally {
      setCutLoss(null)
    }
    expect(getCutLoss(1)).toBeCloseTo(cutLoss(1), 10)
  })
})
