import { describe, expect, it } from 'vitest'
import { createPlayerState, SAVE_KEY } from '../src/core'
import {
  award,
  canCarry,
  carryTalent,
  emptyMeta,
  META_KEY,
  META_VERSION,
  parseMeta,
  POINTS_PER_RUN_CAP,
  serializeMeta,
  settleRun,
  talentRows,
  unlock,
} from '../src/core/meta'
import type { PlayerState } from '../src/core/types'

function ended(asset: number, fam: number, health: number, over: boolean = true, busted: boolean = false): PlayerState {
  const s = createPlayerState()
  s.start = 30000
  s.asset = asset
  s.fam = fam
  s.health = health
  s.over = over
  s.busted = busted
  s.seasons = 172
  return s
}

describe('跨局记忆存档 agu_meta_v1', () => {
  it('坏档、旧版本、缺字段一律退回空档（不抛）', () => {
    expect(parseMeta(null)).toEqual(emptyMeta())
    expect(parseMeta('')).toEqual(emptyMeta())
    expect(parseMeta('{oops')).toEqual(emptyMeta())
    expect(parseMeta('[]')).toEqual(emptyMeta())
    expect(parseMeta(JSON.stringify({ v: META_VERSION + 1, points: 50, unlocked: ['cash'] })).points).toBe(0)
    expect(parseMeta(JSON.stringify({ v: META_VERSION, points: 'many', unlocked: 'cash' }))).toEqual(emptyMeta())
  })

  it('认不出的天赋 id 会被剔掉，坏的 currentTalent 退回 null', () => {
    const m = parseMeta(JSON.stringify({ v: META_VERSION, points: 7, unlocked: ['cash', 'nope'], lastSettled: 'x', currentTalent: 'nope' }))
    expect(m.points).toBe(7)
    expect(m.unlocked).toEqual(['cash'])
    expect(m.currentTalent).toBe(null)
  })

  it('往返：解锁/加点/本局天赋写进去，读回来一个字段都不差（等价于重启后还在）', () => {
    let m = emptyMeta()
    m = { ...m, points: 9 }
    const r = unlock(m, 'cash')
    expect(r.ok).toBe(true)
    m = carryTalent(r.meta, 'cash')
    m = award(m, ended(300000, 70, 80), 1234).meta
    const back = parseMeta(serializeMeta(m))
    expect(back).toEqual(m)
    expect(back.points).toBe(9 - 5 + settleRun(ended(300000, 70, 80)).total)
    expect(back.unlocked).toEqual(['cash'])
    expect(back.currentTalent).toBe('cash')
    expect(back.lastSettled).toBe(m.lastSettled)
  })

  it('记忆点存档与单局存档、挑战码互不共用槽名', () => {
    expect(META_KEY).toBe('agu_meta_v1')
    expect(META_KEY).not.toBe(SAVE_KEY)
  })
})

describe('记忆点结算', () => {
  it('倍数档位单调：<1 倍 0 分，1 倍 1 分，3 倍 2 分，10 倍 3 分', () => {
    const tier = (mult: number): number => settleRun(ended(30000 * mult, 50, 60)).parts[0].value
    expect(tier(0.9)).toBe(0)
    expect(tier(1)).toBe(1)
    expect(tier(2.99)).toBe(1)
    expect(tier(3)).toBe(2)
    expect(tier(10)).toBe(3)
  })

  it('单局封顶 POINTS_PER_RUN_CAP：倍数 3 + 家 + 身体 + 走到头 = 6 也只记 5', () => {
    const s = ended(30000 * 50, 90, 95)
    const r = settleRun(s)
    expect(r.raw).toBe(6)
    expect(r.total).toBe(POINTS_PER_RUN_CAP)
    expect(POINTS_PER_RUN_CAP).toBe(5)
  })

  it('爆仓的局拿不到「走到头」那一分，倍数也按 0 算', () => {
    const r = settleRun(ended(0, 20, 10, true, true))
    expect(r.parts[0].value).toBe(0)
    expect(r.parts[3].value).toBe(0)
    expect(r.total).toBe(0)
  })

  it('没走到 end 的局不加点；同一指纹重复结算也只加一次', () => {
    const running = ended(90000, 70, 80, false)
    const a = award(emptyMeta(), running, 7)
    expect(a.earned).toBe(0)
    expect(a.meta.points).toBe(0)

    const s = ended(90000, 70, 80)
    const first = award(emptyMeta(), s, 7)
    expect(first.earned).toBeGreaterThan(0)
    expect(first.duplicate).toBe(false)
    const again = award(first.meta, s, 7)
    expect(again.earned).toBe(0)
    expect(again.duplicate).toBe(true)
    expect(again.meta.points).toBe(first.meta.points)
  })
})

describe('天赋解锁', () => {
  it('点数不够解不开，够了才扣价进池，重复解锁不再扣', () => {
    const poor = { ...emptyMeta(), points: 0 }
    const no = unlock(poor, 'cash')
    expect(no.ok).toBe(false)
    expect(no.reason).toBe('points')
    expect(no.meta.points).toBe(0)
    expect(no.meta.unlocked).toEqual([])

    const rich = { ...emptyMeta(), points: 4 }
    const yes = unlock(rich, 'rep')
    expect(yes.ok).toBe(true)
    expect(yes.meta.points).toBe(4 - 3)
    expect(yes.meta.unlocked).toEqual(['rep'])
    expect(unlock(yes.meta, 'rep').reason).toBe('owned')
    expect(unlock(yes.meta, 'nope').reason).toBe('unknown')
  })

  it('未解锁不可选：带上去也只会静默退成不带', () => {
    const m = { ...emptyMeta(), points: 5 }
    expect(canCarry(m, 'cash')).toBe(false)
    expect(carryTalent(m, 'cash').currentTalent).toBe(null)
    const owned = unlock(m, 'cash').meta
    expect(canCarry(owned, 'cash')).toBe(true)
    expect(carryTalent(owned, 'cash').currentTalent).toBe('cash')
    expect(carryTalent(owned, null).currentTalent).toBe(null)
  })

  it('选天赋的卡只认池子里的六样，价格与解锁状态从 meta 推', () => {
    const rows = talentRows({ ...emptyMeta(), points: 4, unlocked: ['cash'] })
    expect(rows.length).toBe(6)
    expect(rows.filter(function (r) { return r.unlocked }).map(function (r) { return r.id })).toEqual(['cash'])
    // 4 点只够得着 4 点及以下的：5 点的「第一桶金」这时候还买不起
    expect(rows.filter(function (r) { return !r.affordable }).map(function (r) { return r.id })).toEqual(['cash'])
  })
})
