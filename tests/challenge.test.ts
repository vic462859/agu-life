import { describe, expect, it } from 'vitest'
import {
  chooseEvent,
  chooseLate,
  chooseYear,
  createGame,
  createRng,
  endView,
  lateStep,
  step,
  type GameState,
} from '../src/core'
import {
  CHALLENGE_VERSION,
  clampSeed,
  decodeChallenge,
  encodeChallenge,
  isChallengeCode,
  randomSeed,
} from '../src/core/challenge'

const MODES = ['real', 'fog', 'draw'] as const

describe('挑战码编解码', () => {
  it('encode → decode 得回同一 seed + mode（含边界 seed）', () => {
    const seeds = [0, 1, 4242, 19911219, 2147483647, 1234567890]
    for (const seed of seeds) {
      for (const mode of MODES) {
        const code = encodeChallenge(seed, mode)
        expect(code).toMatch(/^AGU-[0-9A-Z]{7}$/)
        const back = decodeChallenge(code)
        expect(back.ok).toBe(true)
        if (!back.ok) continue
        expect(back.seed).toBe(seed)
        expect(back.mode).toBe(mode)
        expect(back.version).toBe(CHALLENGE_VERSION)
        // 再编一次还是同一串：码是唯一的
        expect(encodeChallenge(back.seed, back.mode)).toBe(code)
      }
    }
  })

  it('码字符表只允许 A-Z0-9，且不含 I L O U（抄写容易错的四个字母）', () => {
    for (let i = 0; i < 200; i++) {
      const code = encodeChallenge(randomSeed(), MODES[i % 3])
      expect(code).toMatch(/^AGU-[0-9A-HJKMNP-TV-Z]{7}$/)
      expect(code.slice(4)).not.toMatch(/[ILOU]/)
    }
  })

  it('大小写、空格、分隔符都能容忍；I/L/O 按 1/1/0 认', () => {
    const code = encodeChallenge(777, 'fog')
    const loose = ' ' + code.toLowerCase().replace('-', ' - ') + ' '
    const back = decodeChallenge(loose)
    expect(back.ok).toBe(true)
    if (back.ok) {
      expect(back.seed).toBe(777)
      expect(back.mode).toBe('fog')
    }
    // 手抄常见错误：把 0 写成 O、把 1 写成 l
    const ored = 'AGU-' + code.slice(4).replace(/0/g, 'O').replace(/1/g, 'l')
    const back2 = decodeChallenge(ored)
    expect(back2.ok).toBe(true)
    if (back2.ok) expect(back2.code).toBe(code)
  })

  it('非法输入四类都给可读错误、都不抛异常，并退回随机 seed', () => {
    const bad = [
      { label: '长度不对', input: 'AGU-7F3' },
      { label: '非法字符', input: 'AGU-7F3K2!X' },
      { label: '未知版本', input: 'AGU-0000000' },
      { label: '前缀不对', input: 'XYZ-1234567' },
      { label: '空串', input: '' },
      { label: '纯空白', input: '   ' },
      { label: '不是字符串', input: null as unknown as string },
      { label: '乱写的中文', input: '给我一个挑战码' },
    ]
    for (const item of bad) {
      let res: ReturnType<typeof decodeChallenge> | null = null
      expect(function () { res = decodeChallenge(item.input) }).not.toThrow()
      const r = res as unknown as ReturnType<typeof decodeChallenge>
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(typeof r.message).toBe('string')
      expect(r.message.length).toBeGreaterThan(6)
      expect(r.reason).toBeTruthy()
      // 退回的那组必须能直接开局
      expect(r.fallback.seed).toBeGreaterThanOrEqual(0)
      expect(r.fallback.seed).toBeLessThan(2147483648)
      expect(MODES.indexOf(r.fallback.mode)).toBeGreaterThanOrEqual(0)
    }
  })

  it('seed 规范化：负数、小数、超范围都不炸，且编出来的码能被认回', () => {
    expect(clampSeed(-5)).toBe(5)
    expect(clampSeed(3.9)).toBe(3)
    expect(clampSeed(2147483648)).toBe(0)
    expect(clampSeed(Number.NaN)).toBe(0)
    const back = decodeChallenge(encodeChallenge(-5, 'real'))
    expect(back.ok).toBe(true)
    if (back.ok) expect(back.seed).toBe(5)
  })

  it('isChallengeCode 只判形状，不判版本', () => {
    expect(isChallengeCode(encodeChallenge(1, 'real'))).toBe(true)
    expect(isChallengeCode(' agu-0000000 ')).toBe(true)
    expect(isChallengeCode('AGU-7F3')).toBe(false)
    expect(isChallengeCode('XYZ-1234567')).toBe(false)
    expect(isChallengeCode(42 as unknown as string)).toBe(false)
  })
})

/** 同一条挑战码 + 同一串操作 ⇒ 同一局（两遍都选第一个选项）。 */
function playByCode(input: string): GameState {
  const r = decodeChallenge(input)
  const seed = r.ok ? r.seed : r.fallback.seed
  const mode = r.ok ? r.mode : r.fallback.mode
  const rng = createRng(seed)
  let state = createGame(0, mode, seed, rng).state
  let guard = 0
  while (state.phase === 'trade' && guard++ < 4000) {
    if (state.pending) {
      const p = state.pending
      if (p.type === 'year') state = chooseYear(state, 0, rng).state
      else if (p.type === 'event') state = chooseEvent(state, 0, rng).state
      else throw new Error('trade 阶段不该出现 late pending')
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
  return state
}

describe('同挑战码复现同一局', () => {
  it('两局同挑战码 + 同操作序列 ⇒ 结局资产与整局 state 一致', () => {
    const code = encodeChallenge(31337, 'real')
    const a = playByCode(code)
    const b = playByCode(code)
    expect(a.phase).toBe('end')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(endView(a).assetText).toBe(endView(b).assetText)
    // 码确实是这一局的码
    expect(encodeChallenge(a.seed, a.mode)).toBe(code)
  })

  it('不同 seed 的同一模式走出的不是同一局', () => {
    const a = playByCode(encodeChallenge(31337, 'real'))
    const b = playByCode(encodeChallenge(31338, 'real'))
    expect(endView(a).assetText).not.toBe(endView(b).assetText)
  })
})
