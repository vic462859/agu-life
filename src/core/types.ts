/**
 * 内核类型契约（M1 冻结面）。
 * 该文件与 core 下其余模块一样：纯 TS，不依赖任何平台 API。
 */

/** 人生阶段。org=还没选出身，trade=36 年交易期，late=晚年 23 年，end=结束。 */
export type Phase = 'org' | 'trade' | 'late' | 'end'

/** 玩法模式：史实 / 迷雾 / 抽签。 */
export type Mode = 'real' | 'fog' | 'draw'

/** 日志色调。r=涨/红，g=跌/亏，gold=关键节点，a=叙述，w=小标题，dim=默认。 */
export type Tone = 'r' | 'g' | 'gold' | 'a' | 'w' | 'dim'

/** 五个板块。 */
export type SectorId = '龙头' | '题材' | '成长' | '红利' | '壳'

/** 遗嘱去向。 */
export type WillKind = 'kids' | 'half' | 'spend'

/** 一条日志是数据，不是 DOM 操作。 */
export interface LogItem {
  text: string
  tone: Tone
  /** 这条日志所属的年份（交易期=当前季度年，年首/年末事件=事件年，晚年=晚年事件年）。 */
  year?: number
}

/** 注入式随机源。同 seed + 同操作序列 ⇒ 状态完全一致。 */
export interface RngLike {
  /** [0, 1) 均匀分布。 */
  next(): number
  /** [0, n) 整数。 */
  int(n: number): number
}

/** 一次引擎调用产生的结局类型。 */
export type OutcomeKind =
  /** 当前阶段不允许该操作，什么都没发生。 */
  | 'idle'
  /** 推进/结算了一季（可能同时触发事件）。 */
  | 'settled'
  /** 停在特殊年份事件上，等 chooseEvent()。 */
  | 'event'
  /** 停在年底人生事件上，等 chooseYear()。 */
  | 'year'
  /** 停在晚年事件上 / 刚进入晚年。 */
  | 'late'
  /** 这一局结束了（正常走完 36+23 年）。 */
  | 'end'
  /** 爆仓结束。 */
  | 'busted'

/** 音效提示（由平台层决定怎么响，core 只给名字）。 */
export type SfxName = 'click' | 'act' | 'settle' | 'intel' | 'bust' | 'up' | 'health' | 'end'

/** 引擎每次调用的统一返回值：新状态 + 这次产生的日志 + 结局类型 + 音效提示。 */
export interface StepOutcome {
  state: GameState
  logs: LogItem[]
  kind: OutcomeKind
  fx: SfxName[]
}

/** 季度行情（由 map 推出，不存档）。 */
export interface Quarter {
  /** 剧本上的年份（抽签模式 = 剧情年）。 */
  y: number
  /** 真实行情年份（史料年）。 */
  my: number
  /** 1..4。 */
  q: number
  /** 季初点位。 */
  p0: number
  /** 季内最高涨幅。 */
  hi: number
  /** 季内最低涨幅。 */
  lo: number
  /** 季收益率。 */
  ret: number
  /** 前 8 季均点位。 */
  bench: number
  /** p0 / bench，贵贱指标。 */
  rel: number
}

/** 年块季线（真实史料）。 */
export interface BlockQuarter {
  p0: number
  hi: number
  lo: number
  ret: number
}

/** 一条消息：[年, 真板块, 真文案, 假板块, 假文案]。 */
export type IntelRow = [number, SectorId, string, SectorId, string]

/** 出身。 */
export interface Org {
  k: string
  start: number
  sense: number
  net: number
  rep: number
  health: number
  fam: number
  d: string
}

/** 人生事件的效果描述。 */
export interface LifeEffect {
  cash?: number
  sell?: number
  fam?: number
  health?: number
  sense?: number
  net?: number
  rep?: number
  flag?: number
  kids?: number
  married?: number
  bet?: number
  will?: WillKind
}

/** 人生事件的一个选项。 */
export interface LifeOption {
  k: string
  d: string
  a?: LifeEffect
}

/** 年度事件 / 晚年事件（同一形状）。 */
export interface LifeEvent {
  y: number
  h: string
  p: string
  o: LifeOption[]
}

/** 特殊年份事件的结算方式。 */
export type SpecialFlag = 'sub' | 'none' | 'cut' | 'hold' | 'out' | 'allin' | 'greed' | 'swap' | 'swap2'

/** 特殊年份事件的一个选项。 */
export interface SpecialOption {
  k: string
  d: string
  f: SpecialFlag
}

/** 特殊年份事件。 */
export interface SpecialEvent {
  h: string
  p: string
  o: SpecialOption[]
}

/** 长期投资（开厂 / 放贷）。 */
export interface Slot {
  kind: 'factory' | 'loan'
  amt: number
  left: number
  mult?: number
}

/** 一季的持仓快照：[年, 季, 板块下标, 仓位, 盈亏, 是否换板块, 是否追去年最猛, 追的是否今年仍强]。 */
export type HeldSeason = [number, number, number, number, number, number, number, number]

/** 玩家状态（原 S 对象，字段一一对应）。 */
export interface PlayerState {
  asset: number
  start: number
  qi: number
  sect: SectorId
  pos: number
  lev: boolean
  stop: boolean
  streak: number
  peak: number
  maxDD: number
  busted: boolean
  best: number
  seasons: number
  over: boolean
  sense: number
  net: number
  rep: number
  health: number
  fam: number
  flag: number
  married: number
  kids: number
  will: WillKind | null
  ap: number
  probed: boolean
  intel: IntelRow | null
  flip: boolean
  scam: boolean
  safe: boolean
  fa: boolean
  emo: boolean
  miss: boolean
  fee: number
  prop: number
  slots: Slot[]
  hintOk: boolean
  hintSect: boolean
  kty: Record<number, Record<SectorId, number>> | null
  stopUsed: boolean
  H: HeldSeason[]
  act: Record<string, number>
  lines: string[] | null
}

/** 引擎停在这三种待选事件之一。 */
export type Pending =
  | { type: 'event'; key: string; qi: number }
  | { type: 'year'; year: number; qi: number }
  | { type: 'late'; index: number }

/** 完整局面。s 之外只有剧本与阶段。 */
export interface GameState {
  mode: Mode
  map: number[]
  phase: Phase
  /** 晚年事件下标。 */
  li: number
  pending: Pending | null
  /** 这一局的随机种子（存档用；续玩以它重建 rng）。 */
  seed: number
  s: PlayerState
}
