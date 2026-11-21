/** 选择器层：把局面算成 UI 直接能渲染的数据（不含任何 DOM 操作）。 */
import type { GameState, IntelRow, PlayerState, Quarter, SectorId, Tone } from './types'
import { BOOK, BOOKSUB, K, ORDER } from './data/sectors'
import { GROUPS } from './data/actions'
import { EV, LATE, YEV } from './data/events'
import { LINES as LINE_TABLE } from './data/lines'
import { buildQuarters } from './engine/market'
import { M } from './data/market'
import { cl, fmt, progOf, rankOf, zone, zoneWordRender } from './engine/state'

export { cl, fmt, progOf, rankOf, zone, zoneWord, zoneWordRender } from './engine/state'

/** 当前季度；越界（已进晚年）返回 null。 */
export function currentQuarter(g: GameState): Quarter | null {
  const Q = buildQuarters(g.map)
  return Q[g.s.qi] || null
}

export function totalQuarters(g: GameState): number {
  return buildQuarters(g.map).length
}

export interface GoalView {
  ratio: number
  fillPct: string
  fromText: string
  label: string
  tone: 'gold' | 'ok' | 'dim' | 'bad'
}

export function goalView(s: PlayerState): GoalView {
  const m = s.start ? s.asset / s.start : 1
  let label = ''
  let tone: GoalView['tone'] = 'dim'
  if (m >= 50) {
    label = '传说'
    tone = 'gold'
  } else if (m >= 10) {
    label = '已上岸'
    tone = 'ok'
  } else if (m >= 1) {
    label = '离上岸还差 ' + (10 / m).toFixed(1) + '×'
    tone = 'dim'
  } else {
    label = '还没回本'
    tone = 'bad'
  }
  return {
    ratio: m,
    fillPct: (progOf(m) * 100).toFixed(1),
    fromText: '本金 ' + m.toFixed(m < 10 ? 1 : 0) + '×',
    label: label,
    tone: tone,
  }
}

export interface IntelRowView {
  name: '甲' | '乙'
  text: string
  truth: 't' | 'f' | 'none'
}

export interface IntelView {
  visible: boolean
  probed: boolean
  rows: IntelRowView[]
  hint: string
  canProbe: boolean
}

/** 消息卡（原 renderIntel）。文案与判定原样搬运。 */
export function intelView(s: PlayerState): IntelView {
  if (!s.intel) return { visible: false, probed: s.probed, rows: [], hint: '', canProbe: false }
  const it: IntelRow = s.intel
  const a = s.flip ? it[2] : it[4]
  const b = s.flip ? it[4] : it[2]
  const rows: IntelRowView[] = []
  if (s.probed) {
    rows.push({ name: '甲', text: a, truth: s.flip ? 't' : 'f' })
    rows.push({ name: '乙', text: b, truth: s.flip ? 'f' : 't' })
  } else {
    rows.push({ name: '甲', text: a, truth: 'none' })
    rows.push({ name: '乙', text: b, truth: 'none' })
  }
  let hint = '两条里有一条是别人想让你信的。花 1 次打探，知道哪条是真，也就知道该押哪个板块。'
  if (s.probed) {
    const tn = s.flip ? '甲' : '乙'
    const fn = s.flip ? '乙' : '甲'
    hint =
      '真的在 ' + tn + ' 这条——它指向 ' + BOOK[it[1]] + '；' + fn + '指向 ' + BOOK[it[3]] +
      '。押对，Q2 那季多涨 10%；押错，多亏 12%。'
  } else if (s.sense >= 45) {
    const say = (s.hintOk ? s.flip : !s.flip) ? '甲' : '乙'
    hint = '盘感 ' + s.sense + '：你隐约觉得' + say + '更像真的。' + (s.sense >= 70 ? '（你这次很笃定）' : '（你不是很有把握）')
  }
  return { visible: true, probed: s.probed, rows: rows, hint: hint, canProbe: !s.probed }
}

export interface SectorView {
  id: SectorId
  book: string
  sub: string
  k: string
  on: boolean
}

export function sectorViews(s: PlayerState): SectorView[] {
  return ORDER.map(function (id) {
    return { id: id, book: BOOK[id], sub: BOOKSUB[id], k: K[id].toFixed(1) + '×', on: s.sect === id }
  })
}

export interface PositionView {
  value: number
  label: string
  on: boolean
}

export function positionViews(s: PlayerState): PositionView[] {
  const ps = [0, 0.25, 0.5, 1]
  return ps.map(function (p) {
    const label = p === 0 ? '空仓' : p === 0.25 ? '1/4 仓' : p === 0.5 ? '半仓' : '满仓'
    return { value: p, label: label, on: Math.abs(p - s.pos) < 1e-9 }
  })
}

export interface GroupView {
  id: string
  t: string
  d: string
  disabled: boolean
}

export function groupViews(s: PlayerState): GroupView[] {
  return GROUPS.filter(function (g) { return g.id !== 'probe' }).map(function (g) {
    return { id: g.id, t: g.t, d: g.d, disabled: s.ap <= 0 }
  })
}

export interface BarView {
  key: 'fam' | 'health'
  label: string
  value: number
  tone: 'bad' | 'warn' | 'ok'
}

function barTone(v: number): BarView['tone'] {
  if (v < 30) return 'bad'
  if (v < 55) return 'warn'
  return 'ok'
}

export interface AttrView {
  label: string
  value: number
  danger: boolean
}

export interface TradeView {
  phase: GameState['phase']
  mode: GameState['mode']
  paused: boolean
  yearText: string
  quarter: number
  age: number
  asset: number
  assetText: string
  goal: GoalView
  zone: { index: number; word: string; text: string; tone: 'gold' | 'ok' | 'dim'; offsetPct: string }
  whereText: string
  yearLine: string
  intel: IntelView
  yearRow: string | null
  streak: { text: string; tone: 'win' | 'lose' | 'none' }
  sectors: SectorView[]
  positions: PositionView[]
  lev: boolean
  stop: boolean
  apLeft: number
  apText: string
  groups: GroupView[]
  bars: BarView[]
  attrs: AttrView[]
  alarms: string[]
  canStep: boolean
}

/** 主界面视图（原 render 的全部读数）。 */
export function tradeView(g: GameState): TradeView {
  const s = g.s
  const q = currentQuarter(g)
  const fog = g.mode === 'fog'
  const emptyGoal = goalView(s)
  if (!q) {
    return {
      phase: g.phase, mode: g.mode, paused: !!g.pending,
      yearText: '—', quarter: 0, age: 60, asset: s.asset, assetText: '¥' + fmt(s.asset),
      goal: emptyGoal,
      zone: { index: 2, word: '', text: '', tone: 'dim', offsetPct: '50%' },
      whereText: '', yearLine: '', intel: intelView(s), yearRow: null,
      streak: { text: '', tone: 'none' }, sectors: sectorViews(s), positions: positionViews(s),
      lev: s.lev, stop: s.stop, apLeft: s.ap, apText: '剩 ' + s.ap + ' 次', groups: groupViews(s),
      bars: [], attrs: [], alarms: [], canStep: false,
    }
  }
  const z = zone(q)
  const zd = Math.round((q.rel - 1) * 100)
  const ztone: 'gold' | 'ok' | 'dim' = zd >= 6 ? 'gold' : zd <= -6 ? 'ok' : 'dim'
  const ztext =
    Math.abs(zd) < 4
      ? '差不多就在最近两年的均价上'
      : zd > 0
        ? '现在比最近两年的均价贵 ' + zd + '%'
        : '现在比最近两年的均价便宜 ' + -zd + '%'
  const ln = s.lines && s.lines.length ? s.lines : null
  const linesArr = ln ? ln : null
  let yearLine = ''
  if (!fog) {
    const src = linesArr || (q.y in LINE_TABLE ? LINE_TABLE[q.y] : null)
    if (src && src.length) yearLine = '「' + src[(q.q - 1) % src.length] + '」'
  }
  const alarms: string[] = []
  if (s.fam < 30) alarms.push('家里没人说话（去休息→回家）')
  if (s.health < 40) alarms.push('记不住昨天的事')
  if (s.flag >= 15) alarms.push('有案底，有人在查')
  const attrs: AttrView[] = [
    { label: '盘感', value: s.sense, danger: false },
    { label: '人脉', value: s.net, danger: false },
    { label: '声望', value: s.rep, danger: false },
  ]
  if (s.flag) attrs.push({ label: '案底', value: s.flag, danger: true })
  const streak = s.streak >= 3
    ? { text: '连盈 ' + s.streak + ' 季', tone: 'win' as const }
    : s.streak <= -3
      ? { text: '连亏 ' + -s.streak + ' 季', tone: 'lose' as const }
      : { text: '—', tone: 'none' as const }
  return {
    phase: g.phase,
    mode: g.mode,
    paused: !!g.pending,
    yearText: fog ? '第 ' + (Math.floor(s.qi / 4) + 1) + ' 年' : String(q.y),
    quarter: q.q,
    age: 25 + (q.y - 1991),
    asset: s.asset,
    assetText: '¥' + fmt(s.asset),
    goal: emptyGoal,
    zone: { index: z, word: zoneWordRender(z), text: ztext, tone: ztone, offsetPct: 8 + z * 21 + '%' },
    whereText: fog ? '点位不报' : '上证 ' + Math.round(q.p0) + ' 点',
    yearLine: yearLine,
    intel: intelView(s),
    yearRow: yearRowText(s, q),
    streak: streak,
    sectors: sectorViews(s),
    positions: positionViews(s),
    lev: s.lev,
    stop: s.stop,
    apLeft: s.ap,
    apText: '剩 ' + s.ap + ' 次',
    groups: groupViews(s),
    bars: [
      { key: 'fam', label: '家', value: cl(s.fam), tone: barTone(cl(s.fam)) },
      { key: 'health', label: '身体', value: cl(s.health), tone: barTone(cl(s.health)) },
    ],
    attrs: attrs,
    alarms: alarms,
    canStep: g.phase === 'trade' && !s.over && !g.pending,
  }
}

/** 去年最猛的那个板块（原 yrow 那行）。 */
export function yearRowText(s: PlayerState, q: Quarter): string | null {
  const pe = s.kty && q.my - 1 >= 1991 ? s.kty[q.my - 1] : null
  if (!pe) return null
  let best: SectorId = '龙头'
  let bv = -9
  ORDER.forEach(function (k) {
    if (pe[k] > bv) {
      bv = pe[k]
      best = k
    }
  })
  const bp = Math.round(bv * 100)
  let line = '去年 ' + BOOK[best] + ' 最猛（' + (bp >= 0 ? '+' : '') + bp + '%）'
  if (s.sense >= 50) {
    const acc = Math.min(85, Math.max(40, s.sense))
    line += '　·　你觉得今年还是它（约 ' + Math.round(acc / 10) + ' 成把握）'
  } else {
    line += '　·　今年换谁，得你自己看'
  }
  return line
}

export interface LateView {
  assetText: string
  age: number
  yearText: string
  goal: GoalView
  companion: string
}

/** 晚年视图（原 renderLate）。 */
export function lateView(g: GameState): LateView {
  const s = g.s
  const ev = LATE[g.li]
  return {
    assetText: '¥' + fmt(s.asset),
    age: 62 + g.li * 3,
    yearText: String(ev ? ev.y : 2049),
    goal: goalView(s),
    companion: s.fam >= 60 ? '有人陪' : s.fam < 25 ? '一个人' : '',
  }
}

export interface PendingEventView {
  type: 'event' | 'year' | 'late'
  title: string
  heading: string
  body: string
  who: string | null
  options: { k: string; d: string; locked: boolean; lockText: string }[]
}

/** 当前待选事件（事件卡 / 年底人生卡 / 晚年卡）。 */
export function pendingView(g: GameState): PendingEventView | null {
  const p = g.pending
  if (!p) return null
  const s = g.s
  const q = currentQuarter(g)
  const fog = g.mode === 'fog'
  if (p.type === 'event') {
    const ev = EV[p.key]
    if (!ev) return null
    let body = ev.p
    if (fog) body = body.replace(/\d{4}\s*年?/g, '某年').replace(/\d+\s*点/g, '某个位置')
    const title = fog ? '第 ' + (Math.floor(s.qi / 4) + 1) + ' 年 · Q' + (q ? q.q : '') : (q ? q.y + ' · Q' + q.q : p.key)
    return {
      type: 'event', title: title, heading: ev.h, body: body, who: null,
      options: ev.o.map(function (o) { return { k: o.k, d: o.d, locked: false, lockText: '' } }),
    }
  }
  if (p.type === 'year') {
    const ev = YEV.find(function (e) { return e.y === p.year })
    if (!ev) return null
    const who = '账户 ¥' + fmt(s.asset) + '　盘感 ' + s.sense + '　人脉 ' + s.net + '　身体 ' + s.health + '　家 ' + s.fam
    return {
      type: 'year',
      title: (fog ? '第 ' + (Math.floor(s.qi / 4) + 1) + ' 年' : String(ev.y)) + ' · 年底',
      heading: ev.h, body: ev.p, who: who,
      options: ev.o.map(function (o) { return { k: o.k, d: o.d, locked: false, lockText: '' } }),
    }
  }
  const ev = LATE[p.index]
  if (!ev) return null
  return {
    type: 'late',
    title: String(ev.y) + ' · 你 ' + (62 + p.index * 3) + ' 岁',
    heading: ev.h,
    body: ev.p,
    who: '身家 ¥' + fmt(s.asset) + '　家 ' + s.fam + '　身体 ' + s.health,
    options: ev.o.map(function (o) { return { k: o.k, d: o.d, locked: false, lockText: '' } }),
  }
}

export interface EndView {
  title: string
  note: string
  willNote: string
  assetText: string
  rows: { label: string; value: string }[]
  profile: string[]
  egg: string
  epochHead: string
  epochTail: string
}

/** 结局页（原 finish 的文案 + profHTML + eggPick + epochSay）。 */
export function endView(g: GameState): EndView {
  const s = g.s
  const a = s.asset
  const x = a / s.start
  let title = '平安落地'
  let note = '三十六年，你活下来了。'
  if (s.busted) {
    title = '爆仓'
    note = '那根线穿过你的时候，你还在睡。'
  } else if (x < 0.5) {
    title = '白干一场'
    note = '三十六年，你比进场时还少。'
  } else if (x < 5) {
    title = '温饱'
    note = '够吃饭，不够翻身。'
  } else if (x < 20) {
    title = '小康'
    note = '账上有钱，但你还是不敢辞职。'
  } else if (x < 35) {
    title = '大户'
    note = '你搬进了大户室，有了自己的沙发。'
  } else if (x < 50) {
    title = '传奇'
    note = '营业部墙上，有人给你留了一张座位。'
  } else {
    title = '资本系'
    note = '别人不再叫你名字，叫你“那个系”。'
  }
  if (!s.busted && x >= 50 && s.fam < 25) {
    title = '孤家寡人'
    note = '账上的数字很大。房子里只有你一个人。'
  }
  if (!s.busted && s.fam >= 72 && x >= 20) {
    title = '善终'
    note = '钱够用，家里有人等你吃饭。'
  }
  if (x >= 50 && !s.busted) {
    note =
      note + ' 后来营业部里还有人讲你，说那几十年，有一个人从 ' + fmt(s.start) + ' 做到了 ' + fmt(a) + '。'
  }
  if (s.flag >= 15) {
    title = title + '（有案底）'
    note = note + ' 那件事，一直有记录。'
  }
  if (s.health < 18 && !s.busted) {
    title = title + '（病榻）'
    note = note + ' 你的身体，早就被那些夜盘换掉了。'
  }
  let willNote = ''
  if (s.will === 'kids') willNote = '你把所有都留给了子女。'
  else if (s.will === 'half') willNote = '一半给了学校，一半给了子女。'
  else if (s.will === 'spend') willNote = '你一分没留。'
  return {
    title: title,
    note: note,
    willNote: willNote,
    assetText: '¥' + fmt(a),
    rows: [
      { label: '起始', value: '¥' + fmt(s.start) },
      { label: '倍数', value: x.toFixed(1) + '×' },
      { label: '最高', value: '¥' + fmt(s.peak) },
      { label: '最大回撤', value: (s.maxDD * 100).toFixed(0) + '%' },
      { label: '最长连盈', value: s.best + ' 季' },
      { label: '交易季数', value: s.seasons + '/144' },
      { label: '盘感', value: String(s.sense) },
      { label: '人脉', value: String(s.net) },
      { label: '声望', value: String(s.rep) },
      { label: '案底', value: String(s.flag) },
      { label: '家', value: String(s.fam) },
      { label: '身体', value: String(s.health) },
    ],
    profile: profileLines(s),
    egg: eggPick(s),
    epochHead: epochHead(s),
    epochTail: epochTail(s),
  }
}

/**
 * 指数首尾：M 的第一笔（1990-12 收盘 127.61）与最后一笔（2026-11 收盘 3533.79）。
 * 这是全套史料里唯一的「真实首尾」——结局卡那条年线是抽样，首点是 1991 Q1、末点是 2026 Q4 起点，
 * 两头都不对齐，所以以前会算出 30×，与正文的 27.7 倍打架。倍数只认这里。
 */
export function indexSpan(): { from: number; to: number; mult: number } {
  const from = M[0]
  const to = M[M.length - 1]
  return { from: from, to: to, mult: from > 0 ? to / from : 1 }
}

/** 指数走了几倍（唯一口径）。正文、结局卡、分享文案都调它。 */
export function indexMultiple(): number {
  return indexSpan().mult
}

/** 指数倍数的展示串（一位小数，27.7×），保证同一屏只有一个数。 */
export function indexMultipleText(): string {
  return indexMultiple().toFixed(1) + '×'
}

function epochHead(s: PlayerState): string {
  const x = s.asset / s.start
  const span = indexSpan()
  return '你进场那天，上证 ' + span.from.toFixed(1) + ' 点。走那天，' + span.to.toFixed(1) + ' 点。指数走了 ' + indexMultiple().toFixed(1) + ' 倍，你走了 ' + x.toFixed(x < 10 ? 1 : 0) + ' 倍。'
}

function epochTail(s: PlayerState): string {
  const x = s.asset / s.start
  if (s.busted) return '你曾经有过。这句话，是很多人的墓志铭。'
  if (x > indexMultiple()) return '你跑赢了指数。靠的不是眼光，是那几次你敢在别人不敢的时候满仓，和更多的几次你忍住了没满。'
  if (x >= 10) return '你跑输了指数一点点。三十六年，你大部分功夫花在选票上——而指数从来不选票。'
  if (x >= 1) return '你输了指数一大截。你换过很多次板块，指数一次都没换。'
  return '指数涨了 ' + Math.floor(indexMultiple()) + ' 倍，你连本金都没守住。这三十六年你唯一做对的事，是还在。'
}

/** 墓志铭（原 eggPick）。 */
export function eggPick(s: PlayerState): string {
  const x = s.asset / s.start
  if (s.fam < 25) return '你的葬礼来了三桌人，两桌是营业部的。家里只摆了一个位置，从头到尾没哭。'
  if (s.health < 18) return '走之前，医生问这几十年有没有落下什么习惯。你想了半天，说：收盘以后再看一眼。'
  if (s.flag >= 15) return '你的事后来被编进一份内部培训材料，标题叫《常见违规情形》。你被写成"张某"，前后出现六次，是全篇出现最多的名字。'
  if (x >= 100) return '后来有人在论坛发帖：《三十六年，从 ' + fmt(s.start) + ' 到千万》。第一条回复是"老师带带我"，第二条是"复权了吗"，第三条是"编的"，第四条是版主删帖。'
  if (x >= 10) return '你的座位后来成了营业部的一个景点。新来的客户会被领过去看一眼，经理说：这位老师傅，年化跑得比大盘好。没人告诉你，那个数字里有一半，是某一年的一把。'
  if (x < 1) return '你到死也没销户。有人问你怎么做，你说：别做。他笑了，以为你在开玩笑。你也没解释——有些话，赚过钱的人说，才有人信。'
  if (s.fam >= 72) return '你走后，儿子在你抽屉里翻出一本账本。第一页是 1991 年 12 月，最后一页是 2026 年 11 月，中间没有一页是空白的。'
  const F = [
    '你临终前问护士：今天收盘多少？护士说：今天周六。',
    '你的墓碑上刻着"他从不追高"。刻字的是你儿子，他不知道 2007 年你满仓过。',
    '你一共听过 36 条消息，其中 18 条是真的。你信了 12 条，这 12 条里有 7 条是真的。这个命中率，够你活一辈子。',
    '你最后一次调仓是半仓。你没什么理由，只是觉得该收敛了。那一季，指数涨了 2%。',
    '你孙子把你的交割单拍下来发到网上，配文"我爷爷是股神"。有人在下面回：这是亏的吧。他秒删了。',
  ]
  return F[Math.abs(Math.round(s.asset)) % F.length]
}

/**
 * 四档仓位的整数百分比：最大余数法，四项一定加起来正好 100。
 * 直接 Math.round 每项会出现 48+6+0+46=100 或 48+6+0+47=101 这种凑不齐的情况。
 * 只有四档之和确实等于 n 时才做补齐；否则（老存档里有别的仓位档）就老实四舍五入。
 */
function splitPct(counts: number[], n: number): number[] {
  const raw = counts.map(function (c) { return n ? (c / n) * 100 : 0 })
  const base = raw.map(function (v) { return Math.floor(v) })
  let sum = 0
  let total = 0
  for (let i = 0; i < base.length; i++) sum += base[i]
  for (let i = 0; i < counts.length; i++) total += counts[i]
  if (total !== n) return raw.map(function (v) { return Math.round(v) })
  const order = raw
    .map(function (v, i) { return i })
    .sort(function (a, b) { return (raw[b] - base[b]) - (raw[a] - base[a]) })
  let left = 100 - sum
  let i = 0
  while (left > 0 && order.length) {
    base[order[i % order.length]] += 1
    left--
    i++
  }
  return base
}

/** 复盘六条（原 profHTML，去掉 <b> 标记，只留文字与数字）。 */
export function profileLines(s: PlayerState): string[] {
  if (!s.H || s.H.length < 24) return []
  const n = s.H.length
  const full = s.H.filter(function (a) { return a[3] === 1 }).length
  const half = s.H.filter(function (a) { return a[3] === 0.5 }).length
  const quart = s.H.filter(function (a) { return a[3] === 0.25 }).length
  const flat = s.H.filter(function (a) { return a[3] === 0 }).length
  const yearly = s.H.filter(function (a) { return a[1] === 1 })
  let chg = 0
  let bang = 0
  let hit = 0
  for (let i = 1; i < yearly.length; i++) {
    if (yearly[i][2] !== yearly[i - 1][2]) {
      chg++
      if (yearly[i][6]) {
        bang++
        if (yearly[i][7]) hit++
      }
    }
  }
  const acc = bang ? hit / bang : 0
  let dn = 0
  let upw = 0
  for (let i = 0; i < n - 1; i++) {
    if (s.H[i][4] < 0) {
      if (s.H[i + 1][3] < s.H[i][3]) dn++
      else if (s.H[i + 1][3] > s.H[i][3]) upw++
    }
  }
  const A = s.act || {}
  const probe = A.probe || 0
  const home = A['rest:0'] || 0
  const watch = (A['watch:0'] || 0) + (A['watch:1'] || 0)
  const rs: string[] = []
  const pcts = splitPct([full, half, quart, flat], n)
  const fp = pcts[0]
  const hp = pcts[1]
  const qp = pcts[2]
  const zp = pcts[3]
  const parts: string[] = []
  // 有就写（不设门槛），这样屏幕上这四项加起来一定正好 100
  if (fp > 0) parts.push('满仓 ' + fp + '%')
  if (hp > 0) parts.push('半仓 ' + hp + '%')
  if (qp > 0) parts.push('四分之一仓 ' + qp + '%')
  if (zp > 0) parts.push('空仓 ' + zp + '%')
  rs.push(
    (parts.length ? parts.join('，') : '你常年都是一个仓位') +
      '。' +
      (fp >= 65
        ? '你几乎没给自己留过退路。'
        : zp >= 20
          ? '你有很长时间是站在场外看的。'
          : hp >= 60
            ? '你常年半仓，既不空也不满。'
            : qp >= 60
              ? '你常年轻仓，先把本金放在安全的地方。'
              : '你在几档仓位之间来回换。'),
  )
  if (chg >= 3) {
    let t = '你换了 ' + chg + ' 次板块'
    if (bang > 0) {
      t += '，其中 ' + bang + ' 次是追着去年最猛的那个换的。这 ' + bang + ' 次里，' + hit + ' 次它今年还是强的。'
      t +=
        bang < 6
          ? '次数太少，还看不出你追得准不准。'
          : acc >= 0.6
            ? '你的眼力不错，追上去多数还在走。'
            : acc <= 0.35
              ? '你追上去的时候，它多半已经走完了。'
              : '你追对一半，另一半是接的最后一棒。'
    } else {
      t += '，但一次都没追着最猛的换过——你换的方向，都是自己另找的。'
    }
    rs.push(t)
  } else {
    rs.push('你一共只换了 ' + chg + ' 次板块。' + (chg <= 1 ? '你从头到尾都待在同一个地方。' : '你几乎不挪窝。'))
  }
  if (dn + upw >= 4) {
    rs.push(
      '亏钱之后，你降仓 ' + dn + ' 次，加仓 ' + upw + ' 次。' +
        (upw > dn * 1.4 ? '你不服输，亏了还想再赢回来。' : dn > upw * 1.4 ? '你一疼就退，很少回头。' : '你亏完会犹豫，但不至于乱动。'),
    )
  } else if (dn + upw > 0) {
    rs.push('亏钱之后，你只调过 ' + (dn + upw) + ' 次仓（降 ' + dn + ' 次、加 ' + upw + ' 次）——多数时候你不动，硬扛。')
  } else {
    rs.push('亏了钱，你一次都没动过仓位。')
  }
  rs.push(
    '三十六年，你打探了 ' + probe + ' 次。' +
      (probe <= 5 ? '你更信自己的眼睛，不太信别人嘴里的话。' : probe >= 18 ? '你几乎每年都在打听。' : '你只在关键的那几年开口问。'),
  )
  if (home + watch === 0) {
    rs.push('三十六年，你没为家里和盘面各花过一次行动点。')
  } else {
    rs.push(
      '你回家 ' + home + ' 次，盯盘 ' + watch + ' 次。' +
        (home > watch ? '你把更多时间给了家里。' : watch > home * 1.5 ? '你把大部分时间给了那五只票。' : '你在两边都留了位置。'),
    )
  }
  rs.push('你最惨的时候，账户从最高点回撤过 ' + Math.round(s.maxDD * 100) + '%。')
  let tag = '一个均衡的人'
  if (chg >= 12 && bang >= 6 && acc < 0.45) tag = '一个追涨的人'
  else if (chg <= 4) tag = '一个守票的人'
  else if (dn + upw >= 4 && upw > dn * 1.5) tag = '一个不服输的人'
  else if (probe >= 18) tag = '一个靠消息的人'
  else if (fp >= 75) tag = '一个满仓的人'
  else if (flat / n >= 0.22) tag = '一个谨慎的人'
  else if (chg >= 12 && bang >= 6 && acc >= 0.6) tag = '一个追得准的人'
  rs.push('这一局，你是' + tag + '。')
  return rs
}

/** 日志色调 → UI 用的色名（S2 换肤时改这一张表即可）。 */
export const TONE_CLASS: Record<Tone, string> = {
  r: 'up',
  g: 'down',
  gold: 'gold',
  a: 'note',
  w: 'head',
  dim: 'plain',
}
