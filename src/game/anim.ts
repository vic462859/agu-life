/**
 * 纯时间驱动的动效：补间（useCountUp 的 canvas 版）与逐层仪式。
 * 时间只有一个来源 —— 平台层每帧交进来的 frame(dt)；这里不读 Date.now，
 * 所以同一串 dt 一定跑出同一串数值，布局与截图都能复现。
 */

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** easeOutCubic：起步快、收尾稳，数字滚起来像「落定」而不是「刹停」。 */
function easeOut(k: number): number {
  const t = 1 - k
  return 1 - t * t * t
}

/**
 * 数值补间。用法：new CountUp(起点, 0.9) → set(终点) → 每帧 advance(dt)。
 * done 与 value 都在终值上收敛（k>=1 时直接赋终值，不留浮点尾巴）。
 */
export class CountUp {
  private v: number
  private from: number
  private to: number
  private t: number
  private dur: number

  constructor(value: number = 0, dur: number = 0.9) {
    this.v = isFinite(value) ? value : 0
    this.from = this.v
    this.to = this.v
    this.t = 0
    this.dur = dur > 0 ? dur : 0
  }

  get value(): number {
    return this.v
  }

  get done(): boolean {
    return this.v === this.to
  }

  /** 换目标；值与当前目标相同就当作已经在位，不重启动画。 */
  set(target: number): void {
    if (!isFinite(target) || target === this.to) return
    this.from = this.v
    this.to = target
    this.t = 0
    if (this.dur <= 0 || this.from === this.to) {
      this.v = target
      this.t = this.dur
    }
  }

  /** 跳过动画：直接落到终值。 */
  jump(): void {
    this.v = this.to
    this.t = this.dur
  }

  advance(dt: number): void {
    if (dt <= 0 || this.v === this.to) return
    this.t = Math.min(this.dur, this.t + dt)
    const k = this.dur <= 0 ? 1 : this.t / this.dur
    this.v = k >= 1 ? this.to : this.from + (this.to - this.from) * easeOut(clamp01(k))
  }
}

/**
 * 逐层仪式：每 step 秒揭示一层，第 n 层在 (n-1)*step 起用 step 秒淡入。
 * stage 是「已完整出现的层数」，alpha(n) 是第 n 层（1 起）的淡入进度。
 */
export class Ritual {
  readonly steps: number
  readonly step: number
  private t: number

  constructor(steps: number = 6, step: number = 0.26) {
    this.steps = steps > 0 ? steps : 0
    this.step = step > 0 ? step : 0.26
    this.t = 0
  }

  /** 已经完整亮相的层数（0..steps）。 */
  get stage(): number {
    return Math.min(this.steps, Math.floor(this.t / this.step + 1e-9))
  }

  /** 第 n 层（1 起）的淡入进度 0..1。 */
  alpha(n: number): number {
    if (n < 1 || n > this.steps) return 0
    return clamp01((this.t - (n - 1) * this.step) / this.step)
  }

  /** 六层的 alpha 一次取齐（view 不用自己算下标）。 */
  alphas(): number[] {
    const out: number[] = []
    for (let i = 1; i <= this.steps; i++) out.push(this.alpha(i))
    return out
  }

  get done(): boolean {
    return this.t >= this.steps * this.step - 1e-9
  }

  /** 跳过动画：所有层立刻到位。 */
  skip(): void {
    this.t = this.steps * this.step
  }

  advance(dt: number): void {
    if (dt <= 0 || this.done) return
    this.t = Math.min(this.steps * this.step, this.t + dt)
  }
}

/** 轻提示的存活时间（秒）：从弹出那一刻开始倒计时，由 frame(dt) 扣。 */
export const NOTICE_TTL = 2.6
