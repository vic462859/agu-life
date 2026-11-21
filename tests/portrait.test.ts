import { describe, expect, it } from 'vitest'
import { createPlayerState } from '../src/core'
import type { PlayerState } from '../src/core'
import {
  drawBust,
  drawPortrait,
  LOGICAL_H,
  LOGICAL_W,
  moodOf,
  portraitFromEndView,
  portraitFromState,
  portraitFromTradeView,
  portraitOfParts,
  portraitTraits,
  spriteName,
  wealthOf,
  type PortraitCtx,
  type PortraitSpec,
} from '../src/ui/share/portrait'

/** 允许出现的 ctx 成员：多一个就说明这层开始偷偷依赖平台 API 了。 */
const ALLOWED = new Set([
  'save',
  'restore',
  'beginPath',
  'moveTo',
  'lineTo',
  'arc',
  'fill',
  'fillRect',
  'set:fillStyle',
  'set:globalAlpha',
])

interface Recorder {
  ctx: PortraitCtx
  cmds: string[]
  used: Set<string>
  /** 可变计数：闭包里累加，断言读 r.fills.n */
  fills: { n: number }
}

/** 记录型 ctx：做确定性比对、白名单探针与非有限数探针。 */
function recorder(): Recorder {
  const cmds: string[] = []
  const used = new Set<string>()
  const props: Record<string, unknown> = {}
  const fills = { n: 0 }
  const ctx = {} as unknown as Record<string, unknown>
  const simple = ['save', 'restore', 'beginPath', 'fill']
  for (const m of simple) {
    ctx[m] = function () {
      used.add(m)
      cmds.push(m)
    }
  }
  ctx.fillRect = function () {
    used.add('fillRect')
    const args: number[] = []
    for (let i = 0; i < arguments.length; i++) {
      const v = Number(arguments[i])
      if (!Number.isFinite(v)) throw new Error('fillRect 收到非有限数')
      args.push(v)
    }
    fills.n++
    cmds.push('fillRect(' + args.join(',') + ')')
  }
  ctx.moveTo = function () {
    used.add('moveTo')
    cmds.push('moveTo')
  }
  ctx.lineTo = function () {
    used.add('lineTo')
    cmds.push('lineTo')
  }
  ctx.arc = function () {
    used.add('arc')
    cmds.push('arc')
  }
  for (const p of ['fillStyle', 'globalAlpha']) {
    Object.defineProperty(ctx, p, {
      get: function () {
        return props[p]
      },
      set: function (v) {
        used.add('set:' + p)
        props[p] = v
        cmds.push('set:' + p + '=' + String(v))
      },
    })
  }
  return { ctx: ctx as unknown as PortraitCtx, cmds, used, fills }
}

function paint(spec: PortraitSpec, w = 320, h = 420): Recorder {
  const r = recorder()
  drawPortrait(r.ctx, spec, 0, 0, w, h)
  return r
}

const BASE: PortraitSpec = { age: 40, wealth: 0, health: 90, family: 55, record: 0, mood: 'calm' }

describe('portrait · 状态映射', () => {
  it('爆仓 → bust，且优先于其它情绪', () => {
    expect(moodOf({ busted: true, health: 90, streak: 5, maxDD: 0 })).toBe('bust')
    const s = createPlayerState()
    s.busted = true
    s.health = 100
    s.streak = 6
    expect(portraitFromState(s).mood).toBe('bust')
  })

  it('健康 < 20 → sick；连亏/大回撤 → down；连盈 → up；否则 calm', () => {
    expect(moodOf({ health: 12 })).toBe('sick')
    expect(moodOf({ health: 90, streak: -3 })).toBe('down')
    expect(moodOf({ health: 90, maxDD: 0.4 })).toBe('down')
    expect(moodOf({ health: 90, streak: 3 })).toBe('up')
    expect(moodOf({ health: 90, streak: 1 })).toBe('calm')
  })

  it('family < 30 就没有小人，30..59 一个，>= 60 两个（最多 2 个）', () => {
    expect(portraitTraits({ ...BASE, family: 0 }).companions).toBe(0)
    expect(portraitTraits({ ...BASE, family: 29 }).companions).toBe(0)
    expect(portraitTraits({ ...BASE, family: 30 }).companions).toBe(1)
    expect(portraitTraits({ ...BASE, family: 59 }).companions).toBe(1)
    expect(portraitTraits({ ...BASE, family: 60 }).companions).toBe(2)
    expect(portraitTraits({ ...BASE, family: 100 }).companions).toBe(2)
  })

  it('wealth 按「翻了几倍」分档：<1 / <5 / <20 / <50 / 其余', () => {
    expect(wealthOf(10000, 30000)).toBe(0)
    expect(wealthOf(50000, 30000)).toBe(1)
    expect(wealthOf(210000, 30000)).toBe(2)
    expect(wealthOf(750000, 30000)).toBe(3)
    expect(wealthOf(1800000, 30000)).toBe(4)
    expect(wealthOf(100, 0)).toBe(0)
    expect(wealthOf(NaN, 30000)).toBe(0)
  })

  it('portraitFromState 读的是真实局面字段（flag → record，fam → family）', () => {
    const s: PlayerState = createPlayerState()
    s.asset = 900000
    s.start = 30000
    s.health = 15
    s.fam = 20
    s.flag = 40
    s.qi = 60
    const p = portraitFromState(s)
    expect(p.wealth).toBe(3)
    expect(p.health).toBe(15)
    expect(p.family).toBe(20)
    expect(p.record).toBe(40)
    expect(p.mood).toBe('sick')
    expect(p.age).toBe(25 + 15)
  })
})

describe('portrait · 精灵选择与配件', () => {
  it('五种姿态各选对一套精灵：工装 / 塌 / 西装 / 老人 / 坐', () => {
    expect(spriteName({ ...BASE, age: 20, wealth: 0, mood: 'calm' })).toBe('stand')
    expect(spriteName({ ...BASE, age: 45, wealth: 1, mood: 'bust' })).toBe('slump')
    expect(spriteName({ ...BASE, age: 45, wealth: 1, mood: 'down' })).toBe('slump')
    expect(spriteName({ ...BASE, age: 55, wealth: 3, mood: 'calm' })).toBe('suit')
    expect(spriteName({ ...BASE, age: 85, wealth: 2, mood: 'calm' })).toBe('old')
    expect(spriteName({ ...BASE, age: 80, wealth: 4, mood: 'sick' })).toBe('sit')
  })

  it('配件跟着状态走：手杖 70+、包 wealth>=2、酒 up、报纸 wealth<=1 且 <40', () => {
    expect(portraitTraits({ ...BASE, age: 69 }).cane).toBe(false)
    expect(portraitTraits({ ...BASE, age: 70 }).cane).toBe(true)
    expect(portraitTraits({ ...BASE, wealth: 1 }).briefcase).toBe(false)
    expect(portraitTraits({ ...BASE, wealth: 2 }).briefcase).toBe(true)
    expect(portraitTraits({ ...BASE, mood: 'up' }).glass).toBe(true)
    expect(portraitTraits({ ...BASE, mood: 'calm' }).glass).toBe(false)
    expect(portraitTraits({ ...BASE, age: 39, wealth: 1 }).paper).toBe(true)
    expect(portraitTraits({ ...BASE, age: 40, wealth: 1 }).paper).toBe(false)
    expect(portraitTraits({ ...BASE, age: 30, wealth: 2 }).paper).toBe(false)
  })

  it('案底高会整体压暗一档（不是叠斜纹）', () => {
    const clean = paint({ ...BASE, record: 0 })
    const dirty = paint({ ...BASE, record: 80 })
    const tones = function (r: Recorder): string[] {
      return r.cmds.filter(function (c) {
        return c.indexOf('set:fillStyle=') === 0
      })
    }
    expect(tones(clean).length).toBeGreaterThan(10)
    expect(tones(clean)).not.toEqual(tones(dirty))
  })
})

describe('portrait · 绘制确定性与调用量', () => {
  it('同一 spec 两次绘制，指令序列逐条一致', () => {
    const a = paint(BASE)
    const b = paint(BASE)
    expect(a.cmds.length).toBeGreaterThan(80)
    expect(a.cmds).toEqual(b.cmds)
  })

  it('每帧填充调用 ≤ 400 次（同色横条已经合并）', () => {
    const specs: PortraitSpec[] = [
      BASE,
      { age: 85, wealth: 4, health: 30, family: 90, record: 70, mood: 'sick' },
      { age: 47, wealth: 1, health: 10, family: 0, record: 0, mood: 'bust' },
    ]
    for (const s of specs) {
      const r = paint(s, 360, 460)
      expect(r.fills.n).toBeGreaterThan(20)
      expect(r.fills.n).toBeLessThanOrEqual(400)
    }
  })

  it('只用白名单成员；坐标全是有限数且不出画框 10%', () => {
    const r = paint({ age: 85, wealth: 4, health: 0, family: 100, record: 100, mood: 'sick' }, 320, 420)
    for (const m of r.used) expect(ALLOWED.has(m)).toBe(true)
    for (let i = 0; i < r.cmds.length; i++) {
      const m = /^fillRect\(([^)]*)\)$/.exec(r.cmds[i])
      if (!m) continue
      const a = m[1].split(',').map(Number)
      expect(a[0]).toBeGreaterThan(-32)
      expect(a[1]).toBeGreaterThan(-42)
      expect(a[0] + a[2]).toBeLessThan(352)
      expect(a[1] + a[3]).toBeLessThan(462)
    }
  })

  it('尺寸只改缩放：320 与 640 两个画框的指令条数相同', () => {
    const small = paint(BASE, 240, 320)
    const big = paint(BASE, 480, 640)
    expect(small.cmds.length).toBe(big.cmds.length)
  })

  it('画框小于一个逻辑像素时退化为轮廓剪影：不报错、调用更少、仍有内容', () => {
    const big = paint(BASE, 360, 480)
    const tiny = paint(BASE, 38, 48)
    expect(tiny.fills.n).toBeGreaterThan(8)
    expect(tiny.fills.n).toBeLessThan(big.fills.n)
    for (const m of tiny.used) expect(ALLOWED.has(m)).toBe(true)
  })
})

describe('portrait · 胸像', () => {
  it('五种情绪各画出一张不同的脸（指令序列两两不同）', () => {
    const moods: Array<'calm' | 'up' | 'down' | 'bust' | 'sick'> = ['calm', 'up', 'down', 'bust', 'sick']
    const seqs: string[][] = []
    for (const m of moods) {
      const r = recorder()
      drawBust(r.ctx, { ...BASE, mood: m }, 0, 0, 200, 250)
      seqs.push(r.cmds)
    }
    for (let i = 0; i < seqs.length; i++) {
      expect(seqs[i].length).toBeGreaterThan(40)
      for (let j = i + 1; j < seqs.length; j++) expect(seqs[i]).not.toEqual(seqs[j])
    }
  })

  it('同一 spec 两次绘制逐条一致，且 ≤400 次填充', () => {
    const a = recorder()
    const b = recorder()
    drawBust(a.ctx, { age: 85, wealth: 4, health: 30, family: 90, record: 40, mood: 'sick' }, 0, 0, 320, 400)
    drawBust(b.ctx, { age: 85, wealth: 4, health: 30, family: 90, record: 40, mood: 'sick' }, 0, 0, 320, 400)
    expect(a.cmds).toEqual(b.cmds)
    expect(a.fills.n).toBeGreaterThan(40)
    expect(a.fills.n).toBeLessThanOrEqual(400)
  })

  it('只用白名单成员；32px 高时退化但不报错', () => {
    const big = recorder()
    drawBust(big.ctx, BASE, 0, 0, 320, 400)
    for (const m of big.used) expect(ALLOWED.has(m)).toBe(true)
    const tiny = recorder()
    drawBust(tiny.ctx, BASE, 0, 0, 26, 32)
    expect(tiny.fills.n).toBeGreaterThan(6)
    // 轮廓档是"逐边界像素"，次数可能多于合并后的完整档，但同样必须 ≤400
    expect(tiny.fills.n).toBeLessThanOrEqual(400)
    expect(tiny.cmds).not.toEqual(big.cmds)
    for (const m of tiny.used) expect(ALLOWED.has(m)).toBe(true)
  })

  it('年龄/财富/案底都进到画里（老人 = 白发 + 皱纹，西装 = 领带）', () => {
    const keys = function (spec: PortraitSpec): string[] {
      const r = recorder()
      drawBust(r.ctx, spec, 0, 0, 320, 400)
      return r.cmds
    }
    const young = keys({ ...BASE, age: 20, wealth: 0, record: 0 })
    const old = keys({ ...BASE, age: 85, wealth: 0, record: 0 })
    const suit = keys({ ...BASE, age: 55, wealth: 4, record: 0 })
    const dirty = keys({ ...BASE, age: 55, wealth: 0, record: 60 })
    expect(young).not.toEqual(old)
    expect(young).not.toEqual(suit)
    expect(young).not.toEqual(dirty)
  })
})

describe('portrait · 边界值', () => {
  it('age 18/85、health 0/100 全都能画，没有非有限数', () => {
    const cases: PortraitSpec[] = [
      { ...BASE, age: 18, health: 0 },
      { ...BASE, age: 85, health: 100 },
      { age: 18, wealth: 0, health: 0, family: 0, record: 0, mood: 'bust' },
      { age: 85, wealth: 4, health: 0, family: 100, record: 100, mood: 'sick' },
    ]
    for (const c of cases) {
      const r = recorder()
      expect(function () {
        drawPortrait(r.ctx, c, 0, 0, 320, 420)
      }).not.toThrow()
      expect(r.fills.n).toBeGreaterThan(20)
    }
  })

  it('非法/越界的输入被夹住', () => {
    const wild = { age: 999, wealth: 9, health: -50, family: 500, record: 999, mood: '???' } as unknown as PortraitSpec
    const r = recorder()
    expect(function () {
      drawPortrait(r.ctx, wild, 0, 0, 200, 260)
    }).not.toThrow()
    const t = portraitTraits(wild)
    expect(t.companions).toBe(2)
    expect(t.cane).toBe(true)
  })

  it('逻辑画布是 48×64（顶栏 48px 时正好落进轮廓档）', () => {
    expect(LOGICAL_W).toBe(48)
    expect(LOGICAL_H).toBe(64)
    expect(Math.floor(48 / LOGICAL_H)).toBe(0)
  })
})

describe('portrait · 两处 UI 适配器', () => {
  it('TradeView 的两条进度条 / 案底 chip / 连盈都进到脸上', () => {
    const view = {
      age: 34,
      asset: 240000,
      bars: [
        { key: 'fam', label: '家', value: 40 },
        { key: 'health', label: '身体', value: 88 },
      ],
      attrs: [{ label: '案底', value: 12, danger: true }],
      streak: { text: '连盈 4 季', tone: 'win' },
    } as unknown as Parameters<typeof portraitFromTradeView>[0]
    const p = portraitFromTradeView(view)
    expect(p.age).toBe(34)
    expect(p.health).toBe(88)
    expect(p.family).toBe(40)
    expect(p.record).toBe(12)
    expect(p.wealth).toBe(2)
    expect(p.mood).toBe('up')
  })

  it('连亏时 mood 掉到 down', () => {
    const view = {
      age: 50,
      asset: 30000,
      bars: [{ key: 'health', label: '身体', value: 66 }],
      attrs: [],
      streak: { text: '连亏 3 季', tone: 'lose' },
    } as unknown as Parameters<typeof portraitFromTradeView>[0]
    expect(portraitFromTradeView(view).mood).toBe('down')
  })

  it('EndView 还原一个人：倍数 → 财富档，家/身体/案底照抄，年龄固定 85', () => {
    const end = {
      title: '温饱',
      note: '',
      willNote: '',
      assetText: '¥61,278',
      rows: [
        { label: '倍数', value: '2.0×' },
        { label: '最大回撤', value: '71%' },
        { label: '案底', value: '32' },
        { label: '家', value: '60' },
        { label: '身体', value: '72' },
      ],
      profile: [],
      egg: '',
      epochHead: '',
      epochTail: '',
    }
    const p = portraitFromEndView(end)
    expect(p.age).toBe(85)
    expect(p.wealth).toBe(1)
    expect(p.family).toBe(60)
    expect(p.health).toBe(72)
    expect(p.record).toBe(32)
    expect(p.mood).toBe('down')
    expect(portraitFromEndView({ ...end, title: '爆仓' }).mood).toBe('bust')
  })

  it('portraitOfParts 缺 start 时按兜底本金分档', () => {
    expect(portraitOfParts({ age: 30, asset: 90000, health: 80, family: 40 }).wealth).toBe(1) // 3×
    expect(portraitOfParts({ age: 30, asset: 300000, health: 80, family: 40 }).wealth).toBe(2) // 10×
  })
})