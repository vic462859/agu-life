/**
 * 天赋池：跨局攒记忆点解锁，每局最多带一个（也可以不带）。
 *
 * 硬约束：每个效果都必须是「对 begin() 初始状态的确定性改写」——
 * 同一 seed、同一出身，带与不带只差 fields 里列的那几个字段，一次随机数都不多调。
 * 谁想加「每年多一次行动点」「第一次打探免费」这类效果，得先动 engine/step.ts
 * 与 engine/actions.ts（天赋目前拿不到那两个钩子），别在这里假装做到了。
 */
import type { PlayerState } from '../types'

export interface Talent {
  id: string
  name: string
  /** 一句话，玩家在选天赋的卡上看到的就是这句。 */
  desc: string
  /** 解锁价（记忆点）。 */
  price: number
  /** 这个天赋声称会动的字段。测试拿它逐字段比对，别的字段一律不许变。 */
  fields: (keyof PlayerState)[]
  apply: (s: PlayerState) => void
}

function cl100(v: number): number {
  return Math.max(0, Math.min(100, v))
}

export const TALENTS: Talent[] = [
  {
    id: 'cash',
    name: '第一桶金',
    desc: '起手本金 +15%。本金和目标一起涨，倍数口径不变。',
    price: 5,
    fields: ['asset', 'start', 'peak'],
    apply: function (s) {
      const a = Math.round(s.start * 1.15)
      s.start = a
      s.asset = a
      s.peak = a
    },
  },
  {
    id: 'sense',
    name: '老手感',
    desc: '初始盘感 +8。消息里的「你隐约觉得」更靠得住。',
    price: 4,
    fields: ['sense'],
    apply: function (s) {
      s.sense = cl100(s.sense + 8)
    },
  },
  {
    id: 'net',
    name: '熟人一条街',
    desc: '初始人脉 +10。请经理喝酒更容易把底牌问出来。',
    price: 4,
    fields: ['net'],
    apply: function (s) {
      s.net = cl100(s.net + 10)
    },
  },
  {
    id: 'rep',
    name: '营业部的脸',
    desc: '初始声望 +10。去上市公司调研（需 30）能提早几年进得去。',
    price: 3,
    fields: ['rep'],
    apply: function (s) {
      s.rep = cl100(s.rep + 10)
    },
  },
  {
    id: 'fam',
    name: '家里的灯',
    desc: '初始家 +12。少一次「她把房子过户到自己名下」。',
    price: 3,
    fields: ['fam'],
    apply: function (s) {
      s.fam = cl100(s.fam + 12)
    },
  },
  {
    id: 'fa',
    name: '看财报的手艺',
    desc: '开局就会看财报：成长股暴雷的概率减半（等于省下一次「学财报」的行动点）。',
    price: 3,
    fields: ['fa'],
    apply: function (s) {
      s.fa = true
    },
  },
]

export function talentById(id: string | null | undefined): Talent | null {
  if (!id) return null
  for (let i = 0; i < TALENTS.length; i++) if (TALENTS[i].id === id) return TALENTS[i]
  return null
}

export function talentName(id: string | null | undefined): string {
  const t = talentById(id)
  return t ? t.name : ''
}

/** 把天赋写进初始状态。认不出的 id 一律当没带（不抛）。 */
export function applyTalent(s: PlayerState, id: string | null | undefined): PlayerState {
  const t = talentById(id)
  if (t) t.apply(s)
  return s
}

/**
 * 「本局要带哪个天赋」的交接位。
 *
 * 为什么需要它：UI 唯一的内核入口是 composables/useGame.begin()，而它这一轮不在
 * 可写范围里，begin() 也只按老签名调 createGame。所以页面在 begin() 之前把天赋
 * arm 在这里，createGame 在没显式给第五个参数时读它。测试与平衡脚本永远显式传，
 * 不依赖这个位；每次 begin 之后页面立刻清掉，不留脏状态。
 */
let armed: string | null = null

export function armTalent(id: string | null | undefined): void {
  armed = id || null
}

export function armedTalent(): string | null {
  return armed
}
