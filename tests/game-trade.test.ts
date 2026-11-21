import { describe, expect, it } from 'vitest'
import { Game } from '../src/game/app'
import type { Ctx2D } from '../src/game/paint'
import { buildLogRows, LOG_AREA_ID, LOG_VIEW_ROWS, logViewH, maxOffset, windowSlice } from '../src/game/logrows'

/** 假 canvas：只记账，不画。字体宽按「一个码点 = 一个字号」估，足够让换行与截断工作。 */
class FakeCtx implements Ctx2D {
  fillStyle = ''
  font = ''
  globalAlpha = 1
  texts: string[] = []

  fillRect(): void {}
  fillText(text: string): void {
    this.texts.push(text)
  }
  measureText(text: string): { width: number } {
    const hit = /(\d+(?:\.\d+)?)px/.exec(this.font)
    const px = hit ? Number(hit[1]) : 14
    return { width: Array.from(text).length * px }
  }
  save(): void {}
  restore(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arc(): void {}
  fill(): void {}
  stroke(): void {}
}

const SIZE = { w: 430, h: 900 }

function boot(seed: number = 4242): { game: Game; ctx: FakeCtx } {
  const ctx = new FakeCtx()
  const game = new Game({ ctx: ctx, width: SIZE.w, height: SIZE.h, seed: seed })
  game.render()
  return { game: game, ctx: ctx }
}

function find(game: Game, id: string): { id: string; rect: { x: number; y: number; w: number; h: number }; enabled: boolean } | null {
  return game.regions().find((r) => r.id === id) || null
}

function center(game: Game, id: string): { x: number; y: number } {
  const r = find(game, id)
  if (!r) throw new Error('没有这个命中区域: ' + id)
  return { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 }
}

/** 滚到某条区域进入视口（区域自身坐标来自上一次 render）。 */
function reveal(game: Game, id: string, at: number = 200): { x: number; y: number; w: number; h: number } {
  for (let i = 0; i < 12; i++) {
    game.render()
    const r = find(game, id)
    if (!r) throw new Error('没有这个命中区域: ' + id)
    if (r.rect.y < SIZE.h && r.rect.y + r.rect.h > 0) return r.rect
    game.scrollPage(Math.max(0, game.scrolled + r.rect.y - at))
  }
  game.render()
  const r = find(game, id)
  if (!r || r.rect.y >= SIZE.h || r.rect.y + r.rect.h <= 0) throw new Error('滚不到可见位置: ' + id)
  return r.rect
}

function startTrade(game: Game): void {
  game.render()
  const p = center(game, 'org:0')
  game.tap(p.x, p.y)
  game.render()
  expect(game.view).toBe('trade')
}

function drag(game: Game, x: number, y0: number, y1: number): void {
  game.down(x, y0)
  game.move(x, (y0 + y1) / 2)
  game.move(x, y1)
  game.up()
}

describe('交易页滚动与命中', () => {
  it('滚动偏移：命中区域与绘制同步位移，旧坐标不再命中', () => {
    const { game } = boot()
    startTrade(game)

    const s0 = find(game, 'step')
    expect(s0).not.toBeNull()
    // 一屏放不下：主按钮在折叠线以下，未滚动时不可点
    expect(s0!.enabled).toBe(false)

    drag(game, SIZE.w / 2, 700, 400)
    expect(game.scrolled).toBeCloseTo(300, 5)
    game.render()

    const s1 = find(game, 'step')!
    // 同一个按钮：屏幕坐标正好减去滚动偏移（画在哪就点在哪）
    expect(s1.rect.y).toBeCloseTo(s0!.rect.y - game.scrolled, 5)

    // 滚到底，按钮进入视口后可点
    game.scrollPage(1e9)
    game.render()
    const s2 = find(game, 'step')!
    expect(s2.enabled).toBe(true)

    // 用「未滚动时的那个屏幕坐标」去点：不该触发推进（偏移没扣就点错了）
    const qi0 = game.game!.s.qi
    game.tap(s2.rect.x + s2.rect.w / 2, s0!.rect.y + 4)
    expect(game.game!.s.qi).toBe(qi0)

    // 用当前坐标点：推进一季
    const p = center(game, 'step')
    game.tap(p.x, p.y)
    expect(game.game!.s.qi).toBe(qi0 + 1)
  })

  it('拖动超过 6px 视为滚动，不触发点击；原地轻点才生效', () => {
    const { game } = boot()
    startTrade(game)
    const gate = reveal(game, 'gate:watch', 260)
    const cx = gate.x + gate.w / 2
    const cy = gate.y + gate.h / 2

    const scroll0 = game.scrolled
    expect(scroll0).toBeGreaterThan(45)
    game.down(cx, cy)
    game.move(cx, cy + 20)
    game.move(cx, cy + 45)
    game.up()
    expect(game.gate).toBeNull()
    expect(game.scrolled).toBeCloseTo(scroll0 - 45, 5)

    const g2 = find(game, 'gate:watch')!
    game.tap(g2.rect.x + g2.rect.w / 2, g2.rect.y + g2.rect.h / 2)
    expect(game.gate).toBe('watch')
  })

  it('嵌套滚动：手势在日志区里先被内层消费，内层能滚、整页不动', () => {
    const { game } = boot(90210)
    startTrade(game)

    // 先攒够日志（内外层都还有得滚）：过几季，撞上事件就用第一个选项
    for (let i = 0; i < 12; i++) {
      const screen: string = game.view
      if (screen !== 'trade') break
      reveal(game, 'step', 760)
      const p = center(game, 'step')
      game.tap(p.x, p.y)
      if (game.view === 'event') {
        const r = reveal(game, 'ev:0', 300)
        game.tap(r.x + r.w / 2, r.y + r.h / 2)
      }
    }
    expect(game.view).toBe('trade')
    expect(game.logScrolled).toBeGreaterThan(0)

    const area = reveal(game, LOG_AREA_ID, 320)
    const page0 = game.scrolled
    const log0 = game.logScrolled
    const cx = area.x + area.w / 2

    // 往「下」拖 = 日志回看更早的行：内层真的动了，整页一像素没动
    drag(game, cx, area.y + 30, area.y + 90)
    expect(game.logScrolled).toBeLessThan(log0)
    expect(game.scrolled).toBe(page0)

    // 反过来：在日志区外面拖，只动整页，不动内层
    const log1 = game.logScrolled
    drag(game, cx, area.y - 200, area.y - 130)
    expect(game.scrolled).toBeLessThan(page0)
    expect(game.logScrolled).toBe(log1)
  })

  it('惯性由 frame(dt) 推进：松手后继续滑，衰减后停住', () => {
    const { game } = boot()
    startTrade(game)
    game.scrollPage(0)
    game.render()

    game.down(SIZE.w / 2, 700)
    game.move(SIZE.w / 2, 660)
    game.frame(0.016)
    game.move(SIZE.w / 2, 620)
    game.frame(0.016)
    game.up()
    const s1 = game.scrolled
    expect(s1).toBeGreaterThan(0)

    game.frame(0.016)
    expect(game.scrolled).toBeGreaterThan(s1)

    for (let i = 0; i < 240; i++) game.frame(0.016)
    const s2 = game.scrolled
    game.frame(0.016)
    game.frame(0.016)
    expect(game.scrolled).toBe(s2)
  })

  it('同 seed + 同滚动偏移：两次渲染逐字一致', () => {
    const a = boot(777)
    const b = boot(777)
    for (const g of [a, b]) {
      startTrade(g.game)
      g.game.scrollPage(420)
      g.game.render()
      g.ctx.texts.length = 0
      g.game.render()
    }
    expect(a.ctx.texts.join('|')).toBe(b.ctx.texts.join('|'))
    expect(a.ctx.texts.length).toBeGreaterThan(40)
  })
})

describe('交易页内容', () => {
  it('消息卡三态：未核是 ·，打探后 ◆ 真 / ◇ 假的', () => {
    const { game, ctx } = boot()
    startTrade(game)
    ctx.texts.length = 0
    game.render()
    expect(ctx.texts.join('|')).not.toContain('◆')
    expect(ctx.texts.join('|')).toContain('未核')

    game.game!.s.probed = true
    ctx.texts.length = 0
    game.render()
    const all = ctx.texts.join('|')
    expect(all).toContain('◆')
    expect(all).toContain('◇')
    expect(all).toContain('真')
    expect(all).toContain('假的')
    expect(all).toContain('已摸清来路')
  })

  it('行动点用完：打探与七扇门都禁用，点了不生效', () => {
    const { game } = boot()
    startTrade(game)
    game.game!.s.ap = 0

    // 把打探按钮滚进视口：禁用必须是因为「行动点用完」，而不是因为在屏幕外
    game.render()
    const off = find(game, 'probe')!
    game.scrollPage(Math.max(0, game.scrolled + off.rect.y - 200))
    game.render()
    const pr = find(game, 'probe')!
    expect(pr.rect.y).toBeGreaterThan(0)
    expect(pr.rect.y).toBeLessThan(SIZE.h)
    expect(pr.enabled).toBe(false)

    game.tap(pr.rect.x + pr.rect.w / 2, pr.rect.y + pr.rect.h / 2)
    expect(game.game!.s.probed).toBe(false)

    const gate = find(game, 'gate:watch')!
    expect(gate.enabled).toBe(false)
  })

  it('日志流按年份分组、窗口化只画可见行', () => {
    const rows = buildLogRows(
      [
        { text: '一', tone: 'a', year: 1991 },
        { text: '二', tone: 'r', year: 1991 },
        { text: '三', tone: 'g', year: 1992 },
        { text: '四', tone: 'gold', year: 1992 },
        { text: '五', tone: 'w', year: 1993 },
        { text: '六', tone: 'dim', year: 1993 },
        { text: '七', tone: 'a', year: 1994 },
        { text: '八', tone: 'a', year: 1994 },
        { text: '九', tone: 'a', year: 1995 },
        { text: '十', tone: 'a', year: 1995 },
      ],
      '—',
    )
    expect(rows.map((r) => r.kind)).toEqual([
      'year', 'item', 'item',
      'year', 'item', 'item',
      'year', 'item', 'item',
      'year', 'item', 'item',
      'year', 'item', 'item',
    ])
    expect(rows[0].text).toBe('1991')

    const vh = logViewH()
    const top = windowSlice(rows, 0, vh)
    expect(top.start).toBe(0)
    expect(top.end).toBe(LOG_VIEW_ROWS)

    const max = maxOffset(rows.length, vh)
    const bottom = windowSlice(rows, max, vh)
    expect(bottom.end).toBe(rows.length)
    expect(bottom.end - bottom.start).toBe(LOG_VIEW_ROWS)

    // 越界的偏移被夹住：不会切出空窗口
    expect(windowSlice(rows, 1e9, vh)).toEqual(bottom)
    expect(windowSlice(rows, -50, vh)).toEqual(top)

    // 日志面板只画窗口里那几行（12 行数据不会全画出来）
    const { game, ctx } = boot()
    startTrade(game)
    game.scrollPage(1e9)
    ctx.texts.length = 0
    game.render()
    expect(ctx.texts.filter((s) => s === '1991').length).toBeLessThanOrEqual(1)
  })
})
