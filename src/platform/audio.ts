/** 音效适配：全部程序合成，无外部文件。小程序没有 WebAudio，play 直接空转。
 *
 * V2a「手感」只接线、没换引擎：合成仍是原来那套 tone()/hiss()（振荡器 + 低通噪声），
 * 新增的只有两件东西——
 * ① 方向音 'gain' / 'fall'：结算涨、结算跌两种（原来每个季度只有一声中性 'settle'，听不出方向）；
 * ② 解锁闸门 unlock()/unlocked()：浏览器的自动播放策略要求 AudioContext 必须在用户手势里
 *    创建或 resume，所以第一个手势之前一律不出声（不是静音，是不进合成路径），
 *    页面在 pointerdown/keydown 里第一个动作就是 unlock()。
 */
import type { SfxName } from '../core/types'

/** 内核给的名字 + UI 自己补的两个方向音（结算涨/跌）。 */
export type UiSfx = SfxName | 'gain' | 'fall'

/** 诊断快照：只读，给测试与调试看"闸门到底开没开、过了几次"。 */
export interface SfxState {
  on: boolean
  unlocked: boolean
  /** 通过闸门、真的进到合成路径的次数（关掉 / 未解锁时是 0）。 */
  played: number
}

export interface Sfx {
  wake(): void
  /** 第一次用户手势里调用：开闸 + resume。重复调用无副作用。 */
  unlock(): void
  unlocked(): boolean
  play(name: UiSfx): void
  isOn(): boolean
  toggle(): boolean
  state(): SfxState
}

/** 建一个合成器。on 由调用方（本地偏好）决定。 */
export function createSfx(enabled: boolean): Sfx {
  let on = enabled
  /** 用户手势开过闸没有。没开闸时 play() 连合成路径都不进 —— 那正是浏览器会拒的地方。 */
  let unlocked = false
  let played = 0
  let ac: AudioContext | null = null
  let mst: GainNode | null = null

  function boot(): boolean {
    if (ac) return true
    // #ifdef H5
    try {
      const Ctor =
        typeof window !== 'undefined'
          ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          : undefined
      if (!Ctor) return false
      ac = new Ctor()
      mst = ac.createGain()
      mst.gain.value = 0.62
      mst.connect(ac.destination)
    } catch (e) {
      return false
    }
    // #endif
    return !!ac
  }

  function bus(v: number): GainNode | null {
    if (!ac || !mst) return null
    const n = ac.createGain()
    n.gain.value = v
    n.connect(mst)
    return n
  }

  function tone(f: number, dur: number, vol: number, type: OscillatorType, delay?: number, slide?: number): void {
    if (!on || !ac) return
    const t = ac.currentTime + (delay || 0)
    const o = ac.createOscillator()
    const n = bus(vol)
    if (!n) return
    o.type = type || 'sine'
    o.frequency.setValueAtTime(f, t)
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(45, slide), t + dur)
    n.gain.setValueAtTime(0.0001, t)
    n.gain.exponentialRampToValueAtTime(1, t + 0.009)
    n.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(n)
    o.start(t)
    o.stop(t + dur + 0.03)
  }

  function hiss(dur: number, vol: number, flt?: number): void {
    if (!on || !ac) return
    const n = ac.createBufferSource()
    const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.6)
    n.buffer = b
    const f = ac.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = flt || 900
    const g = bus(vol)
    if (!g) return
    n.connect(f)
    f.connect(g)
    n.start()
  }

  function vibrate(ms: number): void {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms)
    } catch (e) {
      /* 桌面浏览器 / 小程序不支持下震动，忽略 */
    }
  }

  function wake(): void {
    if (!boot() || !ac) return
    try {
      if (ac.state === 'suspended') ac.resume()
    } catch (e) {
      /* 忽略 */
    }
  }

  function play(name: UiSfx): void {
    // 两道闸门：开关关着不出声；没有过用户手势也不出声（自动播放策略）。
    if (!on || !unlocked) return
    played++
    wake()
    switch (name) {
      case 'click':
        // 轻：26ms 的方波短促一下，音量压到能听见但不抢戏
        tone(300, 0.026, 0.22, 'square')
        break
      case 'act':
        tone(210, 0.05, 0.38, 'square')
        tone(430, 0.04, 0.22, 'sine', 0.03)
        break
      case 'settle':
        // 中性的"这一季算完了"：短、平、不往上也不往下 —— 方向交给 gain / fall，
        // 否则亏钱的那一季会先响一段上扬音，再把人的预期扯反。
        tone(520, 0.05, 0.18, 'triangle')
        break
      case 'gain':
        // 结算涨：两个音往上抬一格，收得快（0.1s 内），不拖到下一季
        tone(540, 0.09, 0.4, 'triangle')
        tone(720, 0.12, 0.3, 'sine', 0.06)
        break
      case 'fall':
        // 结算跌：往下滑，闷一点（低通噪声垫底），听得懂但刺耳
        tone(360, 0.13, 0.38, 'triangle', 0, 240)
        tone(230, 0.16, 0.24, 'sine', 0.05, 180)
        hiss(0.12, 0.1, 620)
        break
      case 'intel':
        tone(900, 0.1, 0.5, 'sine', 0)
        tone(1350, 0.16, 0.42, 'sine', 0.1)
        break
      case 'bust':
        hiss(0.5, 0.5, 300)
        tone(230, 0.55, 0.5, 'sawtooth', 0, 70)
        vibrate(60)
        break
      case 'up':
        tone(660, 0.12, 0.5, 'sine', 0)
        tone(880, 0.12, 0.5, 'sine', 0.09)
        tone(1180, 0.24, 0.5, 'sine', 0.18)
        vibrate(20)
        break
      case 'health':
        hiss(0.25, 0.16, 700)
        break
      case 'end':
        tone(330, 0.7, 0.4, 'sine', 0, 245)
        tone(220, 1.05, 0.3, 'sine', 0.22, 150)
        break
      default:
        break
    }
  }

  function unlock(): void {
    if (unlocked) return
    unlocked = true
    if (on) wake()
  }

  return {
    wake: wake,
    unlock: unlock,
    unlocked: function () {
      return unlocked
    },
    play: play,
    isOn: function () {
      return on
    },
    toggle: function () {
      on = !on
      if (on) {
        // 点开关这个动作本身就是手势：顺手开闸，之后不用再等一次
        unlocked = true
        wake()
        tone(700, 0.1, 0.5, 'sine')
      }
      return on
    },
    state: function () {
      return { on: on, unlocked: unlocked, played: played }
    },
  }
}
