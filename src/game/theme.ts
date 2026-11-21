/**
 * canvas 版设计令牌 —— 与 src/ui/styles/tokens.css 是双源。
 * canvas 读不到 CSS 变量，只能抄一份：改颜色/字号时两个文件必须同步，
 * 否则 H5 与 Canvas 两条渲染线会慢慢走散。
 */
import type { Tone } from '../core'

export const C = {
  bg0: '#06090d',
  bg1: '#0a0f16',
  bg2: '#0f1620',
  bg3: '#141d29',
  ink0: '#eaf1f8',
  ink1: '#9fadbe',
  ink2: '#6b798b',
  inkInv: '#16110a',
  gold0: '#f6cf72',
  gold1: '#d8a441',
  gold2: '#7a5a1e',
  teal0: '#3ee0cb',
  red0: '#ff6a6a',
  red1: '#b4342f',
  warn0: '#f0a63c',
  ok0: '#4fd6a8',
  line0: 'rgba(255,255,255,0.06)',
  line1: 'rgba(255,255,255,0.11)',
  line2: 'rgba(246,207,114,0.34)',
  /** 弹层遮罩：压暗但不糊掉下面那屏（弹层还要认得出自己盖在什么事上）。 */
  mask: 'rgba(6,9,13,0.82)',
} as const

/** 字号档。名字不用尺寸，避免换尺寸时全仓改名。 */
export const T = {
  caption: 12,
  small: 13,
  body: 15,
  title: 20,
  hero: 30,
} as const

/** 间距档（4 的倍数）。 */
export const SP = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32 } as const

/** 圆角档（canvas 里 MG1 只用直角，留档给 MG2）。 */
export const R = { sm: 4, md: 8, lg: 12 } as const

/** 日志色调 → 颜色。与 core 的 TONE_CLASS 同源（那张表是给 DOM 用的类名）。 */
export const TONE: Record<Tone, string> = {
  r: C.red0,
  g: C.teal0,
  gold: C.gold0,
  a: C.ink1,
  w: C.ink0,
  dim: C.ink1,
}

/** 身体/家两条进度条的阈值配色（与 core 的 barTone 同源：<30 红 / <55 黄 / 否则青）。 */
export const BAR_TONE = { bad: C.red0, warn: C.warn0, ok: C.teal0 } as const

/** 贵贱五档：很低 → 很高。 */
export const ZONE_COLOR = [C.teal0, C.ok0, C.ink2, C.warn0, C.red0] as const

/** 不加载任何外部字体：小游戏主包 4MB，首屏也不能等字体。 */
const STACK = '"PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif'

/** 等宽栈：资产大字要「等宽数字」，换数字时不能左右抖。 */
const NUM_STACK = 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace'

export function font(size: number, weight: number = 400): string {
  return weight + ' ' + size + 'px ' + STACK
}

export function numFont(size: number, weight: number = 600): string {
  return weight + ' ' + size + 'px ' + NUM_STACK
}

/** 行高：固定的倍数，不随字号漂移，保证排版可复现。 */
export function lh(size: number): number {
  return Math.round(size * 1.55)
}
