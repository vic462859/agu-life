import { describe, expect, it } from 'vitest'
import { createGame, createPlayerState, createRng } from '../src/core'
import { encodeChallenge } from '../src/core/challenge'
import { applyTalent, armTalent, armedTalent, TALENTS, talentById, talentName } from '../src/core/data/talents'

const ORGS = [0, 1, 2]
const MODES = ['real', 'fog', 'draw'] as const
const SEEDS = [1000, 1001, 1991]

function stateOf(org: number, mode: (typeof MODES)[number], seed: number, talent: string | null) {
  return createGame(org, mode, seed, createRng(seed), talent).state
}

describe('天赋池', () => {
  it('六样，id 唯一，各有名字/一句话/价格/效果函数', () => {
    expect(TALENTS.length).toBe(6)
    const ids = TALENTS.map(function (t) { return t.id })
    expect(new Set(ids).size).toBe(6)
    for (const t of TALENTS) {
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.desc.length).toBeGreaterThan(6)
      expect(t.price).toBeGreaterThan(0)
      expect(t.fields.length).toBeGreaterThan(0)
      expect(typeof t.apply).toBe('function')
    }
    expect(talentById('cash')).not.toBe(null)
    expect(talentById('nope')).toBe(null)
    expect(talentName('cash')).toBe('第一桶金')
    expect(talentName('nope')).toBe('')
  })

  it('同一 seed 带/不带：只有该天赋声称的字段不同，其余字段、剧本、传闻、消息全是同一份', () => {
    for (const t of TALENTS) {
      for (const org of ORGS) {
        for (const seed of SEEDS) {
          const base = stateOf(org, 'real', seed, null)
          const withT = stateOf(org, 'real', seed, t.id)
          // 天赋不许多调一次随机数：剧本/板块强弱/传闻/消息真假都必须逐字节相同
          expect(withT.map).toEqual(base.map)
          expect(withT.s.kty).toEqual(base.s.kty)
          expect(withT.s.lines).toEqual(base.s.lines)
          expect(withT.s.intel).toEqual(base.s.intel)
          expect(withT.s.flip).toBe(base.s.flip)
          expect(withT.s.seasons).toBe(base.s.seasons)
          const keys = Object.keys(base.s) as (keyof typeof base.s)[]
          for (const k of keys) {
            const same = JSON.stringify(base.s[k]) === JSON.stringify(withT.s[k])
            const claimed = (t.fields as (keyof typeof base.s)[]).indexOf(k) >= 0
            if (claimed && same) throw new Error(t.id + ' 说会改 ' + String(k) + '，但对 org' + org + '/seed' + seed + ' 实际没改')
            if (!claimed && !same) throw new Error(t.id + ' 改到了没声明的字段 ' + String(k) + '（org' + org + '/seed' + seed + '）')
          }
        }
      }
    }
  })

  it('不带天赋（null 与 undefined）与改动前的初始状态一致，确定性开局', () => {
    armTalent(null)
    const a = stateOf(0, 'real', 2024, null)
    const b = createGame(0, 'real', 2024, createRng(2024)).state
    expect(JSON.stringify(b.s)).toBe(JSON.stringify(a.s))
    const c = stateOf(0, 'real', 2024, null)
    expect(JSON.stringify(c)).toBe(JSON.stringify(a))
  })

  it('armTalent 交接位只影响没显式传参的那一局，用一次就清', () => {
    armTalent('cash')
    expect(armedTalent()).toBe('cash')
    const viaArm = createGame(0, 'real', 1000, createRng(1000)).state
    expect(viaArm.s.asset).toBe(Math.round(30000 * 1.15))
    // 显式传 null 时不吃交接位
    const explicit = stateOf(0, 'real', 1000, null)
    expect(explicit.s.asset).toBe(30000)
    armTalent(null)
    expect(armedTalent()).toBe(null)
  })

  it('认不出的 id 当没带；属性天赋一律夹在 0..100', () => {
    const s = createPlayerState()
    const before = JSON.stringify(s)
    applyTalent(s, 'nope')
    applyTalent(s, null)
    expect(JSON.stringify(s)).toBe(before)

    const full = createPlayerState()
    full.sense = 100
    full.net = 100
    full.rep = 100
    full.fam = 100
    applyTalent(full, 'sense')
    applyTalent(full, 'net')
    applyTalent(full, 'rep')
    applyTalent(full, 'fam')
    expect(full.sense).toBe(100)
    expect(full.net).toBe(100)
    expect(full.rep).toBe(100)
    expect(full.fam).toBe(100)
  })

  it('天赋不进挑战码：同一个 code 只能解出 (seed, 模式)，带不带天赋都解出同一对', () => {
    const seed = 4242
    const code = encodeChallenge(seed, 'real')
    for (const t of TALENTS) {
      const g = stateOf(0, 'real', seed, t.id)
      expect(g.seed).toBe(seed)
      expect(g.mode).toBe('real')
      expect(encodeChallenge(g.seed, g.mode)).toBe(code)
    }
  })
})
