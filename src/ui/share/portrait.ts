/**
 * 人物内核（像素精灵版）—— 纯 TS、零素材、零依赖：像素数据就是源码里的 ASCII 图。
 * 硬约束（与 charts/geometry.ts 同款）：
 *   · 不含 uni./window./document.、不含 Date / 随机数（同一 spec 两次绘制逐条一致）；
 *   · ctx 由调用方注入，只用 save/restore/fillRect 与 fillStyle/globalAlpha；
 *     路径方法（beginPath/moveTo/lineTo/arc/fill）保留在类型里以便兼容既有 ctx 契约，本版不用；
 *   · 不画五官：一个像素就是一块颜色，靠体型、姿态、服装、道具、白发区分人；
 *   · 逻辑画布 48×64，scale = floor(min(w/48, h/64))；scale < 1 时退化成轮廓剪影；
 *   · 同色横条先合并再逐条 fillRect，一帧的绘制次数压在几百以内。
 * 颜色不在这里写死：调用方传 opts.colors，缺省值与 tokens.css 同源（见 DEFAULT_PORTRAIT_COLORS）。
 */
import type { EndView, PlayerState, TradeView } from '../../core'
import { drawPaper } from './stillLife'

/* ---------- 类型 ---------- */

export type Mood = 'calm' | 'up' | 'down' | 'bust' | 'sick'
export type WealthTier = 0 | 1 | 2 | 3 | 4

/** 一张脸的"档案"：只有这 6 个量决定长什么样。 */
export interface PortraitSpec {
  age: number
  wealth: WealthTier
  health: number
  family: number
  record: number
  mood: Mood
}

export interface PortraitColors {
  /** 剪影本体。 */
  body: string
  /** 轮廓光 / 手杖 / 光晕。 */
  rim: string
  /** 头发（越老越白越实）。 */
  hair: string
  /** 案底斜纹。 */
  shade: string
  /** 家庭小人的一点点补色。 */
  accent: string
  /** 地面投影。 */
  ground: string
}

/**
 * 与 src/ui/styles/tokens.css 同源（唯一的硬编码处，改 tokens 请同步这里）：
 *   body  ← --ink-2 比底色亮一档，剪影才立得住（深色画深色等于没画）
 *   rim   ← --gold-0（轮廓光 / 手杖 / 光晕）
 *   hair  ← --ink-0
 *   shade ← --bg-0（案底斜纹压暗）
 *   accent← --teal-0（身侧小人的一点补色）
 *   ground← --bg-0（脚下投影）
 */
export const DEFAULT_PORTRAIT_COLORS: PortraitColors = {
  body: '#6b798b',
  rim: '#f6cf72',
  hair: '#eaf1f8',
  shade: 'rgba(6,9,13,0.55)',
  accent: '#3ee0cb',
  ground: '#06090d',
}

export interface PortraitOpts {
  colors?: Partial<PortraitColors>
  /** 身后一圈极淡的光晕（小尺寸可关）。 */
  halo?: boolean
  /** 脚下投影（小尺寸可关）。 */
  ground?: boolean
}

/** 只声明用得到的 2D 能力：双端 canvas 2d 都满足。 */
export interface PortraitCtx {
  save(): void
  restore(): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, r: number, a0: number, a1: number): void
  fill(): void
  /** 像素精灵只靠它出图；可选是为了兼容 charts 那套只声明了部分方法的 Ctx2D。 */
  fillRect?(x: number, y: number, w: number, h: number): void
  fillStyle?: unknown
  globalAlpha?: unknown
}

/**
 * 像素精灵只用到 fillRect + 两个属性；路径能力保留给将来的描边尝试。
 * 硬约束：这里没有 stroke / strokeStyle / lineWidth / closePath。
 * 小程序那层的 ctx 契约只保证 fillRect + beginPath/moveTo/lineTo/arc/fill（src/game/paint.ts
 * 的 Ctx2D 明确写了"描边也走 fillRect"），所以"线"一律用填充四边形 + 圆头拼出来，
 * 这份内核才能原样搬到小游戏里画。
 */

/* ---------- 小工具 ---------- */

const TAU = Math.PI * 2

function r2(n: number): number {
  return Math.round(n * 100) / 100
}
function clamp(v: number, lo: number, hi: number): number {
  const n = Number(v)
  if (!isFinite(n)) return lo
  return n < lo ? lo : n > hi ? hi : n
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** 两个十六进制色按比例混（t=0 → a，t=1 → b）。非十六进制原样返回 a。 */
function mixHex(a: string, b: string, t: number): string {
  const pa = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(a || '').trim())
  const pb = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(b || '').trim())
  if (!pa || !pb) return a
  const full = function (m: RegExpExecArray): string {
    const h = m[1]
    return h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h
  }
  const ha = full(pa)
  const hb = full(pb)
  const k = clamp(t, 0, 1)
  const out = [0, 2, 4].map(function (i) {
    const va = parseInt(ha.slice(i, i + 2), 16)
    const vb = parseInt(hb.slice(i, i + 2), 16)
    const c2 = Math.round(va + (vb - va) * k)
    const s2 = c2.toString(16)
    return s2.length < 2 ? '0' + s2 : s2
  })
  return '#' + out.join('')
}

/** #rgb / #rrggbb 按系数压暗或提亮；非十六进制（如 rgba()）原样返回。 */
function shadeHex(hex: string, f: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return hex
  const h = m[1].length === 3 ? m[1][0] + m[1][0] + m[1][1] + m[1][1] + m[1][2] + m[1][2] : m[1]
  const k = clamp(f, 0, 2)
  const out = [0, 2, 4].map(function (i) {
    const v = Math.round(parseInt(h.slice(i, i + 2), 16) * k)
    const c = Math.max(0, Math.min(255, v))
    const s = c.toString(16)
    return s.length < 2 ? '0' + s : s
  })
  return '#' + out.join('')
}

/* ---------- 状态 → 外观 ---------- */

/** 财富档：按"翻了几倍"分档（与结局卡的 x = asset / start 同一口径）。 */
export function wealthOf(asset: number, start: number): WealthTier {
  const a = Number(asset)
  const s = Number(start)
  const x = isFinite(a) && isFinite(s) && s > 0 ? a / s : 0
  if (x < 1) return 0
  if (x < 5) return 1
  if (x < 20) return 2
  if (x < 50) return 3
  return 4
}

/** 情绪：爆仓 > 病 > 连亏/大回撤 > 连盈 > 平静（先到先得，不让两个 mood 同时成立）。 */
export function moodOf(p: {
  busted?: boolean
  health: number
  maxDD?: number
  streak?: number
}): Mood {
  const h = Number(p.health)
  const dd = Number(p.maxDD || 0)
  const st = Number(p.streak || 0)
  if (p.busted) return 'bust'
  if (isFinite(h) && h < 20) return 'sick'
  if (dd >= 0.35 || st <= -3) return 'down'
  if (st >= 3) return 'up'
  return 'calm'
}

/** 组件拿得到的那些读数（TradeView / EndView 都不含完整 PlayerState）。 */
export interface PortraitParts {
  age: number
  asset: number
  /** 起始本金，缺省按三种出身的中间值 3 万算（只用于财富分档）。 */
  start?: number
  health: number
  family: number
  /** 案底（0..100）。 */
  record?: number
  busted?: boolean
  streak?: number
  maxDD?: number
}

/** 财富分档的兜底本金：ORG 三档是 2 万 / 3 万 / 5.2 万，取中间值最不容易看歪。 */
export const FALLBACK_START = 30000

export function portraitOfParts(p: PortraitParts): PortraitSpec {
  const start = p.start != null && p.start > 0 ? p.start : FALLBACK_START
  const health = clamp(p.health, 0, 100)
  return {
    age: clamp(p.age, 18, 85),
    wealth: wealthOf(p.asset, start),
    health: health,
    family: clamp(p.family, 0, 100),
    record: clamp(p.record == null ? 0 : p.record, 0, 100),
    mood: moodOf({ busted: p.busted, health: health, maxDD: p.maxDD, streak: p.streak }),
  }
}

/** 内核的 PlayerState → 一张脸。age 缺省按交易期推（25 岁进场，四季一年）。 */
export function portraitFromState(s: PlayerState, age?: number): PortraitSpec {
  const years = Math.floor(Number(s.qi) / 4)
  const a = age != null ? age : 25 + (isFinite(years) ? years : 0)
  return portraitOfParts({
    age: a,
    asset: s.asset,
    start: s.start,
    health: s.health,
    family: s.fam,
    record: s.flag,
    busted: s.busted,
    streak: s.streak,
    maxDD: s.maxDD,
  })
}

/* ---------- 两处 UI 适配器（组件拿不到完整 PlayerState） ---------- */

function barValue(v: TradeView, key: string): number {
  for (let i = 0; i < v.bars.length; i++) if (v.bars[i].key === key) return v.bars[i].value
  return 0
}

/** 顶栏：TradeView 里能读到的就只有这些（age / asset / 两条进度条 / 连盈 / 案底 chip）。 */
export function portraitFromTradeView(v: TradeView): PortraitSpec {
  let record = 0
  for (let i = 0; i < v.attrs.length; i++) if (v.attrs[i].label === '案底') record = v.attrs[i].value
  return portraitOfParts({
    age: v.age,
    asset: v.asset,
    health: barValue(v, 'health'),
    family: barValue(v, 'fam'),
    record: record,
    streak: v.streak.tone === 'win' ? 3 : v.streak.tone === 'lose' ? -3 : 0,
  })
}

function rowNum(end: EndView, label: string): number {
  for (let i = 0; i < end.rows.length; i++) {
    if (end.rows[i].label !== label) continue
    const n = parseFloat(String(end.rows[i].value).replace(/[^0-9.-]/g, ''))
    return isFinite(n) ? n : 0
  }
  return 0
}

/**
 * 结局卡：EndView.rows 里有 倍数 / 家 / 身体 / 案底，够还原一个人。
 * 年龄固定 85：卡面文案就是「2051 · 八十五岁」（36 年交易 + 23 年晚年），
 * 而 endYear 只走到 2026（=60 岁）—— 拿它推年龄会和卡面自相矛盾。
 */
export function portraitFromEndView(end: EndView, age = 85): PortraitSpec {
  const mult = rowNum(end, '倍数')
  const x = mult > 0 ? mult : 1
  return portraitOfParts({
    age: age,
    asset: x,
    start: 1,
    health: rowNum(end, '身体'),
    family: rowNum(end, '家'),
    record: rowNum(end, '案底'),
    busted: end.title.indexOf('爆仓') >= 0,
    maxDD: rowNum(end, '最大回撤') / 100,
  })
}

/* ---------- 造型特征：可单测的中间层 ---------- */

/** 接触面：两只脚 / 单脚承重 / 单膝着地 / 坐在椅子上。 */
export type Contact = 'both' | 'single' | 'kneel' | 'seat'

export interface PortraitTraits {
  /** 相对画框的身高比（越老越矮）。 */
  heightRatio: number
  /** 驼背/前倾 0..1。 */
  hunch: number
  /** 白发浓度 0..1。 */
  whiteHair: number
  /** 70 岁起出手杖。 */
  cane: boolean
  /** 身侧小人个数（0 / 1 / 2）。 */
  companions: number
  /** 服装轮廓。 */
  garment: 'work' | 'shirt' | 'suit'
  /** 长外衣（wealth 4）。 */
  coat: boolean
  /** 肩背倾斜（健康差时一肩塌下去）。 */
  shoulderTilt: number
  /** 头下垂量（0..1）。 */
  headDroop: number
  /** 扶腰（健康 < 40）。 */
  handOnBack: boolean
  /** 案底斜纹条数（0 表示干净）。 */
  stripes: number
  /** 坐着（sick）。 */
  seated: boolean
  /** 这一张脸站在/坐在什么上面 —— 姿态必须和它一致。 */
  contact: Contact
  /** 公文包（wealth >= 2）。 */
  briefcase: boolean
  /** 酒杯（mood = up）。 */
  glass: boolean
  /** 报纸（wealth <= 1 且 age < 40）。 */
  paper: boolean
}

export function portraitTraits(raw: PortraitSpec): PortraitTraits {
  const s = sanitize(raw)
  const t = clamp((s.age - 18) / (85 - 18), 0, 1)
  const hNorm = s.health / 100
  const seated = s.mood === 'sick'
  const bust = s.mood === 'bust'
  const moodLean = bust ? 1 : s.mood === 'down' ? 0.45 : 0
  return {
    // 病态坐着比站着矮一截；塌是"矮下去"，靠姿态表达，这里只留一点压缩。
    heightRatio: (seated ? 0.9 : bust ? 0.95 : 1) * lerp(1, 0.86, t),
    hunch: clamp(0.75 * t + 0.5 * (1 - hNorm) + 0.22 * moodLean, 0, 1),
    whiteHair: clamp((s.age - 52) / 28, 0, 1),
    cane: s.age >= 70,
    companions: s.family < 30 ? 0 : s.family < 60 ? 1 : 2,
    garment: s.wealth <= 1 ? 'work' : s.wealth === 2 ? 'shirt' : 'suit',
    coat: s.wealth === 4,
    shoulderTilt: clamp((1 - hNorm) * 0.05 + (bust ? 0.02 : 0), 0, 0.09),
    headDroop: clamp(0.5 * (1 - hNorm) + (bust ? 0.4 : 0) + (s.mood === 'down' ? 0.12 : 0), 0, 1),
    handOnBack: hNorm < 0.4 && !seated && !bust,
    stripes: s.record < 8 ? 0 : 1 + Math.min(3, Math.floor(s.record / 26)),
    seated: seated,
    contact: seated ? 'seat' : bust ? 'kneel' : s.mood === 'down' ? 'single' : 'both',
    briefcase: s.wealth >= 2,
    glass: s.mood === 'up',
    paper: s.wealth <= 1 && s.age < 40,
  }
}

function sanitize(raw: PortraitSpec): PortraitSpec {
  const m: Mood = raw.mood
  const valid: Mood = m === 'up' || m === 'down' || m === 'bust' || m === 'sick' ? m : 'calm'
  return {
    age: clamp(raw.age, 18, 85),
    wealth: clamp(Math.round(Number(raw.wealth)), 0, 4) as WealthTier,
    health: clamp(raw.health, 0, 100),
    family: clamp(raw.family, 0, 100),
    record: clamp(raw.record, 0, 100),
    mood: valid,
  }
}

/* ---------- 像素精灵（数据即素材：ASCII 图就是源码） ---------- */

/**
 * 逻辑画布 48×64：所有精灵都在这个坐标系里定锚点，scale = floor(min(w/48, h/64))。
 * 字符含义：
 *   #=布料  +=受光面  -=暗面  s=肤色  g=金（道具）  w=白（白发/报纸/杯子）  .=透明
 * 一份精灵 = 若干行 ASCII + 一个左上角锚点（ox, oy）。行可以不等长，右边按透明补齐。
 */
export const LOGICAL_W = 48
export const LOGICAL_H = 64

export interface Sprite {
  /** 画布坐标（48×64 逻辑像素）里的左上角。 */
  ox: number
  oy: number
  rows: string[]
  /** 关键锚点（同样在 48×64 逻辑像素里）：贴道具用。 */
  handR: [number, number]
  handL: [number, number]
  feetY: number
}

const STAND: Sprite = {
  ox: 8,
  oy: 8,
  rows: [
    '.............######',
    '............########',
    '............ssssssss',
    '............ssssssss',
    '.............ssssss',
    '..............ssss',
    '..............ssss',
    '...........++######--',
    '..........+++######---',
    '.......---+++######---',
    '.......---+++######---',
    '.......---+++######---',
    '.......---+++######---',
    '.......---+++######---',
    '.......---+++######---',
    '.......---+++######---',
    '.......---+++######---',
    '.......---+++######---',
    '.......---+++######---',
    '........s--+++#####---',
    '........s--+++#####---',
    '........---+++#####--',
    '.........---++####--',
    '..........++#####--',
    '..........++####--',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '.........++####-####-',
    '.........++####-####-',
    '.........++####-####-',
    '.........++####-####-',
    '.........++####-####-',
  ],
  handR: [29, 29],
  handL: [17, 29],
  feetY: 55,
}

const SLUMP: Sprite = {
  ox: 8,
  oy: 14,
  rows: [
    '............######',
    '...........########',
    '...........ssssssss',
    '...........ssssssss',
    '............ssssss',
    '.............ssss',
    '.............ssss',
    '..........++######--',
    '........+++#######---',
    '......---+++#######---',
    '......---+++#######---',
    '......---+++#######---',
    '......---+++#######---',
    '......---+++#######---',
    '......---+++#######---',
    '.......s--+++######---',
    '.......s--+++######---',
    '........---+++#####---',
    '.........---++####---',
    '..........++#####--',
    '..........++####--',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '.........++####-####-',
    '.........++####-####-',
    '.........++####-####-',
  ],
  handR: [28, 30],
  handL: [17, 30],
  feetY: 50,
}

const SUIT: Sprite = {
  ox: 6,
  oy: 8,
  rows: [
    '...............######',
    '..............########',
    '..............ssssssss',
    '..............ssssssss',
    '...............ssssss',
    '................ssss',
    '................ssss',
    '.............++######--',
    '............+++######---',
    '.......----+++######----',
    '.......----+++######----',
    '.......----+++#gg##-----',
    '.......----+++#gg##-----',
    '.......----+++#gg##-----',
    '.......----+++#gg##-----',
    '.......----+++####+-----',
    '.......----+++####+-----',
    '.......----+++####+-----',
    '.......----+++####+-----',
    '........s---+++####+----',
    '........s---+++####+----',
    '........----+++###+----',
    '.........----++##+----',
    '..........++####+---',
    '..........++###+---',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '.........++####-####-',
    '.........++####-####-',
    '.........++####-####-',
    '.........++####-####-',
    '.........++####-####-',
  ],
  handR: [30, 29],
  handL: [15, 29],
  feetY: 55,
}

const OLD: Sprite = {
  ox: 9,
  oy: 11,
  rows: [
    '...............wwwwww',
    '..............wwwwwwww',
    '..............ssssssss',
    '..............sssssss',
    '..............ssssss',
    '...............ssss',
    '...............ssss',
    '............++######--',
    '...........+++######---',
    '........---+++######---',
    '........---+++######---',
    '........---+++######---',
    '........---+++######---',
    '........---+++######---',
    '........---+++######---',
    '........s--+++#####----',
    '........s--+++#####----',
    '........---+++#####---',
    '.........---++####---',
    '..........++#####--',
    '..........++####--',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '..........++###-###-',
    '.........++####-####-',
    '.........++####-####-',
    '.........++####-####-',
    '.........++####-####-',
  ],
  handR: [31, 26],
  handL: [18, 26],
  feetY: 54,
}

const SIT: Sprite = {
  ox: 8,
  oy: 14,
  rows: [
    '..g...................g',
    '..g...................g',
    '..g...................g',
    '..g...................g',
    '..ggggggggggggggggggggg',
    '..g...................g',
    '..g.............######g',
    '..g............########g',
    '..g............ssssssssg',
    '..g............ssssssssg',
    '..g.............ssssssg',
    '..g..............ssss.g',
    '..g..............ssss.g',
    '..g...........++######--',
    '..g..........+++######---',
    '..g.......---+++######---',
    '..g.......---+++######---',
    '..g.......---+++######---',
    '..g.......---+++######---',
    '..g.......---+++######---',
    '..g........s--+++#####---',
    '..g........s--+++#####---',
    '..ggggggggggggggggggggggg',
    '..........++##########--',
    '..........++##------##--',
    '..........++##------##--',
    '..........++#--------#--',
    '...........###------###-',
    '...........####----####-',
    '...........####----####-',
    '...........####----####-',
    '..........#####----#####',
  ],
  handR: [28, 24],
  handL: [17, 24],
  feetY: 45,
}

/* ---------- 配件精灵（同样的小 ASCII 图） ---------- */

interface Prop {
  ox: number
  oy: number
  rows: string[]
}

/** 手杖：从手的位置垂到地面，顶端一个弯钩。 */
const CANE: Prop = {
  ox: 0,
  oy: 0,
  rows: [
    '...gg',
    '..ggg',
    '.gg.g',
    '.gg..',
    '.gg..',
    '.gg..',
    '.gg..',
    '.gg..',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
    '..gg.',
  ],
}

/** 公文包：一只手提着的方箱，带提手与锁扣。 */
const CASES: Prop = {
  ox: 0,
  oy: 0,
  rows: [
    '..gggg..',
    '.g....g.',
    '.g....g.',
    'gggggggg',
    'g######g',
    'g##gg##g',
    'g##gg##g',
    'g######g',
    'gggggggg',
  ],
}

/** 酒杯：标准高脚杯（4px 杯口 → 收窄 → 1px 杯脚 → 3px 底座）。 */
const GLASS: Prop = {
  ox: 0,
  oy: 0,
  rows: [
    'wwww',
    'w..w',
    '.ww.',
    '..w.',
    '..w.',
    '.www',
  ],
}

/** 报纸：折起来的一叠（两层错位 + 一条浅色标题线）。 */
const PAPER: Prop = {
  ox: 0,
  oy: 0,
  rows: [
    '.wwwwww.',
    'wwwwwwww',
    'w------w',
    'wwwwwwww',
    '.wwwwww.',
  ],
}

/** 身边的人：成人与孩子两档身高。 */
const PARTNER: Prop = {
  ox: 0,
  oy: 0,
  rows: [
    '...sss',
    '..sssss',
    '..sssss',
    '...sss',
    '..#####',
    '.######',
    '.######',
    '.######',
    '.######',
    '.######',
    '.####-',
    '..###-',
    '..###-',
    '..###-',
    '..###-',
    '..##--',
    '..##--',
    '..##--',
    '..##--',
    '..##--',
  ],
}

const CHILD: Prop = {
  ox: 0,
  oy: 0,
  rows: [
    '..sss',
    '.sssss',
    '..sss',
    '..###',
    '.####',
    '.####',
    '.###-',
    '.###-',
    '.###-',
    '.##--',
    '.##--',
    '.##--',
    '.##--',
  ],
}

/* ---------- 调色板与绘制 ---------- */

interface PixelPalette {
  cloth: string
  lit: string
  shade: string
  skin: string
  gold: string
  white: string
}

/** 6 个色槽，全部由 opts.colors 推出来（默认值与 tokens.css 同源）。 */
function pixelPalette(c: PortraitColors, record: number): PixelPalette {
  // 案底高：整体压暗一档，而不是在身上叠斜纹
  const dk = record >= 60 ? 0.8 : record >= 30 ? 0.9 : 1
  return {
    cloth: shadeHex(c.body, dk),
    lit: shadeHex(c.body, 1.44 * dk),
    shade: shadeHex(c.body, 0.62 * dk),
    skin: shadeHex(c.rim, 0.58),
    gold: c.rim,
    white: c.hair,
  }
}

function colorOf(ch: string, p: PixelPalette): string | null {
  if (ch === '#') return p.cloth
  if (ch === '+') return p.lit
  if (ch === '-') return p.shade
  if (ch === 's') return p.skin
  if (ch === 'g') return p.gold
  if (ch === 'w') return p.white
  return null
}

interface Run {
  x: number
  len: number
  ch: string
}

/** 把一行 ASCII 合并成同色横条 —— 一帧的绘制次数靠它压到几百以内。 */
function runsOf(row: string): Run[] {
  const out: Run[] = []
  let i = 0
  while (i < row.length) {
    const ch = row[i]
    if (ch === '.' || ch === ' ') {
      i++
      continue
    }
    let j = i
    while (j + 1 < row.length && row[j + 1] === ch) j++
    out.push({ x: i, len: j - i + 1, ch: ch })
    i = j + 1
  }
  return out
}

function blit(
  ctx: PortraitCtx,
  rows: string[],
  ox: number,
  oy: number,
  baseX: number,
  baseY: number,
  scale: number,
  pal: PixelPalette,
  alpha: number,
): number {
  const fr = ctx.fillRect
  if (typeof fr !== 'function') return 0
  let calls = 0
  for (let r = 0; r < rows.length; r++) {
    const runs = runsOf(rows[r])
    for (let i = 0; i < runs.length; i++) {
      const col = colorOf(runs[i].ch, pal)
      if (!col) continue
      ctx.save()
      ctx.globalAlpha = r2(alpha)
      ctx.fillStyle = col
      fr.call(
        ctx,
        r2(baseX + (ox + runs[i].x) * scale),
        r2(baseY + (oy + r) * scale),
        r2(Math.max(1, Math.ceil(runs[i].len * scale))),
        r2(Math.max(1, Math.ceil(scale))),
      )
      ctx.restore()
      calls++
    }
  }
  return calls
}

/** scale<1 时的退化：只画最外层像素（四邻域里有一个透明就算边界）。 */
function blitOutline(
  ctx: PortraitCtx,
  rows: string[],
  ox: number,
  oy: number,
  baseX: number,
  baseY: number,
  unit: number,
  pal: PixelPalette,
): number {
  const fr = ctx.fillRect
  if (typeof fr !== 'function') return 0
  const filled = function (r: number, c: number): boolean {
    if (r < 0 || r >= rows.length) return false
    const ch = rows[r][c]
    return ch != null && ch !== '.' && ch !== ' '
  }
  let calls = 0
  for (let r = 0; r < rows.length; r++) {
    let c = 0
    while (c < rows[r].length) {
      if (!filled(r, c)) {
        c++
        continue
      }
      const edge =
        !filled(r - 1, c) || !filled(r + 1, c) || !filled(r, c - 1) || !filled(r, c + 1)
      if (!edge) {
        c++
        continue
      }
      const ch = rows[r][c]
      let end = c
      while (end + 1 < rows[r].length && rows[r][end + 1] === ch) {
        const e2 = end + 1
        const isEdge =
          !filled(r - 1, e2) || !filled(r + 1, e2) || !filled(r, e2 - 1) || !filled(r, e2 + 1)
        if (!isEdge) break
        end = e2
      }
      const col = colorOf(ch, pal)
      if (col) {
        ctx.save()
        ctx.fillStyle = col
        ctx.globalAlpha = 1
        fr.call(
          ctx,
          r2(baseX + (ox + c) * unit),
          r2(baseY + (oy + r) * unit),
          Math.max(1, Math.ceil((end - c + 1) * unit)),
          Math.max(1, Math.ceil(unit)),
        )
        ctx.restore()
        calls++
      }
      c = end + 1
    }
  }
  return calls
}

/** 轮廓档的补笔：只把头部（s/w）涂实，身体保持线框。 */
function blitHead(
  ctx: PortraitCtx,
  sprite: Sprite,
  ox: number,
  oy: number,
  unit: number,
  pal: PixelPalette,
): void {
  const fr = ctx.fillRect
  if (typeof fr !== 'function') return
  for (let r = 0; r < sprite.rows.length; r++) {
    const row = sprite.rows[r]
    let c = 0
    while (c < row.length) {
      const ch = row[c]
      if (ch !== 's' && ch !== 'w') {
        c++
        continue
      }
      const col = colorOf(ch, pal)
      let end = c
      while (end + 1 < row.length && row[end + 1] === ch) end++
      if (col) {
        ctx.save()
        ctx.fillStyle = col
        ctx.globalAlpha = 1
        fr.call(
          ctx,
          r2(ox + (sprite.ox + c) * unit),
          r2(oy + (sprite.oy + r) * unit),
          Math.max(1, Math.ceil((end - c + 1) * unit)),
          Math.max(1, Math.ceil(unit)),
        )
        ctx.restore()
      }
      c = end + 1
    }
  }
}

/** 这一张脸用哪套精灵。 */
export function spriteName(spec: PortraitSpec): 'stand' | 'slump' | 'suit' | 'old' | 'sit' {
  const s = sanitize(spec)
  if (s.mood === 'sick') return 'sit'
  if (s.age >= 70) return 'old'
  if (s.mood === 'bust' || s.mood === 'down') return 'slump'
  if (s.wealth >= 3) return 'suit'
  return 'stand'
}

function spriteOf(name: string): Sprite {
  if (name === 'slump') return SLUMP
  if (name === 'suit') return SUIT
  if (name === 'old') return OLD
  if (name === 'sit') return SIT
  return STAND
}

/**
 * 画一个人。x/y/w/h 是画框（CSS 像素），spec 决定长什么样。
 * 确定性：同一 spec + 同一画框 ⇒ 完全相同的填充指令序列（纯查表，不读时间与随机数）。
 * 尺寸：scale = floor(min(w/48, h/64))；scale < 1 时退化成轮廓剪影，只画最外层像素。
 */
export function drawPortrait(
  ctx: PortraitCtx,
  rawSpec: PortraitSpec,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: PortraitOpts = {},
): void {
  const spec = sanitize(rawSpec)
  const tr = portraitTraits(spec)
  const c: PortraitColors = {
    body: (opts.colors && opts.colors.body) || DEFAULT_PORTRAIT_COLORS.body,
    rim: (opts.colors && opts.colors.rim) || DEFAULT_PORTRAIT_COLORS.rim,
    hair: (opts.colors && opts.colors.hair) || DEFAULT_PORTRAIT_COLORS.hair,
    shade: (opts.colors && opts.colors.shade) || DEFAULT_PORTRAIT_COLORS.shade,
    accent: (opts.colors && opts.colors.accent) || DEFAULT_PORTRAIT_COLORS.accent,
    ground: (opts.colors && opts.colors.ground) || DEFAULT_PORTRAIT_COLORS.ground,
  }
  const bx = Number(x) || 0
  const by = Number(y) || 0
  const bw = Math.max(1, Number(w) || 1)
  const bh = Math.max(1, Number(h) || 1)
  const pal = pixelPalette(c, spec.record)
  const sprite = spriteOf(spriteName(spec))
  const scale = Math.floor(Math.min(bw / LOGICAL_W, bh / LOGICAL_H))
  const unit = Math.min(bw / LOGICAL_W, bh / LOGICAL_H)

  if (scale < 1) {
    // 小尺寸：只留轮廓 + 最能区分人的道具
    const ox = bx + (bw - LOGICAL_W * unit) / 2
    const oy = by + (bh - LOGICAL_H * unit) / 2
    blitOutline(ctx, sprite.rows, sprite.ox, sprite.oy, ox, oy, unit, pal)
    // 轮廓档再补两块实心：脑袋（肤色/白发）与道具 —— 48px 只看轮廓太虚，这两块负责"是谁"
    blitHead(ctx, sprite, ox, oy, unit, pal)
    drawProps(ctx, sprite, tr, ox, oy, unit, 1, pal)
    return
  }

  const ox = bx + (bw - LOGICAL_W * scale) / 2
  const oy = by + (bh - LOGICAL_H * scale) / 2

  // 地面：脚下两行暗色
  if (opts.ground !== false) {
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.fillStyle = c.ground
    if (ctx.fillRect) ctx.fillRect(r2(ox + 12 * scale), r2(oy + sprite.feetY * scale), r2(24 * scale), r2(2 * scale))
    ctx.restore()
  }

  // 身侧的人先画（在后面）
  if (tr.companions > 0) {
    drawCompanions(ctx, sprite, tr.companions, ox, oy, scale, pal)
  }

  blit(ctx, sprite.rows, sprite.ox, sprite.oy, ox, oy, scale, pal, 1)
  drawProps(ctx, sprite, tr, ox, oy, scale, scale, pal)
}

/** 手杖 / 公文包 / 酒杯 / 报纸：贴到精灵自带的手部锚点上。 */
function drawProps(
  ctx: PortraitCtx,
  sprite: Sprite,
  tr: PortraitTraits,
  ox: number,
  oy: number,
  unit: number,
  scale: number,
  pal: PixelPalette,
): void {
  const u = Math.max(unit, scale)
  if (tr.cane) {
    // 杖从手的位置垂到地面：穿在掌心里，不挂在身体外面
    blit(ctx, CANE.rows, 0, 0, ox + (sprite.handR[0] - 2) * unit, oy + (sprite.feetY - CANE.rows.length) * unit, unit, pal, 1)
  }
  if (tr.briefcase) {
    // 手杖已经在右手了：包就换到左手，两件道具别打架
    const hx = tr.cane ? sprite.handL[0] : sprite.handR[0]
    const hy = tr.cane ? sprite.handL[1] : sprite.handR[1]
    blit(ctx, CASES.rows, 0, 0, ox + (hx - 4) * unit, oy + (hy + 2) * unit, unit, pal, 1)
  }
  if (tr.glass) {
    blit(ctx, GLASS.rows, 0, 0, ox + (sprite.handL[0] - 2) * unit, oy + (sprite.handL[1] - 7) * unit, unit, pal, 1)
  }
  if (tr.paper) {
    blit(ctx, PAPER.rows, 0, 0, ox + (sprite.handL[0] - 5) * unit, oy + (sprite.handL[1] - 4) * unit, unit, pal, 0.85)
  }
}

function drawCompanions(
  ctx: PortraitCtx,
  sprite: Sprite,
  n: number,
  ox: number,
  oy: number,
  scale: number,
  pal: PixelPalette,
): void {
  const feet = oy + sprite.feetY * scale
  if (n >= 1) {
    const h = PARTNER.rows.length * scale
    blit(ctx, PARTNER.rows, 0, 0, ox + 2 * scale, feet - h, scale, pal, 0.92)
  }
  if (n >= 2) {
    const h = CHILD.rows.length * scale
    blit(ctx, CHILD.rows, 0, 0, ox + 40 * scale, feet - h, scale, pal, 0.92)
  }
}
/* ---------- 胸像（结局 / 事件用） ---------- */

/**
 * 32×40 的逻辑网格，分区（行）：
 *   0–4  头发（含发际线）
 *   5–7  额头（年龄纹按需叠加）
 *   8–11 眉眼带（眉 / 眼 / 眼下阴影，逐情绪替换）
 *   12–14 面颊
 *   15–16 嘴
 *   17–20 下巴与脖子
 *   21–24 领口（工装圆领 / 衬衫翻领 / 西装驳领 + 领带 + 口袋巾）
 *   25–39 肩与胸
 * 脸只画眉、眼、嘴（没有鼻子）：情绪全部落在眉的角度、眼的开合、嘴的角上。
 */
const BUST_W = 32
const BUST_H = 40

const BUST_BASE: string[] = [
  '...........wwwwwwwwww...........',
  '..........wwwwwwwwwwww..........',
  '.........wwwwwwwwwwwwww.........',
  '.........wwssssssssssww.........',
  '..........wssssssssssw..........',
  '..........ssssssssssss..........',
  '..........ssssssssssss..........',
  '..........ssssssssssss..........',
  '..........ssssssssssss..........',
  '..........ssssssssssss..........',
  '..........ssssssssssss..........',
  '...........ssssssssss...........',
  '...........ssssssssss...........',
  '............ssssssss............',
  '............ssssssss............',
  '.............ssssss.............',
  '..............ssss..............',
  '..............ssss..............',
  '...........####ss####...........',
  '.........##############.........',
  '.......###################......',
  '.....#######################....',
  '.......###################......',
  '.....#######################....',
  '...###########################..',
  '..############################..',
  '..############################..',
  '..############################..',
  '..############################..',
  '..############################..',
  '..############################..',
  '..############################..',
  '..############################..',
  '..############################..',
  '..############################..',
  '..############################..',
  '..############################..',
  '..############################..',
  '..############################..',
  '..############################..',
]

/** 眉眼带（12 宽 × 6 高，贴在网格 10..21 列 / 6..11 行）。 */
const FACE_EYES: Record<string, string[]> = {
  calm: [
    '............',
    '............',
    '..---..---..',
    '............',
    '..--....--..',
    '............',
    '............',
  ],
  up: [
    '............',
    '..---..---..',
    '............',
    '..--....--..',
    '............',
    '............',
    '............',
  ],
  down: [
    '............',
    '............',
    '..---..---..',
    '............',
    '............',
    '..--....--..',
    '............',
  ],
  bust: [
    '............',
    '............',
    '..---..---..',
    '............',
    '..--........',
    '........--..',
    '..---..---..',
  ],
  sick: [
    '............',
    '............',
    '..---..---..',
    '............',
    '..--....--..',
    '............',
    '............',
  ],
}

/** 嘴（12 宽 × 1 行）。 */
const FACE_MOUTH: Record<string, string> = {
  calm: '....----....',
  up: '.....--.-...',
  down: '....-..-....',
  bust: '...------...',
  sick: '.....--.....',
}

const MOUTH_ROW: Record<string, number> = { calm: 13, up: 12, down: 14, bust: 14, sick: 13 }

/** 领口（12 宽 × 5 高，贴在网格 10..21 列 / 22..26 行）。 */
const COLLAR: Record<string, string[]> = {
  work: [
    '.+++++++++.',
    '.---------.',
    '..........',
  ],
  shirt: [
    '.--....--.',
    '.--....--.',
    '....--....',
  ],
  suit: [
    '.--....--.',
    '.--.gg.--.',
    '....gg....',
    '....gg....',
    '....gg....',
  ],
}

/** 把一块 ASCII 补丁盖到网格上（'.' 表示这里保持原样，是透明而不是擦除）。 */
function stamp(rows: string[], patch: string[], atRow: number, atCol: number): string[] {
  const out = rows.slice()
  for (let r = 0; r < patch.length; r++) {
    const target = atRow + r
    if (target < 0 || target >= out.length) continue
    let line = out[target]
    if (line.length < BUST_W) line = line + '.'.repeat(BUST_W - line.length)
    const chars = line.split('')
    for (let c = 0; c < patch[r].length; c++) {
      const ch = patch[r][c]
      if (ch === '.' || ch === ' ') continue
      const at = atCol + c
      if (at < 0 || at >= BUST_W) continue
      chars[at] = ch
    }
    out[target] = chars.join('')
  }
  return out
}

function bustRows(spec: PortraitSpec, tr: PortraitTraits): string[] {
  let rows = BUST_BASE
  const mood = spec.mood
  // 案底：帽檐压在眉上（一行暗块）+ 脸下半压暗一档
  if (spec.record >= 30) {
    rows = stamp(rows, ['..------------..'], 4, 9)
    rows = stamp(rows, ['-----..-----'], 15, 10)
    rows = stamp(rows, ['-----..-----'], 16, 10)
  }
  // 额头皱纹：45 岁起一条，62 岁起两条
  if (spec.age >= 45) rows = stamp(rows, ['..----..--..'], 6, 10)
  if (spec.age >= 62) rows = stamp(rows, ['....--..--..'], 5, 10)
  // 眉 + 眼（含眼下阴影）
  rows = stamp(rows, FACE_EYES[mood] || FACE_EYES.calm, 5, 10)
  // 嘴
  rows = stamp(rows, [FACE_MOUTH[mood] || FACE_MOUTH.calm], MOUTH_ROW[mood] || 13, 10)
  // 70 岁：两撇白眉毛 + 下巴一小撮白胡子（不画眼镜：32px 内两条横梁会读成蒙眼）
  if (spec.age >= 70) {
    rows = stamp(rows, ['..---..---..'], 5, 10)
    rows = stamp(rows, ['...ww..ww...'], 15, 10)
  }
  // 领口
  const collar = COLLAR[tr.garment] || COLLAR.work
  rows = stamp(rows, collar, 20, 11)
  // 西装：口袋巾
  if (tr.garment === 'suit') rows = stamp(rows, ['gg'], 27, 24)
  return rows
}

/** 胸像版调色板：白发/苍老/苍白都在 'w' 与 skin 两个槽上。 */
function bustPalette(c: PortraitColors, spec: PortraitSpec): PixelPalette {
  const p = pixelPalette(c, spec.record)
  const age = spec.age
  const hair = age >= 70 ? c.hair : age >= 50 ? shadeHex(c.hair, 0.62) : shadeHex(c.body, 0.7)
  const warm = mixHex(c.rim, c.hair, 0.42)
  const skin = spec.mood === 'sick' ? mixHex(warm, c.hair, 0.55) : warm
  return { cloth: p.cloth, lit: p.lit, shade: p.shade, skin: skin, gold: p.gold, white: hair }
}

/** 肩后的小人剪影（family >= 60 才有），只画轮廓。 */
const BUST_COMPANION: string[] = [
  '..ss..',
  '.ssss.',
  '..ss..',
  '.####.',
  '######',
  '######',
  '######',
  '######',
  '######',
  '######',
]

/**
 * 画一张胸像。x/y/w/h 是画框，spec 决定长什么样。
 * 确定性：同 spec 同画框 ⇒ 完全相同的填充指令序列。
 * scale = floor(min(w/32, h/40))；scale < 1 时退化为轮廓剪影（只画最外层像素 + 五官）。
 */
export function drawBust(
  ctx: PortraitCtx,
  rawSpec: PortraitSpec,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: PortraitOpts = {},
): void {
  const spec = sanitize(rawSpec)
  const tr = portraitTraits(spec)
  const c: PortraitColors = {
    body: (opts.colors && opts.colors.body) || DEFAULT_PORTRAIT_COLORS.body,
    rim: (opts.colors && opts.colors.rim) || DEFAULT_PORTRAIT_COLORS.rim,
    hair: (opts.colors && opts.colors.hair) || DEFAULT_PORTRAIT_COLORS.hair,
    shade: (opts.colors && opts.colors.shade) || DEFAULT_PORTRAIT_COLORS.shade,
    accent: (opts.colors && opts.colors.accent) || DEFAULT_PORTRAIT_COLORS.accent,
    ground: (opts.colors && opts.colors.ground) || DEFAULT_PORTRAIT_COLORS.ground,
  }
  const bx = Number(x) || 0
  const by = Number(y) || 0
  const bw = Math.max(1, Number(w) || 1)
  const bh = Math.max(1, Number(h) || 1)
  const pal = bustPalette(c, spec)
  const rows = bustRows(spec, tr)
  const scale = Math.floor(Math.min(bw / BUST_W, bh / BUST_H))
  const unit = Math.min(bw / BUST_W, bh / BUST_H)

  const sprite: Sprite = { ox: 0, oy: 0, rows: rows, handR: [0, 0], handL: [0, 0], feetY: BUST_H }

  if (scale < 1) {
    const ox0 = bx + (bw - BUST_W * unit) / 2
    const oy0 = by + (bh - BUST_H * unit) / 2
    blitOutline(ctx, rows, 0, 0, ox0, oy0, unit, pal)
    blitHead(ctx, sprite, ox0, oy0, unit, pal)
    return
  }

  const ox = bx + (bw - BUST_W * scale) / 2
  const oy = by + (bh - BUST_H * scale) / 2

  // 很淡的斜纹背景（与战场报同一套手法：一条条半透明平行四边形）
  if (opts.ground !== false) {
    for (let i = 0; i < 5; i++) {
      const yy = oy + (i * bh) / 5
      ctx.save()
      ctx.globalAlpha = 0.05
      ctx.fillStyle = c.rim
      if (ctx.fillRect) ctx.fillRect(r2(ox), r2(yy), r2(BUST_W * scale), r2(Math.max(1, scale)))
      ctx.restore()
    }
  }

  // 肩后的小人剪影（family >= 60）
  if (tr.companions > 0) {
    const h2 = (BUST_COMPANION.length * scale) / 2
    blit(ctx, BUST_COMPANION, 0, 0, ox + (BUST_W - 9) * scale, oy + (BUST_H - 9) * scale, scale, pal, 0.45)
    if (tr.companions > 1) {
      blit(ctx, BUST_COMPANION, 0, 0, ox + (BUST_W - 5) * scale, oy + (BUST_H - 7) * scale, scale, pal, 0.35)
    }
    void h2
  }

  blit(ctx, rows, 0, 0, ox, oy, scale, pal, 1)
}
/* ---------- 象征物（结局卡右下角那一件，32×32 网格） ---------- */

export type StillKind = 'glass' | 'case' | 'paper' | 'cane' | 'pill'

const STILL_GLASS: string[] = [
  '.......wwww.......',
  '......w....w......',
  '......w....w......',
  '.......w..w.......',
  '.......w..w.......',
  '........ww........',
  '........ww........',
  '........ww........',
  '........ww........',
  '.......wwww.......',
]

const STILL_CASE: string[] = [
  '........gg........',
  '.......g..g.......',
  '..##############..',
  '..#............#..',
  '..#............#..',
  '..#.....gg.....#..',
  '..#.....gg.....#..',
  '..#............#..',
  '..##############..',
]

const STILL_CANE: string[] = [
  '....gggg..........',
  '...gg..gg.........',
  '...gg...gg........',
  '....gg..gg........',
  '.....gg.gg........',
  '......ggg.........',
  '......gg..........',
  '......gg..........',
  '......gg..........',
  '......gg..........',
  '......gg..........',
  '......gg..........',
  '......gg..........',
  '......gg..........',
  '......gg..........',
  '......gg..........',
]

const STILL_PILL: string[] = [
  '.....wwwwww.......',
  '.....w....w.......',
  '....##########....',
  '....#........#....',
  '....#........#....',
  '....#...gg...#....',
  '....#..ggg...#....',
  '....#...gg...#....',
  '....#........#....',
  '....##########....',
]

function stillRows(kind: StillKind): string[] {
  if (kind === 'glass') return STILL_GLASS
  if (kind === 'case') return STILL_CASE
  if (kind === 'cane') return STILL_CANE
  return STILL_PILL
}

/**
 * 画一件象征物：32×32 逻辑网格，物体 20 宽居中。
 * scale = floor(min(w/32, h/32))；小于 1 时按 1px 画（物体会缩小而不是糊掉）。
 *
 * 报纸（paper）的几何不在这里：它挪到了共享层 src/ui/share/stillLife.ts 的 drawPaper ——
 * 原先那张 18×9 的白点阵放大后读不出东西，H5 结局卡与小游戏结局屏因此一起改走同一份几何。
 * 另外四件的点阵稀疏、轮廓明确，继续留在本文件（对外签名与画法都没变）。
 */
export function drawStillLife(
  ctx: PortraitCtx,
  kind: StillKind,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: PortraitOpts = {},
): void {
  if (kind === 'paper') {
    drawPaper(ctx, x, y, w, h)
    return
  }
  const c: PortraitColors = {
    body: (opts.colors && opts.colors.body) || DEFAULT_PORTRAIT_COLORS.body,
    rim: (opts.colors && opts.colors.rim) || DEFAULT_PORTRAIT_COLORS.rim,
    hair: (opts.colors && opts.colors.hair) || DEFAULT_PORTRAIT_COLORS.hair,
    shade: (opts.colors && opts.colors.shade) || DEFAULT_PORTRAIT_COLORS.shade,
    accent: (opts.colors && opts.colors.accent) || DEFAULT_PORTRAIT_COLORS.accent,
    ground: (opts.colors && opts.colors.ground) || DEFAULT_PORTRAIT_COLORS.ground,
  }
  const pal: PixelPalette = {
    cloth: c.body,
    lit: shadeHex(c.body, 1.35),
    shade: shadeHex(c.body, 0.6),
    skin: c.rim,
    gold: c.rim,
    white: c.hair,
  }
  const bx = Number(x) || 0
  const by = Number(y) || 0
  const bw = Math.max(1, Number(w) || 1)
  const bh = Math.max(1, Number(h) || 1)
  const rows = stillRows(kind)
  const scale = Math.max(1, Math.floor(Math.min(bw / 32, bh / 32)))
  const gridW = 20
  const gridH = rows.length
  const ox = bx + (bw - (32 * scale)) / 2 + (32 - gridW) / 2 * scale
  const oy = by + (bh - (32 * scale)) / 2 + (32 - gridH) / 2 * scale
  blit(ctx, rows, 0, 0, ox, oy, scale, pal, 1)
}
