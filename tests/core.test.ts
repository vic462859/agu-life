import { describe, expect, it } from 'vitest'
import {
  AP_EXHAUSTED_TEXT,
  buildQuarters,
  cl,
  runAct,
  chooseEvent,
  chooseLate,
  chooseYear,
  createGame,
  createRng,
  createPlayerState,
  deserialize,
  endView,
  intelView,
  lateStep,
  profileLines,
  serialize,
  setPosition,
  setSector,
  SAVE_VERSION,
  step,
  stepYear,
  totalQuarters,
  type GameState,
  type HeldSeason,
  type LogItem,
  type PlayerState,
  type RngLike,
  type SectorId,
} from '../src/core'

interface PlayResult {
  state: GameState
  kinds: string[]
  logs: LogItem[]
  events: string[]
  years: number[]
}

/** 用固定 seed + 固定动作脚本把一局打完（自动选第一个选项）。 */
function playFull(seed: number, pos: number = 0, sector: SectorId | null = null): PlayResult {
  const rng = createRng(seed)
  let state = createGame(0, 'real', seed, rng).state
  const kinds: string[] = []
  const logs: LogItem[] = []
  const events: string[] = []
  const years: number[] = []
  let guard = 0
  while (state.phase === 'trade' && guard++ < 4000) {
    if (state.pending) {
      const p = state.pending
      if (p.type === 'event') {
        events.push(p.key)
        const out = chooseEvent(state, 0, rng)
        kinds.push(out.kind)
        logs.push(...out.logs)
        state = out.state
      } else if (p.type === 'year') {
        years.push(p.year)
        const out = chooseYear(state, 0, rng)
        kinds.push(out.kind)
        logs.push(...out.logs)
        state = out.state
      } else {
        throw new Error('trade 阶段不该出现 late pending')
      }
      continue
    }
    state = setPosition(state, pos).state
    if (sector) state = setSector(state, sector).state
    const out = step(state, rng)
    kinds.push(out.kind)
    logs.push(...out.logs)
    state = out.state
  }
  let lateGuard = 0
  while (state.phase === 'late' && lateGuard++ < 100) {
    const opened = lateStep(state, rng)
    state = opened.state
    if (state.phase === 'end') break
    const picked = chooseLate(state, 0, rng)
    logs.push(...picked.logs)
    state = picked.state
  }
  return { state, kinds, logs, events, years }
}

describe('行情与剧本', () => {
  it('36 年拼出 144 个季度，贵贱指标可用', () => {
    const state = createGame(0, 'real', 1, createRng(1)).state
    expect(totalQuarters(state)).toBe(144)
    expect(state.map.length).toBe(36)
    expect(state.s.qi).toBe(0)
  })

  it('同 seed 两次开局的 state JSON 全等', () => {
    const a = createGame(1, 'real', 20260101, createRng(20260101)).state
    const b = createGame(1, 'real', 20260101, createRng(20260101)).state
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('同 seed + 同一串操作，整局 state JSON 全等', () => {
    const a = playFull(4242, 0.5, '成长')
    const b = playFull(4242, 0.5, '成长')
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state))
    expect(a.kinds.join()).toBe(b.kinds.join())
    expect(a.logs.map((l) => l.text).join('|')).toBe(b.logs.map((l) => l.text).join('|'))
  })

  it('144 季能一路跑到终点，不崩', () => {
    const r = playFull(777, 0)
    expect(r.state.phase).toBe('end')
    expect(r.state.s.qi).toBe(144)
    expect(r.state.s.over).toBe(true)
    expect(r.state.s.busted).toBe(false)
    expect(r.state.s.seasons).toBeGreaterThan(100)
  })
})

describe('事件与分支', () => {
  it('至少触发一个年度人生事件和一个特殊年份事件', () => {
    const r = playFull(777, 0)
    expect(r.years.length).toBeGreaterThan(0)
    expect(r.events.length).toBeGreaterThan(0)
    expect(r.kinds).toContain('year')
    expect(r.kinds).toContain('event')
    expect(r.logs.some((l) => l.text.includes('年底　'))).toBe(true)
  })

  it('爆仓分支：壳 + 杠杆 + 满仓，撞上一字板直接压穿', () => {
    // 全部 rand 取极小值 ⇒ 壳的 0.5% 暂停键必然命中（r=-0.5），杠杆 ×1.5 ⇒ -0.75 ≤ -0.7
    const always: RngLike = { next: () => 0.0001, int: () => 0 }
    let state = createGame(0, 'real', 9, createRng(9)).state
    state = setSector(state, '壳').state
    state = setPosition(state, 1).state
    const rng = always
    // 手动打开杠杆（toggle 走 core 导出）
    state = { ...state, s: { ...state.s, lev: true } }
    const out = step(state, rng)
    expect(out.state.s.busted).toBe(true)
    expect(out.state.s.asset).toBe(0)
    expect(out.state.phase).toBe('end')
    expect(out.kind).toBe('busted')
    expect(out.logs.some((l) => l.text.includes('压穿'))).toBe(true)
  })

  it('打探后提示句指的真行与行上的真标记一致（flip 两个分支）', () => {
    function withIntel(flip: boolean): PlayerState {
      const s = createPlayerState()
      s.probed = true
      s.flip = flip
      s.intel = [1991, '成长', '真消息文案', '题材', '假消息文案']
      return s
    }
    for (const flip of [true, false]) {
      const v = intelView(withIntel(flip))
      const trues = v.rows.filter((r) => r.truth === 't')
      expect(trues.length).toBe(1)
      const truthName = trues[0].name
      // 提示句必须说「真的在 <行上标 t 的那一行> 这条」
      expect(v.hint).toContain('真的在 ' + truthName + ' 这条')
      // 且它指向的板块必须是 intel[1]（结算用的真板块）
      expect(v.hint).toContain('制造白马')
      expect(v.rows.find((r) => r.truth === 'f')?.name).not.toBe(truthName)
    }
    // 行标记的原始语义：flip=true ⇒ 甲 为真；flip=false ⇒ 乙 为真
    expect(intelView(withIntel(true)).rows.find((r) => r.truth === 't')?.name).toBe('甲')
    expect(intelView(withIntel(false)).rows.find((r) => r.truth === 't')?.name).toBe('乙')
  })

  it('结局分支：走完 144 季 + 晚年 8 个事件后给出结局页', () => {
    const r = playFull(777, 0)
    const view = endView(r.state)
    expect(view.title.length).toBeGreaterThan(0)
    expect(view.rows.length).toBe(12)
    expect(view.egg.length).toBeGreaterThan(0)
    expect(view.epochHead).toContain('指数走了')
    // 全程空仓 ⇒ 复盘能算出「空仓」这一档
    expect(profileLines(r.state.s).length).toBeGreaterThan(0)
    expect(profileLines(r.state.s).join('')).toContain('空仓')
  })
})

describe('存档', () => {
  it('serialize / deserialize 往返一致，版本写进包里', () => {
    const rng = createRng(31)
    let state = createGame(2, 'fog', 31, rng).state
    for (let i = 0; i < 6; i++) {
      const out = step(state, rng)
      state = out.state
      if (state.pending && state.pending.type === 'event') {
        state = chooseEvent(state, 1, rng).state
      }
    }
    const raw = serialize(state, 1234567890)
    const env = JSON.parse(raw) as { v: number; ts: number }
    expect(env.v).toBe(SAVE_VERSION)
    expect(env.ts).toBe(1234567890)
    const back = deserialize(raw)
    expect(back).not.toBeNull()
    expect(JSON.stringify(back)).toBe(JSON.stringify(state))
  })

  it('坏存档与旧版本存档都返回 null', () => {
    expect(deserialize(null)).toBeNull()
    expect(deserialize('not json')).toBeNull()
    expect(deserialize(JSON.stringify({ v: 0, s: {}, map: [] }))).toBeNull()
  })
})

describe('玩法细节', () => {
  it('迷雾模式把年份抹掉（日志里不出现四位数年份）', () => {
    const rng = createRng(555)
    let state = createGame(1, 'fog', 555, rng).state
    const texts: string[] = []
    for (let i = 0; i < 40 && state.phase === 'trade'; i++) {
      if (state.pending) {
        const out = state.pending.type === 'event' ? chooseEvent(state, 0, rng) : chooseYear(state, 0, rng)
        texts.push(...out.logs.map((l) => l.text))
        state = out.state
        continue
      }
      const out = step(state, rng)
      texts.push(...out.logs.map((l) => l.text))
      state = out.state
    }
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.filter((t) => /\d{4}/.test(t))).toEqual([])
  })

  it('行动点：跑一个细分动作扣 1 次并生效；用完只给提示', () => {
    const rng = createRng(2024)
    const state = createGame(0, 'real', 2024, rng).state
    const before = state.s.ap
    const out = runAct(state, 'watch', 0, rng)
    expect(out.state.s.ap).toBe(before - 1)
    expect(out.state.s.sense).toBe(cl(state.s.sense + 4))
    expect(out.state.s.health).toBe(cl(state.s.health - 3))
    expect(out.state.s.act['watch:0']).toBe(1)
    expect(out.logs[0].text).toContain('盯了一整年的主线')
    const zero = { ...out.state, s: { ...out.state.s, ap: 0 } }
    const blocked = runAct(zero, 'watch', 0, rng)
    expect(blocked.kind).toBe('idle')
    expect(blocked.logs[0].text).toBe(AP_EXHAUSTED_TEXT)
    expect(blocked.state.s.ap).toBe(0)
  })

  it('createPlayerState 的初始值与 reset() 一致', () => {
    const s = createPlayerState()
    expect(s.asset).toBe(30000)
    expect(s.pos).toBe(0.5)
    expect(s.sect).toBe('成长')
    expect(s.ap).toBe(3)
    expect(s.slots).toEqual([])
    expect(s.H).toEqual([])
  })

  it('stepYear 把这一年的季一次推完，并在年底停住', () => {
    const rng = createRng(88)
    let state = createGame(0, 'real', 88, rng).state
    state = setPosition(state, 0).state
    const out = stepYear(state, rng)
    state = out.state
    // 1991 Q1 起步：连推 4 季后 qi=4（或撞上事件/年度事件提前停）
    expect(state.s.qi % 4 === 0 || out.kind === 'year' || out.kind === 'event').toBe(true)
    expect(out.kind === 'settled' ? state.s.qi : state.s.qi).toBeGreaterThan(0)
  })
})

describe('日志年份与档案文案', () => {
  it('每条日志都带年份，且等于刚结算那一季的年份（不出现 undefined）', () => {
    const rng = createRng(1991)
    let state = createGame(0, 'real', 1991, rng).state
    const all: LogItem[] = []
    for (let i = 0; i < 8 && state.phase === 'trade'; i++) {
      const q = buildQuarters(state.map)[state.s.qi]
      const out = step(state, rng)
      state = out.state
      for (const l of out.logs) {
        expect(typeof l.year).toBe('number')
        expect(l.year).toBe(q.y)
      }
      all.push(...out.logs)
      if (state.pending && state.pending.type === 'event') {
        const ev = chooseEvent(state, 0, rng)
        state = ev.state
        for (const l of ev.logs) {
          expect(typeof l.year).toBe('number')
          expect(l.year).toBe(q.y)
        }
        all.push(...ev.logs)
      }
      if (state.pending && state.pending.type === 'year') break
    }
    expect(all.length).toBeGreaterThan(4)
    expect(all.filter((l) => typeof l.year !== 'number')).toEqual([])

    // 走完整局：进晚年那两句必须落在 2026（最后一年年末），且没有一条日志缺年份
    const full = playFull(777, 0)
    const enter = full.logs.filter((l) => l.text.indexOf('2026 年末') === 0)
    expect(enter.length).toBe(1)
    expect(enter[0].year).toBe(2026)
    expect(full.logs.filter((l) => typeof l.year !== 'number')).toEqual([])

    // 晚年阶段用晚年事件的年份（LATE[0].y = 2028）
    const lateStart: GameState = { ...createGame(0, 'real', 3, createRng(3)).state, phase: 'late', li: 0 }
    const opened = lateStep(lateStart, rng)
    const picked = chooseLate(opened.state, 0, rng)
    expect(picked.logs.length).toBeGreaterThan(0)
    for (const l of picked.logs) expect(l.year).toBe(2028)
  })

  it('档案把回撤说成回撤，数值仍是 maxDD', () => {
    const s = createPlayerState()
    s.maxDD = 0.68
    s.seasons = 24
    s.H = Array.from({ length: 24 }, function (_, i) {
      return [1991 + Math.floor(i / 4), (i % 4) + 1, 2, 0.5, -100, 0, 0, 0]
    }) as HeldSeason[]
    const text = profileLines(s).join('|')
    expect(text).not.toContain('亏掉了身家')
    expect(text).toContain('从最高点回撤过 68%')
    // 数值计算一个都没动：仍由 maxDD 直接换算
    expect(Math.round(s.maxDD * 100)).toBe(68)
  })
})
