/**
 * 表现层状态机：只认注入的 ctx / storage / sfx / poster，不认任何平台全局。
 * 平台差异全部收在 runtime/ 两个文件里（H5 一套、微信一套）。
 *
 * 输入是手势不是点：down → move… → up。整页滚动、日志内层滚动、上下限、惯性都在这里；
 * view 只管画，Layout 负责把同一个滚动偏移同时加给「画」和「命中」。
 *
 * 时间只有两个来源：frame(dt) 推进动效（逐层仪式 + 金额补间 + 轻提示倒计时），
 * 以及手势差算出来的惯性速度。布局不读系统时间，所以同 seed 同 dt 连出来的帧是逐字一致的。
 */
import type { GameState, LogItem, Mode, RngLike, SectorId, StepOutcome } from '../core'
import {
  AP_EXHAUSTED_TEXT,
  buildQuarters,
  chooseEvent,
  chooseLate,
  chooseYear,
  createGame,
  createRng,
  currentQuarter,
  deserialize,
  endView,
  fmt,
  lateStep,
  ORG,
  probeIntel,
  runAct,
  SAVE_KEY,
  serialize,
  setPosition,
  setSector,
  step,
  stepYear,
  toggle,
} from '../core'
// 挑战码 / 天赋 / 结局长图三件都是纯函数模块（只 import core 的类型），原样给小游戏用。
import { decodeChallenge, encodeChallenge, randomSeed } from '../core/challenge'
import { talentName } from '../core/data/talents'
import { award, carryTalent, META_KEY, parseMeta, serializeMeta, talentRows, unlock } from '../core/meta'
import type { MetaState, TalentRow } from '../core/meta'
import { yearlySeries } from '../ui/share/endChart'
import { CountUp, NOTICE_TTL, Ritual } from './anim'
import { Layout, inside } from './layout'
import type { HitRegion } from './layout'
import { buildLogRows, LOG_AREA_ID, logRowH, logViewH, maxOffset } from './logrows'
import type { LogRow } from './logrows'
import { notice as drawNotice } from './paint'
import type { Ctx2D } from './paint'
import type { PosterSink } from './posterjob'
import { readSenses, writeSenses } from './sfx'
import type { HapticKind, HapticPlay, Senses, SfxKind, SfxPlay } from './sfx'
import { C } from './theme'
import { renderEvent } from './views/event'
import { renderOrg } from './views/org'
import type { OrgData } from './views/org'
import { renderOver } from './views/over'
import { renderResume } from './views/resume'
import { renderTalent } from './views/talent'
import { renderTrade } from './views/trade'
import type { TradeData } from './views/trade'

/** 六屏：出身 / 带天赋 / 交易 / 待选事件（层叠卡）/ 结局 / 续玩。 */
export type Screen = 'org' | 'talent' | 'trade' | 'event' | 'over' | 'resume'

/** 平台层必须给的最小存储。 */
export interface Storage {
  get(key: string): string | null
  set(key: string, value: string): void
}

/**
 * 剪贴板。小游戏侧走微信的 getClipboardData / setClipboardData（在 runtime 的 wx 层里），
 * H5 侧走 navigator.clipboard —— 表现层只认这两个方法，不认平台。
 */
export interface ClipHost {
  /** 读剪贴板；读不到就给空串（不许抛，调用方不 try）。 */
  read(): Promise<string>
  /** 写剪贴板；写不进去自己吞掉（用户会看到那句提示，但这一局不该停）。 */
  write(text: string): void
}

export interface GameOptions {
  ctx: Ctx2D
  width: number
  height: number
  storage?: Storage
  /** 固定种子（截图 / 复现用）；不给就开局时随机一个，并把它印成挑战码。 */
  seed?: number
  /** 放一声（平台层给）；不给就是静音，照样能玩。 */
  sfx?: SfxPlay
  /** 震一下（平台层给）；不给就不震，照样能玩。 */
  haptic?: HapticPlay
  /** 战报导出（平台层给）；不给就没有「生成战报」这条路。 */
  poster?: PosterSink
  /** 剪贴板（平台层给）；不给就只显示挑战码，不摆复制/粘贴按钮。 */
  clip?: ClipHost
}

/** 日志只留最近这么多条（内存与重绘成本都固定）。 */
const LOG_KEEP = 60
/** 存档槽：写在这里、启动时也从这里读（续玩）。 */
const SAVE_SLOT = SAVE_KEY + ':mg1'
/** 结局仪式：一层 0.26 秒、六层；金额补间 0.9 秒（与 H5 的 EndCard 同一节奏）。 */
const LAYER_S = 0.26
const LAYERS = 6
const COUNT_S = 0.9
/** 交易页两个数字的补间时长（秒）：比结局那 0.9 短，连点过季不能有拖尾感。 */
const TWEEN_S = 0.45

/** 手势判定：累计位移超过它就算滑动，不再触发点击。 */
const DRAG_MIN = 6
/** 惯性：每秒衰减系数（v ← v·e^(−k·dt)）。 */
const FRICTION = 4.2
/** 惯性收尾与限速（px/s）。 */
const V_MIN = 24
const V_MAX = 3200
/** 松手后还在飞的判定：大于它时「按下」只负责刹车，不顺带点中按钮。 */
const V_TAP_STOP = 260
/** 长按阈值（秒）：按住挑战码不动这么久就复制。时间只从 frame(dt) 里来。 */
const LONG_PRESS_S = 0.55

export class Game {
  private ctx: Ctx2D
  private w: number
  private h: number
  private storage: Storage | null
  /** 这一局的种子：启动就定下来（开局屏上那个挑战码印的就是它）。 */
  private seed: number
  private mode: Mode = 'real'
  private rng: RngLike | null = null
  private state: GameState | null = null
  private logs: LogItem[] = []
  private rows: LogRow[] = []
  private screen: Screen = 'org'
  private layout: Layout

  /** 跨局记忆（记忆点 / 已解锁天赋 / 本局带的天赋）：独立存档槽，坏了当空档。 */
  private meta: MetaState
  private clip: ClipHost | null
  /** 出身选了哪一张、等着在天赋屏上把这局开起来。 */
  private orgPick: number | null = null
  /** 这一局带进来的天赋 id（null = 没带）。 */
  private carried: string | null = null
  /** 走到结局时结算到的记忆点。 */
  private endEarned = 0
  /** 36 年指数年线（进结局时算一次，画的时候只读）。 */
  private chart: number[] = []
  /** 长按计时：按住挑战码时才有值（时间由 frame(dt) 累加）。 */
  private holding: { left: number } | null = null

  /** 每屏各自的整页滚动（px）：换屏不会把上一屏的位置带过去。 */
  private scrolls: Record<Screen, number> = { org: 0, talent: 0, trade: 0, event: 0, over: 0, resume: 0 }
  private maxScroll = 0
  /** 日志内层滚动（px，行高整数倍）。 */
  private logScroll = 0
  /** 展开的门（七扇门之一）。 */
  private openGate: string | null = null

  /** 结局六层仪式与金额补间：都只由 frame(dt) 推进。 */
  private ritual = new Ritual(LAYERS, LAYER_S)
  private count = new CountUp(0, COUNT_S)
  /** 交易页那两个数（资产大字 / 本季 Δ）：结算时滚动，连点就跳到终值再开下一段。 */
  private assetTween = new CountUp(0, TWEEN_S)
  private deltaTween = new CountUp(0, TWEEN_S)
  /** 一行轻提示（行动点用完 / 音效开关 / 海报结果）：不占布局、不接点击。 */
  private notice: { text: string; left: number } | null = null

  private sens: Senses
  private sfxHost: SfxPlay | null
  private hapticHost: HapticPlay | null
  private posterSink: PosterSink | null
  /** 启动时读到的存档（有它就先进续玩那一屏）。 */
  private saved: GameState | null = null

  /** 本次推进的基准资产（只记推进前，不做任何规则计算）。 */
  private deltaBase: number | null = null
  private delta: number | null = null
  private deltaPct: number | null = null
  private deltaLabel = '本季 Δ'
  /** 本次推进产出的日志该盖哪一年（推进前看到的年份）。 */
  private stampYear: number | null = null

  /** 手势：起点、目标层、是否已经在滑。 */
  private from = { x: 0, y: 0, page: 0, log: 0 }
  private dragging = false
  private dragLog = false
  private suppressTap = false
  /** 正按着的命中区 id（null = 没按）：按下态只在绘制时叠一层，不改任何数据。 */
  private pressed: string | null = null
  private vPage = 0
  private vLog = 0
  /** 上一帧末的滚动位置：拖动中的速度靠它与当前值的差算出来（move 本身没有时间）。 */
  private lastPage = 0
  private lastLog = 0

  constructor(o: GameOptions) {
    this.ctx = o.ctx
    this.w = o.width
    this.h = o.height
    this.storage = o.storage || null
    // 种子在启动时就定：开局屏要印一张码出来，码里装的必须是这一局真正要用的那个 seed
    this.seed = typeof o.seed === 'number' ? o.seed : randomSeed()
    this.sfxHost = o.sfx || null
    this.hapticHost = o.haptic || null
    this.posterSink = o.poster || null
    this.clip = o.clip || null
    const st = this.storage
    this.sens = readSenses(st ? (k) => st.get(k) : null)
    this.meta = parseMeta(this.storageGet(META_KEY))
    this.layout = new Layout(o.width, o.height)
    this.saved = this.readSave()
    if (this.saved) this.screen = 'resume'
  }

  get view(): Screen {
    return this.screen
  }

  get game(): GameState | null {
    return this.state
  }

  /** 启动时读到的那局（续玩弹层显示它；接下去之后就没有了）。 */
  get pendingSave(): GameState | null {
    return this.saved
  }

  /** 整页滚动偏移（px）；测试与截图脚本用它核对命中是否同步。 */
  get scrolled(): number {
    return this.scrolls[this.screen]
  }

  get logScrolled(): number {
    return this.logScroll
  }

  /** 当前展开的门。 */
  get gate(): string | null {
    return this.openGate
  }

  get deltaNow(): { delta: number | null; pct: number | null; label: string } {
    return { delta: this.delta, pct: this.deltaPct, label: this.deltaLabel }
  }

  get sfxEnabled(): boolean {
    return this.sens.sfx
  }

  get hapticEnabled(): boolean {
    return this.sens.haptic
  }

  /** 正按着的命中区（null = 没按）：按下态画在哪由它决定。 */
  get pressedId(): string | null {
    return this.pressed
  }

  /** 交易页资产大字的补间现值（测试与截图脚本直接读，不用猜帧）。 */
  get assetNow(): number {
    return this.assetTween.value
  }

  /** 开局屏上印的那张码：里面装的就是这一局真正要用的 seed + 模式。 */
  get challengeCode(): string {
    return encodeChallenge(this.seed, this.mode)
  }

  get seedValue(): number {
    return this.seed
  }

  get modeNow(): Mode {
    return this.mode
  }

  /** 平台层给不给剪贴板（不给就只显示码，不摆按不动的按钮）。 */
  get hasClipboard(): boolean {
    return !!this.clip
  }

  /** 手上还没花掉的记忆点。 */
  get metaPoints(): number {
    return this.meta.points
  }

  /** 天赋屏真正摆出来的三行：解锁的在前（能带），锁着的按价钱跟在后面。 */
  get talentOffer(): TalentRow[] {
    return offerRows(this.meta)
  }

  /** 这一局带进来的天赋 id（null = 没带）。 */
  get carriedTalent(): string | null {
    return this.carried
  }

  /** 走到结局时结算到的记忆点（重复进结局页是 0）。 */
  get earnedPoints(): number {
    return this.endEarned
  }

  /** 当前那行轻提示的原文（没有就是 null）。单测与截图脚本读它。 */
  get noticeNow(): string | null {
    return this.notice ? this.notice.text : null
  }

  /** 六层的淡入进度（0..1）；结局屏与单测共用。 */
  get layers(): number[] {
    return this.ritual.alphas()
  }

  get ritualDone(): boolean {
    return this.ritual.done
  }

  /** 金额补间当前值（收敛到 s.asset）。 */
  get countedAsset(): number {
    return this.count.value
  }

  /** 上一帧登记的命中区域（按绘制顺序）。自检与单测从这里拿坐标，不猜布局。 */
  regions(): HitRegion[] {
    return this.layout.regions()
  }

  resize(w: number, h: number): void {
    this.w = w
    this.h = h
    this.layout = new Layout(w, h)
    this.render()
  }

  /* ---------------- 手势 ---------------- */

  /** 按下：刹车 + 记住起点 + 判断这一手是滚页面还是滚日志（内层先消费）。 */
  down(x: number, y: number): void {
    const flying = Math.abs(this.vPage) > V_TAP_STOP || Math.abs(this.vLog) > V_TAP_STOP
    this.vPage = 0
    this.vLog = 0
    this.suppressTap = flying
    this.from = { x: x, y: y, page: this.scrolled, log: this.logScroll }
    this.lastPage = this.scrolled
    this.lastLog = this.logScroll
    this.dragging = false
    // 只有交易页有内层滚动；事件卡 / 结局屏 / 续玩层整屏滚
    const area = this.screen === 'trade' ? this.layout.regionOf(LOG_AREA_ID) : null
    this.dragLog = !!area && inside(area, x, y)
    // 按在哪就记哪里：按下态是纯绘制层的东西，up / 滑过 6px / cancel 都会清掉
    const id = this.layout.tap(x, y)
    this.pressed = id !== null && pressable(id) ? id : null
    // 按在挑战码上就开始计时：小游戏没有 DOM，长按只能自己数 dt（见 frame）
    this.holding = id === 'code:copy' ? { left: LONG_PRESS_S } : null
  }

  /** 拖动：超过阈值才算滑动；日志区先消费，到底后不再传给整页（嵌套边界清楚）。 */
  move(x: number, y: number): void {
    const dy = y - this.from.y
    if (!this.dragging && Math.abs(dy) > DRAG_MIN) {
      this.dragging = true
      this.pressed = null
    }
    if (!this.dragging) return
    if (this.dragLog) {
      const rh = logRowH()
      const raw = this.from.log - dy
      const max = maxOffset(this.rows.length, logViewH())
      const clamped = raw < 0 ? 0 : raw > max ? max : raw
      this.logScroll = Math.round(clamped / rh) * rh
    } else {
      const max = this.maxScroll
      const raw = this.from.page - dy
      this.scrolls[this.screen] = raw < 0 ? 0 : raw > max ? max : raw
    }
  }

  /** 松手：没滑动就是一记点击（滑过就不点，防止误触）。 */
  up(): void {
    const dragged = this.dragging
    const held = this.suppressTap
    this.holding = null
    this.dragging = false
    this.suppressTap = false
    this.pressed = null
    if (dragged || held) return
    this.tapAt(this.from.x, this.from.y)
  }

  /** 兼容单点点击（自检与老测试）：等价于原地 down + up。 */
  tap(x: number, y: number): void {
    this.down(x, y)
    this.up()
  }

  /** 惯性 + 动效：由平台层每帧把 dt 交进来，不用 rAF 直接算。 */
  frame(dt: number): void {
    const d = dt > 0.05 ? 0.05 : dt
    if (this.dragging) {
      // 拖动中只采样速度（与上一帧末的差 / dt），松手后才有惯性
      if (d > 0) {
        if (this.dragLog) this.vLog = clampV((this.logScroll - this.lastLog) / d)
        else this.vPage = clampV((this.scrolled - this.lastPage) / d)
      }
    } else {
      this.glide('page', d)
      this.glide('log', d)
    }
    this.lastPage = this.scrolled
    this.lastLog = this.logScroll
    // 动效：逐层仪式、金额补间、轻提示倒计时（全部按注入的 dt 走）
    this.ritual.advance(d)
    this.count.advance(d)
    this.assetTween.advance(d)
    this.deltaTween.advance(d)
    // 长按挑战码：按住不动累计到阈值就复制，这一手不再算点击（suppressTap）
    if (this.holding && d > 0 && !this.dragging) {
      this.holding.left -= d
      // 阈值比较留一点浮点余量：0.05 连减十一次不等于 0
      if (this.holding.left <= 0.0001) {
        this.holding = null
        this.suppressTap = true
        this.copyCode()
      }
    }
    if (this.notice && d > 0) {
      this.notice.left -= d
      if (this.notice.left <= 0) this.notice = null
    }
  }

  /** 直接设定滚动位置（截图脚本用；手势仍然走 down/move/up）。 */
  scrollPage(y: number): void {
    // maxScroll 是上一次 render 的产物：换屏后它可能还没算出来，先量一次再夹
    if (this.maxScroll <= 0) this.render()
    const s = this.scrolls[this.screen]
    this.scrolls[this.screen] = Math.max(0, Math.min(this.maxScroll, y))
    if (this.scrolls[this.screen] !== s) this.render()
  }

  scrollLog(y: number): void {
    this.logScroll = Math.max(0, Math.min(maxOffset(this.rows.length, logViewH()), y))
  }

  /* ---------------- 渲染 ---------------- */

  render(): void {
    const ctx = this.ctx
    ctx.globalAlpha = 1
    ctx.fillStyle = C.bg0
    ctx.fillRect(0, 0, this.w, this.h)
    let L = this.paint(this.scrolled)
    const max = this.maxFromLayout(L)
    if (this.scrolled > max) {
      // 内容变短了（换屏 / 收门）：先夹住再重画一遍，避免整帧错位
      this.scrolls[this.screen] = max
      L = this.paint(max)
    }
    this.layout = L
    this.maxScroll = max
    this.drawPress()
    this.drawNotice()
  }

  private paint(scrollY: number): Layout {
    const L = new Layout(this.w, this.h)
    const g = this.state
    if (this.screen === 'org') {
      renderOrg(this.ctx, L, this.orgData())
    } else if (this.screen === 'talent') {
      L.at(scrollY)
      renderTalent(this.ctx, L, {
        rows: offerRows(this.meta),
        points: this.meta.points,
        orgName: ORG[this.orgPick == null ? 0 : this.orgPick].k,
      })
    } else if (this.screen === 'resume' && this.saved) {
      // 下面那屏是出身页：用一个一次性 Layout 画（它的命中不该抢续玩层的）
      renderOrg(this.ctx, new Layout(this.w, this.h), this.orgData())
      renderResume(this.ctx, L, this.saved)
    } else if (this.screen === 'event' && g) {
      // 交易页留在下面被压暗（一次性 Layout：命中全部作废，遮罩负责挡住）
      const back = new Layout(this.w, this.h)
      back.at(this.scrolls.trade)
      renderTrade(this.ctx, back, this.tradeData())
      L.at(scrollY)
      renderEvent(this.ctx, L, g)
    } else if (this.screen === 'trade' && g) {
      L.at(scrollY)
      renderTrade(this.ctx, L, this.tradeData())
    } else if (g) {
      L.at(scrollY)
      renderOver(this.ctx, L, g, {
        alpha: this.ritual.alphas(),
        asset: this.count.value,
        done: this.ritual.done,
        chart: this.chart,
        talent: talentName(this.carried != null ? this.carried : this.meta.currentTalent),
        earned: this.endEarned,
        points: this.meta.points,
      })
    }
    return L
  }

  private tradeData(): TradeData {
    return {
      state: this.state as GameState,
      rows: this.rows,
      logScroll: this.logScroll,
      openGate: this.openGate,
      delta: this.delta === null ? null : this.deltaTween.value,
      deltaPct: this.delta === null || !this.deltaBase ? null : (this.deltaTween.value / this.deltaBase) * 100,
      deltaLabel: this.deltaLabel,
      asset: this.assetTween.value,
      sfxOn: this.sens.sfx,
      hapticOn: this.sens.haptic,
    }
  }

  private maxFromLayout(L: Layout): number {
    // 续玩层是居中的弹层，不滚；其余四屏装不下就整页滚（出身屏加了挑战码面板，矮屏要能滚到底）
    if (this.screen === 'resume') return 0
    return L.maxScroll()
  }

  /**
   * 按下态：在命中区里侧描一圈 1px 的边（不位移、不缩放，松手就没了）。
   * 叠在绘制之后、命中之前 —— 它不改任何坐标，所以画在哪就还是点在哪。
   */
  private drawPress(): void {
    const id = this.pressed
    if (!id) return
    const r = this.layout.regionOf(id)
    if (!r || r.w < 3 || r.h < 3) return
    const ctx = this.ctx
    // 提亮色而不是金色：实心金按钮上再描一圈金等于没画（v2b-press.png 第一版就是这样）
    ctx.fillStyle = C.ink0
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 1)
    ctx.fillRect(r.x + 1, r.y + r.h - 2, r.w - 2, 1)
    ctx.fillRect(r.x + 1, r.y + 1, 1, r.h - 2)
    ctx.fillRect(r.x + r.w - 2, r.y + 1, 1, r.h - 2)
  }

  /** 轻提示：浮在屏幕底部，画在布局之外（不进命中、不改内容高度）。 */
  private drawNotice(): void {
    const n = this.notice
    if (!n) return
    drawNotice(this.ctx, n.text, this.w / 2, this.h - 52, this.w - 32)
  }

  /* ---------------- 分发 ---------------- */

  private tapAt(x: number, y: number): void {
    const id = this.layout.tap(x, y)
    if (!id) return
    // 有效点击：响一声 + 震一下。两件事各有各的开关，都在这一层判断，平台层只管执行。
    this.play('click')
    this.haptic('tap')
    const cut = id.indexOf(':')
    const head = cut < 0 ? id : id.slice(0, cut)
    const arg = cut < 0 ? '' : id.slice(cut + 1)
    if (head === 'org') this.pickOrg(Number(arg))
    else if (head === 'talent') this.pickTalent(arg === 'none' ? null : arg)
    else if (head === 'code') this.codeAction(arg)
    else if (head === 'resume') this.resumePick(arg)
    else if (head === 'sector') this.pickSector(arg as SectorId)
    else if (head === 'pos') this.pickPos(Number(arg))
    else if (head === 'lev' || head === 'stop') this.flip(head)
    else if (head === 'gate') this.openGroup(arg)
    else if (head === 'sub') this.runSub(arg)
    else if (head === 'probe' || head === 'probe-door') this.probe()
    else if (head === 'step') this.stepOnce()
    else if (head === 'year') this.yearOnce()
    else if (head === 'ev') this.pickOption(Number(arg))
    else if (head === 'sfx') this.toggleSfx()
    else if (head === 'hb') this.toggleHaptic()
    else if (head === 'skip') this.skipRitual()
    else if (head === 'poster') void this.exportPoster()
    else if (head === 'ap') this.say(AP_EXHAUSTED_TEXT)
    else if (head === 'again') this.toTitle()
  }

  private glide(axis: 'page' | 'log', dt: number): void {
    const max = axis === 'page' ? this.maxScroll : maxOffset(this.rows.length, logViewH())
    let v = axis === 'page' ? this.vPage : this.vLog
    if (!v) return
    let x = (axis === 'page' ? this.scrolled : this.logScroll) + v * dt
    v *= Math.exp(-FRICTION * dt)
    let edge = false
    if (x < 0) {
      x = 0
      edge = true
    } else if (x > max) {
      x = max
      edge = true
    }
    if (edge || Math.abs(v) < V_MIN || dt <= 0) v = 0
    if (axis === 'page') {
      this.scrolls[this.screen] = x
      this.vPage = v
    } else {
      const rh = logRowH()
      this.logScroll = Math.round(x / rh) * rh
      this.vLog = v
    }
  }

  /* ---------------- 轻提示 / 音效 / 震动 ---------------- */

  private say(text: string, seconds: number = NOTICE_TTL): void {
    this.notice = { text: text, left: seconds }
  }

  private toggleSfx(): void {
    this.sens = { sfx: !this.sens.sfx, haptic: this.sens.haptic }
    this.persistSenses()
    if (this.sens.sfx) this.play('click')
    this.say(this.sens.sfx ? '音效已打开' : '音效已关闭', 1.6)
  }

  private toggleHaptic(): void {
    this.sens = { sfx: this.sens.sfx, haptic: !this.sens.haptic }
    this.persistSenses()
    if (this.sens.haptic) this.haptic('tap')
    this.say(this.sens.haptic ? '震动已打开' : '震动已关闭', 1.6)
  }

  private persistSenses(): void {
    const st = this.storage
    writeSenses(st ? (key, value) => st.set(key, value) : null, this.sens)
  }

  /** 平台层只执行、不判断：「响不响」与「什么时候响」都在这一层定。 */
  private play(kind: SfxKind): void {
    if (!this.sens.sfx || !this.sfxHost) return
    this.sfxHost(kind)
  }

  private haptic(kind: HapticKind): void {
    if (!this.sens.haptic || !this.hapticHost) return
    this.hapticHost(kind)
  }

  /* ---------------- 动作 ---------------- */

  private toTitle(): void {
    this.state = null
    this.rng = null
    this.logs = []
    this.rows = []
    this.screen = 'org'
    this.resetScrolls()
    this.openGate = null
    this.delta = null
    this.deltaPct = null
    this.notice = null
    this.saved = null
    // 下一局是另一局：换 seed（开局屏上的码跟着换），模式回到史实，天赋要重新选
    this.seed = randomSeed()
    this.mode = 'real'
    this.carried = null
    this.endEarned = 0
    this.chart = []
    this.orgPick = null
    this.holding = null
    this.pressed = null
  }

  /** 当前视口（测试与截图脚本要用它判断某条区域在不在屏幕里）。 */
  get viewport(): { w: number; h: number } {
    return { w: this.w, h: this.h }
  }

  private resetScrolls(): void {
    this.scrolls = { org: 0, talent: 0, trade: 0, event: 0, over: 0, resume: 0 }
    this.maxScroll = 0
  }

  /* ---------------- 开局：出身 → 天赋 → 第一季 ---------------- */

  /** 出身点了一张卡：有东西可带就先带，没东西可带就别摆一屏空选择。 */
  private pickOrg(index: number): void {
    this.orgPick = index
    if (offerRows(this.meta).some(canBring)) {
      this.screen = 'talent'
      this.scrolls.talent = 0
      this.maxScroll = 0
      return
    }
    this.start(index, null)
  }

  /**
   * 天赋屏上点了一下：
   *   不带 → 直接开局（纯挑战）；
   *   已解锁 → 带走它并开局；
   *   锁着但点数够 → 当场花记忆点解锁，留在这一屏让人再点一次（解锁不是「带」，两件事）。
   */
  private pickTalent(id: string | null): void {
    const org = this.orgPick
    if (org === null) return
    if (id === null) {
      this.start(org, null)
      return
    }
    const row = offerRows(this.meta).find(function (r) {
      return r.id === id
    })
    if (!row) return
    if (row.unlocked) {
      this.start(org, id)
      return
    }
    const r = unlock(this.meta, id)
    if (!r.ok) {
      const lack = row.price - this.meta.points
      this.say(r.reason === 'points' ? '记忆点不够：还差 ' + lack + ' 点' : '这个天赋解锁不了', 2.8)
      return
    }
    this.meta = r.meta
    this.persistMeta()
    this.say('已解锁「' + row.name + '」，再点一次带上路', 3)
  }

  private start(orgIndex: number, talent: string | null): void {
    const seed = this.seed
    const rng = createRng(seed)
    this.rng = rng
    this.carried = talent
    // 本局带的天赋要落进 meta（结局页与挑战码卡都读它）；carryTalent 会自己校验能不能带
    this.meta = carryTalent(this.meta, talent)
    this.persistMeta()
    this.logs = []
    this.rows = []
    this.resetScrolls()
    this.openGate = null
    this.delta = null
    this.deltaPct = null
    this.deltaLabel = '本季 Δ'
    this.stampYear = 1991
    this.saved = null
    this.endEarned = 0
    this.chart = []
    this.orgPick = null
    this.apply(createGame(orgIndex, this.mode, seed, rng, talent))
  }

  /* ---------------- 挑战码 ---------------- */

  private codeAction(what: string): void {
    if (what === 'copy') this.copyCode()
    else if (what === 'paste') void this.pasteCode()
  }

  private copyCode(): void {
    const code = this.challengeCode
    if (!this.clip) {
      this.say('这个环境不能复制，码是 ' + code, 4)
      return
    }
    this.clip.write(code)
    this.say('挑战码已复制：' + code, 3)
  }

  /**
   * 粘贴开局：小游戏没有输入框，所以只读剪贴板里那一条。
   * 认码、换算 seed/模式全走 core/challenge 的 decodeChallenge（解析永不抛，失败带一句人话）。
   */
  private async pasteCode(): Promise<void> {
    const clip = this.clip
    if (!clip) {
      this.say('这个环境读不到剪贴板', 3)
      return
    }
    let raw = ''
    try {
      raw = await clip.read()
    } catch (e) {
      raw = ''
    }
    const r = decodeChallenge(raw, this.seed)
    if (r.ok) {
      this.seed = r.seed
      this.mode = r.mode
      this.say('认出挑战码 ' + r.code + '：' + modeText(r.mode) + '模式，挑个出身就开这一局', 4)
    } else {
      this.say(r.message, 4)
    }
    this.render()
  }

  private orgData(): OrgData {
    return { code: this.challengeCode, clip: !!this.clip, points: this.meta.points }
  }

  private storageGet(key: string): string | null {
    const st = this.storage
    if (!st) return null
    try {
      return st.get(key)
    } catch (e) {
      return null
    }
  }

  private persistMeta(): void {
    const st = this.storage
    if (!st) return
    try {
      st.set(META_KEY, serializeMeta(this.meta))
    } catch (e) {
      // 配额满 / 不可用：记忆点丢了也只是少攒一局，不该打断这一局
    }
  }

  /* ---------------- 续玩 ---------------- */

  /** 读存档：解析不了、版本不对、已经收官的一局都当没有。 */
  private readSave(): GameState | null {
    const st = this.storage
    if (!st) return null
    let raw: string | null = null
    try {
      raw = st.get(SAVE_SLOT)
    } catch (e) {
      return null
    }
    const g = deserialize(raw)
    if (!g) return null
    if (g.s.over || g.phase === 'end') return null
    return g
  }

  /** 续玩层的两个选项：继续上一局 / 重新开始。 */
  private resumePick(what: string): void {
    if (what === 'new') {
      this.saved = null
      try {
        if (this.storage) this.storage.set(SAVE_SLOT, '')
      } catch (e) {
        // 清不掉也不影响：内存里已经丢了
      }
      this.toTitle()
      return
    }
    const g = this.saved
    this.saved = null
    if (!g) {
      this.toTitle()
      return
    }
    this.seed = g.seed
    this.rng = createRng(g.seed || 1)
    this.state = g
    this.tweenAsset(g.s.asset, false)
    this.logs = []
    this.rows = buildLogRows(this.logs, '—')
    this.logScroll = 0
    this.delta = null
    this.deltaPct = null
    this.deltaLabel = '本季 Δ'
    const q = currentQuarter(g)
    this.stampYear = q ? q.y : null
    this.resetScrolls()
    // 存档正好落在两个晚年事件之间（老版本写的档）时，先把下一个事件开出来
    if (!g.pending && !g.s.over && g.phase === 'late') this.absorb(lateStep(g, this.rng), true)
    this.screen = this.resolve()
    if (this.screen === 'over') this.beginEnd()
  }

  /* ---------------- 交易 ---------------- */

  private pickSector(id: SectorId): void {
    if (!this.state) return
    this.state = setSector(this.state, id).state
  }

  private pickPos(pos: number): void {
    if (!this.state) return
    this.state = setPosition(this.state, pos).state
  }

  private flip(key: 'lev' | 'stop'): void {
    if (!this.state) return
    this.state = toggle(this.state, key).state
  }

  /** 开一扇门：行动点用完时 core 给的提示由 'ap' 那层提示区转述（见 views/trade.ts）。 */
  private openGroup(id: string): void {
    const g = this.state
    if (!g || g.pending || g.phase !== 'trade' || g.s.over) return
    if (g.s.ap <= 0) {
      this.openGate = null
      return
    }
    this.openGate = this.openGate === id ? null : id
  }

  private runSub(arg: string): void {
    const g = this.state
    const rng = this.rng
    if (!g || !rng || g.pending) return
    const cut = arg.lastIndexOf(':')
    const group = arg.slice(0, cut)
    const index = Number(arg.slice(cut + 1))
    this.openGate = null
    this.apply(runAct(g, group, index, rng))
  }

  private probe(): void {
    const g = this.state
    const rng = this.rng
    if (!g || !rng || g.pending) return
    this.apply(probeIntel(g, rng))
  }

  private stepOnce(): void {
    const g = this.state
    const rng = this.rng
    if (!g || !rng || g.pending) return
    if (g.phase !== 'trade' || g.s.over) return
    this.beginDelta('本季 Δ')
    this.apply(step(g, rng))
  }

  private yearOnce(): void {
    const g = this.state
    const rng = this.rng
    if (!g || !rng || g.pending) return
    if (g.phase !== 'trade' || g.s.over) return
    this.beginDelta('本年 Δ')
    this.apply(stepYear(g, rng))
  }

  /** 推进前记一次基准：delta 只做减法，不参与任何规则。 */
  private beginDelta(label: string): void {
    const g = this.state
    this.deltaBase = g ? g.s.asset : null
    this.delta = null
    this.deltaPct = null
    this.deltaLabel = label
    const q = g ? currentQuarter(g) : null
    this.stampYear = q ? q.y : this.stampYear
  }

  private pickOption(index: number): void {
    const g = this.state
    const rng = this.rng
    if (!g || !rng || !g.pending) return
    const t = g.pending.type
    if (t === 'event') this.apply(chooseEvent(g, index, rng))
    else if (t === 'year') this.apply(chooseYear(g, index, rng))
    else this.apply(chooseLate(g, index, rng))
  }

  /* ---------------- 一次内核调用的落地 ---------------- */

  private apply(out: StepOutcome): void {
    const prev = this.screen
    this.absorb(out, false)
    // 晚年不是「一屏一件事」：上一个晚年事件选完就直接开下一个（H5 是点「继续」，这里连起来）
    const rng = this.rng
    const g = this.state
    if (rng && g && !g.pending && !g.s.over && g.phase === 'late') this.absorb(lateStep(g, rng), true)
    this.screen = this.resolve()
    if (this.screen !== prev) {
      this.scrolls[this.screen] = 0
      this.maxScroll = 0
    }
    if (this.screen === 'over' && prev !== 'over') this.beginEnd()
    this.persist()
  }

  /** 把一次内核结果落到画面上（不动屏幕判定，晚年连播要连着落两次）。 */
  private absorb(out: StepOutcome, silent: boolean): void {
    const prevQi = this.state ? this.state.s.qi : null
    const prevAsset = this.state ? this.state.s.asset : null
    this.state = out.state
    this.logs = this.logs.concat(out.logs)
    if (this.logs.length > LOG_KEEP) this.logs = this.logs.slice(-LOG_KEEP)
    this.stamp(out.logs)
    this.rows = buildLogRows(this.logs, '—')
    // 新条目进来就滚到最新（用户拖到别处也会被拉回最新：流水是「看结果」不是「翻旧账」）
    this.logScroll = maxOffset(this.rows.length, logViewH())
    const asset = this.state.s.asset
    if (this.deltaBase !== null) {
      this.delta = asset - this.deltaBase
      this.deltaPct = this.deltaBase ? (this.delta / this.deltaBase) * 100 : null
    }
    this.openGate = null
    // 季数往前走了 = 这一手真的结算了一季（行动/看情报也返回 settled，不能只看 kind）
    const settled = prevQi !== null && this.state.s.qi > prevQi
    this.tweenAsset(asset, !silent && settled)
    if (!silent) this.playOutcome(out, settled, prevAsset)
  }

  /**
   * 资产大字与本季 Δ 的补间：结算时从旧值滚到新值。
   * 上一段还没滚完玩家又点了「过一季」：先跳到它的终值再开下一段 ——
   * 不排队、不从半路叠，看见的永远是「上一次的终点 → 这一次的终点」。
   */
  private tweenAsset(asset: number, animate: boolean): void {
    if (!animate) {
      this.assetTween.set(asset)
      this.assetTween.jump()
      this.deltaTween.set(this.delta === null ? 0 : this.delta)
      this.deltaTween.jump()
      return
    }
    if (!this.assetTween.done) this.assetTween.jump()
    this.assetTween.set(asset)
    if (!this.deltaTween.done) this.deltaTween.jump()
    this.deltaTween.set(this.delta === null ? 0 : this.delta)
  }

  /**
   * 三种时机各一次：有效点击（tapAt 里）、每季结算、爆仓。
   * 结算的涨跌要从账上读 —— 内核只给 kind/fx，不给「这一手赚了还是亏了」。
   */
  private playOutcome(out: StepOutcome, settled: boolean, prevAsset: number | null): void {
    if (out.kind === 'busted' || out.fx.indexOf('bust') >= 0) {
      this.play('down')
      this.haptic('bust')
      return
    }
    if (!settled) return
    const after = this.state ? this.state.s.asset : 0
    this.play(after >= (prevAsset === null ? after : prevAsset) ? 'up' : 'down')
    this.haptic('settle')
  }

  /** 进结局屏：仪式从头放、金额从本金滚到终值。 */
  private beginEnd(): void {
    const g = this.state
    this.ritual = new Ritual(LAYERS, LAYER_S)
    this.count = new CountUp(g ? g.s.start : 0, COUNT_S)
    if (g) this.count.set(g.s.asset)
    this.notice = null
    if (!g) return
    // 36 年指数年线：与 H5 结局卡同一个口径（buildQuarters 的 p0 → 每年一个点）
    this.chart = yearlySeries(
      buildQuarters(g.map).map(function (q) {
        return q.p0
      }),
    )
    // 记忆点：同一局重复进结局页不再加点（meta.award 用 runToken 认这一局）
    const r = award(this.meta, g.s, this.seed)
    this.meta = r.meta
    this.endEarned = r.earned
    this.persistMeta()
  }

  private skipRitual(): void {
    this.ritual.skip()
    this.count.jump()
  }

  /* ---------------- 海报 ---------------- */

  private async exportPoster(): Promise<void> {
    const g = this.state
    if (!g) return
    const sink = this.posterSink
    if (!sink) {
      this.say('这个环境不支持生成海报', 3)
      return
    }
    this.say('正在生成战报…', 8)
    let msg = '导出失败'
    try {
      const r = await sink(endView(g), '¥' + fmt(g.s.asset))
      msg = r.msg
    } catch (e) {
      const m = e && (e as Error).message ? (e as Error).message : '未知原因'
      msg = '导出失败：' + m
    }
    this.say(msg, 3.4)
    this.render()
  }

  /** 内核没给年份的日志，按「推进前看到的年份」补上（与 H5 的 yearOf 同一口径）。 */
  private stamp(items: LogItem[]): void {
    const y = this.stampYear
    if (y === null) return
    for (const it of items) {
      if (typeof it.year !== 'number') it.year = y
    }
  }

  private resolve(): Screen {
    const g = this.state
    if (!g) return 'org'
    if (g.pending) return 'event'
    if (g.phase !== 'trade' || g.s.over) return 'over'
    return 'trade'
  }

  private persist(): void {
    const g = this.state
    if (!g || !this.storage) return
    try {
      this.storage.set(SAVE_SLOT, serialize(g, 0))
    } catch (e) {
      // 存储满了 / 不可用都不该让这一局停下（小游戏真机会在某些机型上报错）
    }
  }
}

/**
 * 天赋屏最多摆三行：解锁的在前（能带），锁着的按价钱跟在后面（点得动就当场解锁）。
 * 为什么不是六行全摆：竖屏一屏只放得下三条卡，六条会把「不带」挤出屏外 ——
 * 选择项一屏放得下、而且「不带」永远看得见，比把池子全摊开更重要。
 */
function offerRows(m: MetaState): TalentRow[] {
  const rows = talentRows(m)
  const on = rows.filter(function (r) {
    return r.unlocked
  })
  const off = rows
    .filter(function (r) {
      return !r.unlocked
    })
    .sort(function (a, b) {
      return a.price - b.price
    })
  return on.concat(off).slice(0, 3)
}

/**
 * 按下态只给「按下去该有反应」的区域：日志区是滚动把手（按它是为了拖），
 * 行动点用完盖上的 'ap' 区根本点不动（只弹一句提示）。
 */
function pressable(id: string): boolean {
  return id !== LOG_AREA_ID && id !== 'ap'
}

/** 这一行点得动吗：已解锁（能带）或者点数够解锁。 */
function canBring(r: TalentRow): boolean {
  return r.unlocked || r.affordable
}

function modeText(m: Mode): string {
  return m === 'real' ? '史实' : m === 'fog' ? '迷雾' : '抽签'
}

function clampV(v: number): number {
  if (!isFinite(v)) return 0
  return v < -V_MAX ? -V_MAX : v > V_MAX ? V_MAX : v
}
