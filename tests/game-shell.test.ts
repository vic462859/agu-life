import { describe, expect, it } from 'vitest'
import { Game } from '../src/game/app'
import { Layout } from '../src/game/layout'
import type { Ctx2D } from '../src/game/paint'

/** 假 canvas：只记账，不画。字体宽按「一个码点 = 一个字号」估，足够让换行工作。 */
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

function boot(): { game: Game; ctx: FakeCtx } {
  const ctx = new FakeCtx()
  const game = new Game({ ctx: ctx, width: SIZE.w, height: SIZE.h, seed: 4242 })
  game.render()
  return { game: game, ctx: ctx }
}

function center(game: Game, id: string): { x: number; y: number } {
  const r = game.regions().find((h) => h.id === id)
  if (!r) throw new Error('没有这个命中区域: ' + id)
  return { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 }
}

describe('渲染层外壳', () => {
  it('首屏是三张出身卡，点第一张进交易页', () => {
    const { game, ctx } = boot()
    const orgs = game.regions().filter((r) => r.id.indexOf('org:') === 0)
    expect(orgs.length).toBe(3)
    expect(ctx.texts).toContain('厂里子弟')

    const p = center(game, 'org:0')
    game.tap(p.x, p.y)
    game.render()
    expect(game.view).toBe('trade')

    const ids = game.regions().map((r) => r.id)
    expect(ids.filter((i) => i.indexOf('sector:') === 0).length).toBe(5)
    expect(ids.filter((i) => i.indexOf('pos:') === 0).length).toBe(4)
    expect(ids).toContain('step')
    expect(ctx.texts).toContain('1991 年 · Q1')
  })

  it('过一季：季数前进，日志多出一条，资产变化', () => {
    const { game, ctx } = boot()
    const p = center(game, 'org:0')
    game.tap(p.x, p.y)
    // 交易页比一屏高：主按钮在折叠线以下，先滚到底（命中区域跟着偏移一起走）
    game.scrollPage(1e9)
    game.render()

    const before = game.game
    expect(before).not.toBeNull()
    const asset0 = before!.s.asset
    const logLines0 = ctx.texts.filter((s) => s.indexOf('你拿了') >= 0).length

    const stepAt = center(game, 'step')
    game.tap(stepAt.x, stepAt.y)
    game.render()

    const after = game.game!
    expect(after.s.qi).toBe(before!.s.qi + 1)
    expect(after.s.asset).not.toBe(asset0)
    expect(ctx.texts.filter((s) => s.indexOf('你拿了') >= 0).length).toBe(logLines0 + 1)
  })

  it('命中判定后进先出：后登记的压在先登记的上面', () => {
    const r = { x: 10, y: 10, w: 100, h: 40 }
    const L = new Layout(400, 800)
    L.hit('下面', r)
    expect(L.tap(20, 20)).toBe('下面')
    L.hit('上面', r)
    expect(L.tap(20, 20)).toBe('上面')
    expect(L.tap(500, 500)).toBeNull()

    // 上层禁用时穿透到下层（比如被遮罩挡住的按钮）
    const L2 = new Layout(400, 800)
    L2.hit('下面', r)
    L2.hit('遮罩', r, false)
    expect(L2.tap(20, 20)).toBe('下面')
  })

  it('同 seed 两次渲染逐字一致（布局不读时间）', () => {
    const a = boot()
    const b = boot()
    for (const g of [a, b]) {
      const p = center(g.game, 'org:2')
      g.game.tap(p.x, p.y)
      g.game.scrollPage(1e9)
      g.game.render()
      const s = center(g.game, 'step')
      g.game.tap(s.x, s.y)
      g.game.render()
    }
    expect(a.ctx.texts.join('|')).toBe(b.ctx.texts.join('|'))
    expect(a.ctx.texts.length).toBeGreaterThan(20)
  })
})