/**
 * V2a「H5 手感」的四条硬要求各有一条测试：
 * ① 按下态只在 :active 下出现（down 出现 / up 消失），且不只靠颜色；
 * ② 音效两道闸门（开关关闭 / 未过首次手势）都不出声；
 * ③ 数字补间收敛到终值，同帧起的多个数字同时开始、同时到；
 * ④ prefers-reduced-motion 命中时走瞬时路径，终值一样。
 * 另加：出场时机、结算涨/跌两个方向音、文案数字补间、tokens 与 motion 两张表不漂。
 *
 * 环境是 node（本工程没有 jsdom，也不许加依赖），所以"样式"是直接读 .css 文本来验的 ——
 * 验的是契约（谁带 :active、用什么时长），不是渲染结果；渲染由 dist 实机截图复核。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import {
  DUR,
  DUR_VAR,
  easeOutCubic,
  motionMs,
  parseLabelNum,
  prefersReduced,
  withNum,
  type DurKind,
} from '../src/ui/composables/motion'
import { useCountUp } from '../src/ui/composables/useCountUp'
import { createSfx } from '../src/platform/audio'
import { PRESSABLE_LIST, isPressable, leaveThen, settleSound } from '../src/ui/composables/useFeel'

/* 样式按源码原文验：本工程没有 jsdom、也不许加依赖。vite 的 ?raw/?inline 对 .css 一律返回空串
   （vitest 默认把 CSS 摘成空模块），所以只能直接读文件。
   @ts-ignore 的唯一原因是工程没装 @types/node（types 里只有 @dcloudio/types + vite/client），
   而 vitest 跑在 node 上 —— 不加依赖就没法把这三行写成有类型的调用。 */
// @ts-ignore
import fs from 'node:fs'
const css = function (rel: string): string {
  return String(fs.readFileSync('src/ui/styles/' + rel, 'utf8'))
}
const TOKENS = css('tokens.css')
const BASE = css('base.css')
const PANELS = css('panels.css')

describe('① 按下态：down 出现、up 消失，且不只靠颜色', () => {
  it('每一个可点元素都有一条 :active 规则 —— 状态挂在伪类上，所以抬手就消失、不会卡住', () => {
    const all = BASE + PANELS
    const missing = PRESSABLE_LIST.filter(function (sel) {
      return all.indexOf(sel + ':active') < 0
    })
    expect(missing).toEqual([])
  })

  it('按下态不止改颜色：同一条规则里同时有缩放与提亮，另外还改描边', () => {
    const start = BASE.indexOf('/* ================= 按下态（V2a 手感）')
    expect(start).toBeGreaterThan(0)
    const block = BASE.slice(start, BASE.indexOf('/* 折叠行本身没有描边', start))
    expect(block).toContain('transform: scale(var(--press-scale))')
    expect(block).toContain('filter: brightness(var(--press-bright))')
    expect(block).toContain('border-color: var(--line-2)')
    // 缩放量必须真的小于 1（而不是摆设）
    expect(Number(/--press-scale:\s*([0-9.]+)/.exec(TOKENS)?.[1])).toBeLessThan(1)
  })

  it('按下/抬起的时长走 --dur-press，且 ≤120ms；旧的"只缩不亮"版本没有残留', () => {
    expect(/--dur-press:\s*(\d+)ms/.exec(TOKENS)?.[1]).toBe('120')
    expect(Number(/--dur-press:\s*(\d+)ms/.exec(TOKENS)?.[1])).toBeLessThanOrEqual(120)
    expect(BASE + PANELS).toContain('var(--dur-press)')
    // 0.99 / 0.985 那种"看不出按下去"的旧值不许再出现在样式里
    expect(/scale\(0\.9[0-9]*\)/.test(BASE + PANELS)).toBe(false)
  })

  it('点击音的判定表就是同一批选择器：按下了就有声音', () => {
    const pressable = { closest: function (sel: string) { return sel.indexOf('.ag-door') >= 0 ? {} : null } }
    const staticEl = { closest: function () { return null } }
    expect(isPressable(pressable)).toBe(true)
    expect(isPressable(staticEl)).toBe(false)
    expect(isPressable(null)).toBe(false)
  })
})

describe('② 音效：开关关闭 / 未解锁都不播', () => {
  it('开关关着时 play 一次都不进合成路径', () => {
    const s = createSfx(false)
    expect(s.state()).toEqual({ on: false, unlocked: false, played: 0 })
    s.play('click')
    s.play('gain')
    s.play('bust')
    expect(s.state().played).toBe(0)
    expect(s.isOn()).toBe(false)
    // 打开这个动作本身是手势：顺手开闸
    expect(s.toggle()).toBe(true)
    expect(s.state().on).toBe(true)
  })

  it('没经过用户手势时不出声（自动播放策略），unlock 之后才放开', () => {
    const s = createSfx(true)
    expect(s.unlocked()).toBe(false)
    s.play('click')
    expect(s.state().played).toBe(0)
    s.unlock()
    expect(s.unlocked()).toBe(true)
    s.play('click')
    s.play('fall')
    expect(s.state().played).toBe(2)
    // 重复 unlock 是幂等的，不会把计数带偏
    s.unlock()
    expect(s.state().played).toBe(2)
  })

  it('结算涨/跌是两个方向音，平盘不响', () => {
    expect(settleSound(1200)).toBe('gain')
    expect(settleSound(-1200)).toBe('fall')
    expect(settleSound(0)).toBeNull()
    expect(settleSound(null)).toBeNull()
  })
})

describe('③ 数字补间：收敛到终值，同帧多个数字同时开始', () => {
  beforeEach(function () { vi.useFakeTimers() })
  afterEach(function () { vi.useRealTimers() })

  it('两个数字在同一帧开始滚，也同一刻到终值（不是排队）', async function () {
    const ms = function () { return motionMs('count', false) }
    const a = ref(0)
    const b = ref(0)
    const shownA = useCountUp(function () { return a.value }, ms)
    const shownB = useCountUp(function () { return b.value }, ms)

    a.value = 1000
    b.value = -400
    await nextTick()

    // 第一帧：两个都动了（起点是旧值，所以一定严格介于两端之间）
    vi.advanceTimersByTime(32)
    expect(shownA.value).toBeGreaterThan(0)
    expect(shownA.value).toBeLessThan(1000)
    expect(shownB.value).toBeLessThan(0)
    expect(shownB.value).toBeGreaterThan(-400)

    // 到点：两个都精确落在终值上（不是"差不多"）
    vi.advanceTimersByTime(DUR.count)
    expect(shownA.value).toBe(1000)
    expect(shownB.value).toBe(-400)
  })

  it('easeOutCubic 单调、两端精确，前段比线性快', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
    expect(easeOutCubic(0.2)).toBeLessThan(easeOutCubic(0.6))
  })
})

describe('④ prefers-reduced-motion：瞬时路径，终值一致', () => {
  beforeEach(function () { vi.useFakeTimers() })
  afterEach(function () { vi.useRealTimers() })

  it('命中 reduce 时所有时长都是 0', () => {
    const kinds: DurKind[] = ['press', 'modalIn', 'modalOut', 'count', 'rise']
    for (let i = 0; i < kinds.length; i++) expect(motionMs(kinds[i], true)).toBe(0)
    expect(prefersReduced({ matchMedia: function () { return { matches: true } } })).toBe(true)
    expect(prefersReduced({ matchMedia: function () { return { matches: false } } })).toBe(false)
    expect(prefersReduced(null)).toBe(false) // 小程序 / node：没有 matchMedia 就当没命中
  })

  it('补间时长取 0 时数字当场到位，不需要任何一帧（状态与滚动版一致）', async function () {
    const src = ref(10)
    const shown = useCountUp(function () { return src.value }, function () { return motionMs('count', true) })
    // 与"滚动版"同一个起点
    expect(shown.value).toBe(10)
    src.value = 999
    await nextTick()
    expect(shown.value).toBe(999)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('⑤ 过场与文案数字', () => {
  it('出场先播 140ms 再撤 v-if；reduce 下当场撤', () => {
    const added: string[] = []
    const el = { classList: { add: function (c: string) { added.push(c) } } }
    const doc = { querySelector: function () { return el } }
    let ran = 0
    let pending: (() => void) | null = null
    const played = leaveThen('.ag-mask', motionMs('modalOut', false), function () { ran++ }, {
      doc: doc,
      schedule: function (fn) { pending = fn },
    })
    expect(played).toBe(true)
    expect(added).toEqual(['ag-leave'])
    expect(ran).toBe(0) // 还没撤：元素还在，动画有机会跑
    expect(motionMs('modalOut', false)).toBe(140)
    if (pending) (pending as () => void)()
    expect(ran).toBe(1)

    // reduce：不进动画，直接撤
    let ran2 = 0
    const played2 = leaveThen('.ag-mask', motionMs('modalOut', true), function () { ran2++ }, { doc: doc })
    expect(played2).toBe(false)
    expect(ran2).toBe(1)
  })

  it('「离上岸还差 8.3×」里的数字能抽出来再写回去，别的小数位照旧', () => {
    expect(parseLabelNum('离上岸还差 8.3×')).toBe(8.3)
    expect(withNum('离上岸还差 8.3×', 5)).toBe('离上岸还差 5.0×')
    expect(withNum('离上岸还差 8.3×', 12.34)).toBe('离上岸还差 12.3×')
    expect(parseLabelNum('传说')).toBeNull()
    expect(withNum('传说', 3)).toBe('传说')
  })
})

describe('⑥ tokens.css 与 motion.ts 两张表不漂', () => {
  it('每个 --dur-* 与 DUR 表逐项相等，四条硬要求的上限也在', () => {
    const kinds: DurKind[] = ['press', 'modalIn', 'modalOut', 'count', 'rise']
    for (let i = 0; i < kinds.length; i++) {
      const k = kinds[i]
      const m = new RegExp(DUR_VAR[k] + ':\\s*(\\d+)ms').exec(TOKENS)
      expect(m, DUR_VAR[k] + ' 没在 tokens.css 里').not.toBeNull()
      expect(Number(m ? m[1] : -1)).toBe(DUR[k])
    }
    expect(DUR.press).toBeLessThanOrEqual(120)
    expect(DUR.modalIn).toBe(180)
    expect(DUR.modalOut).toBe(140)
    expect(DUR.count).toBeLessThanOrEqual(460)
    // 缓动也只许在 tokens.css 里定义
    expect(TOKENS).toContain('--ease-out:')
    expect(TOKENS).toContain('--ease-press:')
  })

  it('reduce 命中时 tokens 自己也会把时长归零（CSS 与 JS 两条路都不动）', () => {
    const start = TOKENS.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(start).toBeGreaterThan(0)
    const block = TOKENS.slice(start)
    expect(block).toContain('--dur-press: 0ms')
    expect(block).toContain('--dur-count: 0ms')
  })
})
