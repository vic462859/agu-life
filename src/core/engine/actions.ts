/** 行动点花在哪：七扇门下面 30 个细分动作。原来是直接改全局 + 写 DOM，现在是「进来一个 ctx，改里面的草稿」。 */
import type { GameState, RngLike, StepOutcome } from '../types'
import { AP_EXHAUSTED_TEXT } from '../data/actions'
import { createRng } from '../rng'
import { cloneState, Ctx, fxk, log, makeCtx, toOutcome } from './ctx'
import { finish } from './settle'
import { cl, fmt } from './state'

/** 一个细分行动。need = 声望门槛。 */
export interface ActionDef {
  t: string
  d: string
  need?: number
  run: (c: Ctx) => void
}

/** 门 id → 细分动作。文案与数值原样搬运。 */
export const SUBS: Record<string, ActionDef[]> = {
  probe: [
    {
      t: '摸清底牌',
      d: '花 1 次，知道甲和乙哪条是真的',
      run: function (c) {
        c.g.s.probed = true
        log(c, '你请人喝了一顿，塞了两包烟，把两条消息的来路摸清了。', 'gold')
      },
    },
  ],
  watch: [
    {
      t: '盯主线',
      d: '盘感 +4　身体 −3',
      run: function (c) {
        const s = c.g.s
        s.sense = cl(s.sense + 4)
        s.health = cl(s.health - 3)
        log(c, '盯了一整年的主线。盘感 +4，身体 −3。')
      },
    },
    {
      t: '盯异动',
      d: '盘感 +2　身体 −1　15% 记住一个席位',
      run: function (c) {
        const s = c.g.s
        s.sense = cl(s.sense + 2)
        s.health = cl(s.health - 1)
        if (c.rng.next() < 0.15) {
          s.net = cl(s.net + 4)
          log(c, '有只票连着三天尾盘异动，你记住了那个席位。人脉 +4。', 'gold')
        } else {
          log(c, '盯了一年异动，什么也没抓着。盘感 +2。')
        }
      },
    },
  ],
  social: [
    {
      t: '请经理喝酒',
      d: '花 2,000　人脉 +6　三成概率提前知道真假',
      run: function (c) {
        const s = c.g.s
        s.asset -= Math.min(2000, s.asset * 0.05)
        s.net = cl(s.net + 6)
        if (c.rng.next() < 0.3 + (s.net || 0) / 200 && !s.probed) {
          s.probed = true
          log(c, '酒过三巡，他把两条消息的来路说了。底牌亮了。', 'gold')
        } else {
          log(c, '喝了一顿，人脉 +6。消息还是那两条。')
        }
      },
    },
    {
      t: '混游资圈子',
      d: '人脉 +10　25% 被拉进杀猪盘',
      run: function (c) {
        const s = c.g.s
        s.net = cl(s.net + 10)
        if (c.rng.next() < 0.25) {
          s.scam = true
          log(c, '圈子里有人给你指了条“稳赚”的路子。人脉 +10——但你已经进去了。', 'g')
        } else {
          log(c, '混了一年圈子，认识了几个做首板的人。人脉 +10。')
        }
      },
    },
    {
      t: '去上市公司调研',
      d: '需声望 30　盘感 +3　今年踩雷减半',
      need: 30,
      run: function (c) {
        const s = c.g.s
        s.sense = cl(s.sense + 3)
        s.safe = true
        log(c, '你去了厂区，看了仓库和产线。盘感 +3，今年踩雷的概率减半。', 'a')
      },
    },
  ],
  biz: [
    {
      t: '开厂',
      d: '投 15%　三年后回 1.4–1.9 倍　资金锁死',
      run: function (c) {
        const s = c.g.s
        const amt = s.asset * 0.15
        s.asset -= amt
        s.slots.push({ kind: 'factory', amt: amt, left: 12, mult: 1.4 + c.rng.next() * 0.5 })
        log(c, '投了 ' + fmt(amt) + ' 开厂。三年后才能见到回头钱。', 'a')
      },
    },
    {
      t: '炒房',
      d: '投 20%　每季 +1.5%　政策年可能 −20%',
      run: function (c) {
        const s = c.g.s
        const amt = s.asset * 0.2
        s.asset -= amt
        s.prop += amt
        log(c, '把 ' + fmt(amt) + ' 砸进了房子。每季涨一点，但拿不出来。', 'a')
      },
    },
    {
      t: '放贷',
      d: '投 10%　一年后回 1.2 倍　15% 坏账全损',
      run: function (c) {
        const s = c.g.s
        const amt = s.asset * 0.1
        s.asset -= amt
        s.slots.push({ kind: 'loan', amt: amt, left: 4 })
        log(c, '把 ' + fmt(amt) + ' 借出去了，年息两成。明年见分晓。', 'a')
      },
    },
  ],
  study: [
    {
      t: '学技术分析',
      d: '盘感 +5　每年多 1% 摩擦成本',
      run: function (c) {
        const s = c.g.s
        s.sense = cl(s.sense + 5)
        s.fee = Math.min(0.004, s.fee + 0.0004)
        log(c, '学了一年的形态和均线。盘感 +5，但手开始痒。')
      },
    },
    {
      t: '学财报',
      d: '盘感 +2　成长股暴雷减半',
      run: function (c) {
        const s = c.g.s
        s.sense = cl(s.sense + 2)
        s.fa = true
        log(c, '把年报翻了一遍，学会了看现金流和应收。成长股暴雷的概率减半。', 'a')
      },
    },
    {
      t: '学情绪周期',
      d: '盘感 +3　龙头胜率 +6%',
      run: function (c) {
        const s = c.g.s
        s.sense = cl(s.sense + 3)
        s.emo = true
        log(c, '把几年的涨停板翻了一遍，终于看懂什么叫退潮。', 'gold')
      },
    },
  ],
  rest: [
    {
      t: '回家看看',
      d: '家 +14　身体 +3　但今年不看消息',
      run: function (c) {
        const s = c.g.s
        s.fam = cl(s.fam + 14)
        s.health = cl(s.health + 3)
        s.miss = true
        log(c, '这一年你每周回家吃饭。家里的灯，终于又是为你亮着的。', 'gold')
        if (s.fam >= 60) log(c, '　她说：你要是早就这样就好了。', 'gold')
      },
    },
    {
      t: '休一年假',
      d: '身体 +14　家 +4　但今年什么消息都不知道',
      run: function (c) {
        const s = c.g.s
        s.health = cl(s.health + 14)
        s.fam = cl(s.fam + 4)
        s.miss = true
        log(c, '你去了趟没去过的地方。身体 +14，营业部的事一概不知。', 'g')
      },
    },
    {
      t: '少睡一点',
      d: '身体 −4　什么也不耽误',
      run: function (c) {
        const s = c.g.s
        s.health = cl(s.health - 4)
        log(c, '没休息。身体 −4。')
      },
    },
  ],
  drink: [
    {
      t: '请客户吃饭',
      d: '花 5,000　声望 +6',
      run: function (c) {
        const s = c.g.s
        s.asset -= Math.min(5000, s.asset * 0.08)
        s.rep = cl(s.rep + 6)
        log(c, '请了一桌。声望 +6。')
      },
    },
    {
      t: '混老板圈子',
      d: '人脉 +8　身体 −5',
      run: function (c) {
        const s = c.g.s
        s.net = cl(s.net + 8)
        s.health = cl(s.health - 5)
        log(c, '混进了老板的圈子。人脉 +8，身体 −5。')
      },
    },
  ],
}

/** 打开一扇门。ap 用完时给一句提示（原 openAct 的行为），本身不改局面。 */
export function openAct(state: GameState, group: string): StepOutcome {
  const c = makeCtx(cloneState(state), createRng(0))
  const g = c.g
  if (g.phase !== 'trade' || g.s.over) return toOutcome(c, 'idle')
  if (!SUBS[group]) return toOutcome(c, 'idle')
  if (g.s.ap <= 0) {
    log(c, AP_EXHAUSTED_TEXT, 'g')
    return toOutcome(c, 'idle')
  }
  return toOutcome(c, 'idle')
}

/** 花 1 次行动点，跑这扇门下的第 index 个细分。 */
export function runAct(state: GameState, group: string, index: number, rng: RngLike): StepOutcome {
  const c = makeCtx(cloneState(state), rng)
  const g = c.g
  const s = g.s
  if (g.phase !== 'trade' || s.over) return toOutcome(c, 'idle')
  const list = SUBS[group]
  const o = list ? list[index] : undefined
  if (!o) return toOutcome(c, 'idle')
  if (o.need && s.rep < o.need) {
    log(c, '这个门你现在还进不去。', 'g')
    return toOutcome(c, 'idle')
  }
  if (s.ap <= 0) {
    log(c, AP_EXHAUSTED_TEXT, 'g')
    return toOutcome(c, 'idle')
  }
  s.ap--
  const k = group + ':' + index
  s.act[k] = (s.act[k] || 0) + 1
  o.run(c)
  fxk(c, 'act')
  if (s.health <= 0) return toOutcome(c, finish(c))
  return toOutcome(c, 'settled')
}

/** 消息卡右上角的打探：花 1 次，直接知道真假（原 askProbe + runProbe）。 */
export function probeIntel(state: GameState, rng: RngLike): StepOutcome {
  const c = makeCtx(cloneState(state), rng)
  const g = c.g
  const s = g.s
  if (g.phase !== 'trade' || s.over) return toOutcome(c, 'idle')
  if (s.ap <= 0) {
    log(c, AP_EXHAUSTED_TEXT, 'g')
    return toOutcome(c, 'idle')
  }
  if (s.probed) return toOutcome(c, 'idle')
  s.ap--
  s.probed = true
  s.act.probe = (s.act.probe || 0) + 1
  log(c, '你把两条消息的底摸清了。', 'gold')
  return toOutcome(c, 'settled')
}
