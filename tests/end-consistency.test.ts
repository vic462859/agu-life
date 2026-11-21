import { describe, expect, it } from 'vitest'
import {
  chooseEvent,
  chooseLate,
  chooseYear,
  createGame,
  createRng,
  endView,
  indexMultiple,
  indexMultipleText,
  indexSpan,
  lateStep,
  step,
  type GameState,
  type Mode,
} from '../src/core'
import { M } from '../src/core/data/market'

function play(seed: number, mode: Mode = 'real'): GameState {
  const rng = createRng(seed)
  let state = createGame(0, mode, seed, rng).state
  let guard = 0
  while (state.phase === 'trade' && guard++ < 4000) {
    if (state.pending) {
      const p = state.pending
      if (p.type === 'year') state = chooseYear(state, 0, rng).state
      else if (p.type === 'event') state = chooseEvent(state, 0, rng).state
      else break
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

describe('指数倍数只有一个口径', () => {
  it('indexSpan 就是 M 的真实首尾（1990-12 与 2026-11），不是年线抽样', () => {
    const span = indexSpan()
    expect(span.from).toBe(M[0])
    expect(span.to).toBe(M[M.length - 1])
    expect(span.mult).toBeCloseTo(M[M.length - 1] / M[0], 10)
    expect(indexMultiple()).toBeCloseTo(27.69, 2)
    expect(indexMultipleText()).toBe('27.7×')
  })

  it('正文 epochHead 里的点数和倍数与 indexSpan 一致（同一屏只有一个数）', () => {
    const g = play(31337)
    expect(g.phase).toBe('end')
    const head = endView(g).epochHead
    const span = indexSpan()
    expect(head).toContain('上证 ' + span.from.toFixed(1) + ' 点')
    expect(head).toContain(span.to.toFixed(1) + ' 点')
    const m = /指数走了 ([\d.]+) 倍/.exec(head)
    expect(m).not.toBeNull()
    expect(Number((m as RegExpExecArray)[1]).toFixed(1)).toBe(indexMultiple().toFixed(1))
    // 挑战码卡上的「指数 27.7×」与正文的「27.7 倍」是同一个数
    expect(indexMultipleText().replace('×', '')).toBe((m as RegExpExecArray)[1])
  })

  it('换模式也不改指数口径（指数是史料，不是这一局的剧本）', () => {
    const a = play(31337, 'real')
    const b = play(4242, 'draw')
    expect(endView(a).epochHead).toContain('指数走了 ' + indexMultiple().toFixed(1) + ' 倍')
    expect(endView(b).epochHead).toContain('指数走了 ' + indexMultiple().toFixed(1) + ' 倍')
    expect(indexMultipleText()).toBe('27.7×')
  })

  it('复盘里的比较阈值与同一个倍数走（跑赢/跑输都以它为界）', () => {
    const g = play(31337)
    const x = g.s.asset / g.s.start
    const tail = endView(g).epochTail
    if (x > indexMultiple()) expect(tail).toContain('你跑赢了指数')
    else if (x >= 10) expect(tail).toContain('你跑输了指数')
    else if (x >= 1) expect(tail).toContain('你输了指数一大截')
    else expect(tail).toContain('指数涨了 ' + Math.floor(indexMultiple()) + ' 倍')
  })
})
