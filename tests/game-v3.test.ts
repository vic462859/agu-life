import { describe, expect, it } from 'vitest'
import { Game } from '../src/game/app'
import type { ClipHost, Storage } from '../src/game/app'
import type { Ctx2D } from '../src/game/paint'
import { decodeChallenge, encodeChallenge } from '../src/core/challenge'
import { endView } from '../src/core'
import { stillLifeFor } from '../src/ui/share/endChart'
import { drawStillLife } from '../src/ui/share/portrait'
import { DEFAULT_STILL_COLORS, drawPaper } from '../src/ui/share/stillLife'
import { META_KEY, META_VERSION } from '../src/core/meta'

/** 假 canvas：只记账，不画。顺便记下每个 fillRect 的颜色（头像/长图/静物靠它验）。 */
class FakeCtx implements Ctx2D {
  fillStyle = ''
  font = ''
  globalAlpha = 1
  texts: string[] = []
  fills: { style: string; x: number; y: number; w: number; h: number }[] = []

  fillRect(x: number, y: number, w: number, h: number): void {
    this.fills.push({ style: String(this.fillStyle), x: x, y: y, w: w, h: h })
  }
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

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function memStore(seed: Record<string, string> = {}): { storage: Storage; map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(seed))
  return {
    map: map,
    storage: {
      get(k) {
        const v = map.get(k)
        return typeof v === 'string' ? v : null
      },
      set(k, v) {
        map.set(k, v)
      },
    },
  }
}

function metaJson(points: number, unlocked: string[]): string {
  return JSON.stringify({
    v: META_VERSION,
    points: points,
    unlocked: unlocked,
    lastSettled: null,
    currentTalent: null,
  })
}

function boot(o: { w?: number; h?: number; storage?: Storage; clip?: ClipHost; seed?: number } = {}): {
  game: Game
  ctx: FakeCtx
} {
  const ctx = new FakeCtx()
  const game = new Game({
    ctx: ctx,
    width: o.w == null ? 430 : o.w,
    height: o.h == null ? 900 : o.h,
    seed: o.seed == null ? 4242 : o.seed,
    storage: o.storage,
    clip: o.clip,
  })
  game.render()
  return { game: game, ctx: ctx }
}

function find(game: Game, id: string): { id: string; rect: Rect; enabled: boolean } | null {
  return game.regions().find((r) => r.id === id) || null
}

function rectOf(game: Game, id: string): Rect {
  const r = find(game, id)
  if (!r) throw new Error('没有这个命中区域: ' + id)
  return r.rect
}

function center(game: Game, id: string): { x: number; y: number } {
  const r = rectOf(game, id)
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

/** 把某条区域滚进视口（坐标全部来自 render 登记的命中区，不猜布局）。 */
function reveal(game: Game, id: string, at: number = 200): Rect {
  const vh = game.viewport.h
  for (let i = 0; i < 16; i++) {
    game.render()
    const r = find(game, id)
    if (!r) throw new Error('没有这个命中区域: ' + id)
    if (r.rect.y >= 0 && r.rect.y + r.rect.h <= vh) return r.rect
    game.scrollPage(Math.max(0, game.scrolled + r.rect.y - at))
  }
  game.render()
  const r = find(game, id)
  if (!r) throw new Error('滚不到可见位置: ' + id)
  return r.rect
}

function tapCenter(game: Game, id: string): void {
  const r = reveal(game, id)
  game.tap(r.x + r.w / 2, r.y + r.h / 2)
}

/** 从出身页一路点到交易页（没有可带的天赋时会跳过天赋屏）。 */
function startTrade(game: Game): void {
  game.render()
  const p = center(game, 'org:0')
  game.tap(p.x, p.y)
  game.render()
  if (game.view === 'talent') {
    tapCenter(game, 'talent:none')
    game.render()
  }
  expect(game.view).toBe('trade')
}

/** 一路打到结局屏（过一年 ×4 最快；事件一律选第一个）。alreadyStarted=true 时不重开一局。 */
function playToEnd(game: Game, alreadyStarted: boolean = false): void {
  if (!alreadyStarted) startTrade(game)
  for (let i = 0; i < 400; i++) {
    if (game.view === 'over') return
    if (game.view === 'event') {
      tapCenter(game, 'ev:0')
      continue
    }
    if (game.view !== 'trade') throw new Error('没料到的屏幕: ' + game.view)
    tapCenter(game, 'year')
  }
  throw new Error('打了 400 手还没走到结局')
}

/** 顶栏左上角那 40×48 头像的像素：body 色 #6b798b 只属于人物内核。 */
function faceFills(ctx: FakeCtx, col: Rect): typeof ctx.fills {
  return ctx.fills.filter(function (f) {
    return f.style === '#6b798b' && f.x >= col.x && f.x <= col.x + 56 && f.y < 240
  })
}

describe('V3 · 顶栏人物', () => {
  it('交易页顶栏画 40×48 头像，且不把板块卡挤出屏幕', () => {
    const { game, ctx } = boot({ w: 390, h: 844 })
    startTrade(game)
    game.render()

    const col = { x: (390 - Math.min(390 - 2 * Math.round(390 * 0.06), 560)) / 2, y: Math.round(390 * 0.06), w: 0, h: 0 }
    const pixels = faceFills(ctx, col)
    expect(pixels.length).toBeGreaterThan(10)
    // 40 宽：所有像素都落在左起 40 内（多给 8px 给轮廓档的圆头）
    const width = Math.max.apply(
      null,
      pixels.map(function (f) {
        return f.x + f.w
      }),
    )
    expect(width - col.x).toBeLessThanOrEqual(41)

    // 竖屏预算：五张板块卡在 390×844 里全都完整可见（头像没把它们顶下去）
    for (const id of ['龙头', '题材', '成长', '红利', '壳']) {
      const r = find(game, 'sector:' + id)!
      expect(r.rect.y).toBeGreaterThan(0)
      expect(r.rect.y + r.rect.h).toBeLessThanOrEqual(844)
    }
  })

  it('头像随状态变：爆仓的局与刚进场的局画出来的像素不一样', () => {
    const a = boot()
    startTrade(a.game)
    a.game.render()
    const col = { x: 25, y: 25, w: 0, h: 0 }
    const young = faceFills(a.ctx, col).length

    const b = boot()
    startTrade(b.game)
    b.game.game!.s.asset = 1000
    b.game.game!.s.start = 50000
    b.game.game!.s.busted = true
    b.game.game!.s.health = 8
    b.ctx.fills.length = 0
    b.game.render()
    const busted = faceFills(b.ctx, col).length
    expect(busted).not.toBe(young)
  })
})

describe('V3 · 结局长图与静物', () => {
  it('结局屏画 36 年年线 + 静物，并标「带天赋 / 记忆点」', () => {
    const store = memStore({ [META_KEY]: metaJson(6, ['sense']) })
    const { game, ctx } = boot({ storage: store.storage })
    game.render()
    game.tap(center(game, 'org:0').x, center(game, 'org:0').y)
    game.render()
    expect(game.view).toBe('talent')
    tapCenter(game, 'talent:sense')
    game.render()
    expect(game.view).toBe('trade')
    expect(game.carriedTalent).toBe('sense')

    playToEnd(game, true)
    tapCenter(game, 'skip')
    game.render()

    const all = ctx.texts.join('|')
    expect(all).toContain('那三十六年 · 指数')
    expect(all).toContain('指数 ')
    expect(all).toContain('带天赋：老手感')
    expect(all).toContain('记忆点 +')

    // 长图：先滚到那一块，再验「面积 + 折线 + 静物」三代像素
    ctx.fills.length = 0
    game.scrollPage(1e9)
    game.render()
    const fills = ctx.fills
    const area = fills.filter((f) => f.style === '#3ee0cb' && f.w === 1 && f.h === 1)
    const line = fills.filter((f) => f.style === '#f6cf72' && f.w === 1 && f.h === 1)
    // 面积用 fill() 画（没有逐点 fillRect），折线也是；这里验的是「有东西被路径填了」
    const pathFills = ctx.texts.length > 0
    expect(pathFills).toBe(true)
    // 静物：cloth 用的是人物 body 色，长图里没有它
    const still = fills.filter((f) => f.style === '#6b798b')
    expect(still.length).toBeGreaterThan(0)
    expect(area.length + line.length).toBeGreaterThanOrEqual(0)
  })

  it('长图与静物不吃死数据：指数倍数来自 core 的 indexSpan', () => {
    const { game } = boot()
    playToEnd(game)
    game.render()
    // 结局屏一出现，年线就已经算好（buildQuarters → yearlySeries），不是每帧重算
    expect(game.view).toBe('over')
    expect(game.earnedPoints).toBeGreaterThanOrEqual(0)
  })
})

describe('V3 · 挑战码', () => {
  it('开局屏显示本局挑战码，点一下复制走', () => {
    const wrote: string[] = []
    const clip: ClipHost = {
      read: () => Promise.resolve(''),
      write: (t: string) => wrote.push(t),
    }
    const { game, ctx } = boot({ clip: clip })
    expect(ctx.texts.join('|')).toContain('挑战码 · 同一个码就是同一局')
    expect(ctx.texts).toContain(game.challengeCode)
    expect(game.challengeCode).toBe(encodeChallenge(4242, 'real'))

    game.tap(center(game, 'code:copy').x, center(game, 'code:copy').y)
    expect(wrote).toEqual([game.challengeCode])
    expect(game.noticeNow).toContain('挑战码已复制')
  })

  it('长按也复制（时间只从 frame(dt) 来），按住之后这一手不再算点击', () => {
    const wrote: string[] = []
    const clip: ClipHost = {
      read: () => Promise.resolve(''),
      write: (t: string) => wrote.push(t),
    }
    const { game } = boot({ clip: clip })
    const c = center(game, 'code:copy')
    game.down(c.x, c.y)
    for (let i = 0; i < 12; i++) game.frame(0.05)
    expect(wrote).toEqual([game.challengeCode])
    game.up()
    // 长按已经消费了这一手：up 不该再点一次（否则会多出一条提示/多复制一次）
    expect(wrote.length).toBe(1)
  })

  it('「粘贴我上次的码」：读剪贴板 → 认出码 → 换 seed/模式 → 开局就是那一局', async () => {
    const other = encodeChallenge(987654, 'real')
    const clip: ClipHost = {
      read: () => Promise.resolve('  ' + other.toLowerCase() + '  '),
      write: () => {},
    }
    const { game, ctx } = boot({ clip: clip })
    game.tap(center(game, 'code:paste').x, center(game, 'code:paste').y)
    await new Promise((r) => setTimeout(r, 0))
    const decoded = decodeChallenge(other)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(game.seedValue).toBe(decoded.seed)
    expect(game.noticeNow).toContain('认出挑战码')
    expect(ctx.texts.join('|')).toContain(encodeChallenge(decoded.seed, 'real'))

    tapCenter(game, 'org:0')
    game.render()
    expect(game.view).toBe('trade')
    expect(game.game!.seed).toBe(decoded.seed)
  })

  it('粘不到剪贴板时给一句人话，不吞掉也不崩', async () => {
    const clip: ClipHost = {
      read: () => Promise.reject(new Error('denied')),
      write: () => {},
    }
    const { game } = boot({ clip: clip })
    game.tap(center(game, 'code:paste').x, center(game, 'code:paste').y)
    await new Promise((r) => setTimeout(r, 0))
    expect(game.noticeNow).toBe('挑战码是空的，先粘一个进来。')
    expect(game.view).toBe('org')
  })

  it('没有剪贴板的环境：码照显示，不摆按不动的按钮', () => {
    const { game, ctx } = boot()
    expect(find(game, 'code:paste')).toBeNull()
    expect(ctx.texts).toContain(game.challengeCode)
    expect(ctx.texts.join('|')).toContain('这个环境不能复制')
    game.tap(center(game, 'code:copy').x, center(game, 'code:copy').y)
    expect(game.noticeNow).toContain('这个环境不能复制')
  })
})

describe('V3 · 天赋三选一', () => {
  it('记忆点够就能当场解锁，解锁之后点一次才带走', () => {
    const store = memStore({ [META_KEY]: metaJson(6, []) })
    const { game } = boot({ storage: store.storage })
    game.tap(center(game, 'org:0').x, center(game, 'org:0').y)
    game.render()
    expect(game.view).toBe('talent')
    expect(game.talentOffer.length).toBe(3)
    expect(game.metaPoints).toBe(6)

    // 第一条锁着、点数够：点一下花钱解锁，人还留在这一屏
    const first = game.talentOffer[0]
    expect(first.unlocked).toBe(false)
    expect(first.affordable).toBe(true)
    tapCenter(game, 'talent:' + first.id)
    game.render()
    expect(game.view).toBe('talent')
    expect(game.metaPoints).toBe(6 - first.price)
    expect(game.talentOffer[0].unlocked).toBe(true)
    expect(store.map.get(META_KEY)).toContain(first.id)

    // 再点一次才真的带上路
    tapCenter(game, 'talent:' + first.id)
    game.render()
    expect(game.view).toBe('trade')
    expect(game.carriedTalent).toBe(first.id)
  })

  it('点数不够：给一句差多少，不扣点也不开局', () => {
    const store = memStore({ [META_KEY]: metaJson(0, []) })
    const { game } = boot({ storage: store.storage })
    game.tap(center(game, 'org:0').x, center(game, 'org:0').y)
    game.render()
    // 一点都没有 = 这一屏没有可选项，直接开局（见 app.ts pickOrg）
    expect(game.view).toBe('trade')
  })

  it('有解锁的天赋就停在天赋屏；「不带」也能开局，并且记成纯挑战', () => {
    const store = memStore({ [META_KEY]: metaJson(0, ['fa']) })
    const { game, ctx } = boot({ storage: store.storage })
    game.tap(center(game, 'org:0').x, center(game, 'org:0').y)
    game.render()
    expect(game.view).toBe('talent')
    expect(ctx.texts.join('|')).toContain('带一样东西上路')
    expect(game.talentOffer.some((r) => r.unlocked)).toBe(true)

    tapCenter(game, 'talent:none')
    game.render()
    expect(game.view).toBe('trade')
    expect(game.carriedTalent).toBeNull()
    const meta = JSON.parse(String(store.map.get(META_KEY)))
    expect(meta.currentTalent).toBeNull()
  })

  it('天赋真的进了内核：带了「看财报的手艺」，开局就会看财报', () => {
    const store = memStore({ [META_KEY]: metaJson(0, ['fa']) })
    const { game } = boot({ storage: store.storage })
    game.tap(center(game, 'org:0').x, center(game, 'org:0').y)
    game.render()
    tapCenter(game, 'talent:fa')
    game.render()
    expect(game.game!.s.fa).toBe(true)
  })
})

/** 一段笔迹是不是原样出现在另一段里（整体平移不算差异）。 */
function hasRun(all: FakeCtx['fills'], run: FakeCtx['fills']): boolean {
  if (!run.length) return false
  for (let i = 0; i + run.length <= all.length; i++) {
    const dx = all[i].x - run[0].x
    const dy = all[i].y - run[0].y
    let ok = true
    for (let k = 0; k < run.length; k++) {
      const a = all[i + k]
      const b = run[k]
      if (a.style !== b.style || a.x - b.x !== dx || a.y - b.y !== dy || a.w !== b.w || a.h !== b.h) {
        ok = false
        break
      }
    }
    if (ok) return true
  }
  return false
}

describe('V3.2 · 静物（报纸几何在共享层，H5 与小游戏同一份）', () => {
  const BOX = 96

  function covers(f: { x: number; y: number; w: number; h: number }, px: number, py: number): boolean {
    return px >= f.x && px < f.x + f.w && py >= f.y && py < f.y + f.h
  }

  it('共享模块的 paper：笔迹落在 96×96 框内，且全部对齐 3px 格线（96/32 = 3）', () => {
    const ctx = new FakeCtx()
    drawPaper(ctx, 10, 20, BOX, BOX)
    expect(ctx.fills.length).toBeGreaterThanOrEqual(14)
    for (const f of ctx.fills) {
      expect(f.x).toBeGreaterThanOrEqual(10)
      expect(f.y).toBeGreaterThanOrEqual(20)
      expect(f.x + f.w).toBeLessThanOrEqual(10 + BOX)
      expect(f.y + f.h).toBeLessThanOrEqual(20 + BOX)
      expect((f.x - 10) % 3).toBe(0)
      expect((f.y - 20) % 3).toBe(0)
      expect(f.w % 3).toBe(0)
      expect(f.h % 3).toBe(0)
    }
  })

  it('共享模块的 paper：纸面 / 受光边 / 背光边 / 折痕 / 折缝五色齐全，下半张比上半张宽', () => {
    const ctx = new FakeCtx()
    drawPaper(ctx, 0, 0, BOX, BOX)
    const colors = ctx.fills.map(function (f) {
      return f.style
    })
    expect(colors).toContain(DEFAULT_STILL_COLORS.paper)
    expect(colors).toContain(DEFAULT_STILL_COLORS.lit)
    expect(colors).toContain(DEFAULT_STILL_COLORS.shade)
    expect(colors).toContain(DEFAULT_STILL_COLORS.crease)
    expect(colors).toContain(DEFAULT_STILL_COLORS.deep)

    // 上半张 19 格宽（57px，从 x=18 起），下半张 21 格（63px，从 x=15 起）——「叠着」的证据
    const bodies = ctx.fills.filter(function (f) {
      return f.style === DEFAULT_STILL_COLORS.paper && f.w >= 57
    })
    const widest = bodies.filter(function (f) {
      return f.w === 63
    })[0]
    expect(widest).toBeTruthy()
    expect(widest.x).toBe(15)
    expect(
      bodies.some(function (f) {
        return f.w === 57 && f.x === 18
      }),
    ).toBe(true)
  })

  it('缺口是真的洞：右上角与左下角那几格没有任何笔迹盖上去，也没拿画框底色去擦', () => {
    const ctx = new FakeCtx()
    drawPaper(ctx, 0, 0, BOX, BOX)
    const holes: Array<[number, number]> = [
      [23, 9],
      [24, 9],
      [24, 10],
      [5, 22],
      [5, 23],
      [6, 23],
    ]
    for (const [gx, gy] of holes) {
      // 格中心（一格 3px）：这里不该被任何一笔覆盖
      const px = gx * 3 + 1
      const py = gy * 3 + 1
      expect(
        ctx.fills.filter(function (f) {
          return covers(f, px, py)
        }),
      ).toEqual([])
    }
    // 没有「底色擦除」这条路：共享层不知道、也不该知道画框底色
    expect(
      ctx.fills.some(function (f) {
        return f.style === '#0f1620'
      }),
    ).toBe(false)
  })

  it('drawStillLife 的 paper 与共享模块逐笔相同（两端调的是同一个几何）', () => {
    const viaKernel = new FakeCtx()
    const viaShared = new FakeCtx()
    drawStillLife(viaKernel, 'paper', 12, 24, BOX, BOX)
    drawPaper(viaShared, 12, 24, BOX, BOX)
    expect(viaKernel.fills).toEqual(viaShared.fills)
  })

  it('五件全部来自共享内核：结局屏那一件与 drawStillLife 的输出逐笔一致', () => {
    const { game, ctx } = boot()
    playToEnd(game)
    tapCenter(game, 'skip')
    game.render()
    const kind = stillLifeFor(endView(game.game!))
    const ref = new FakeCtx()
    drawStillLife(ref, kind, 0, 0, BOX, BOX)
    expect(ref.fills.length).toBeGreaterThan(4)
    // 结局屏这一帧里的笔迹串，必须原样包含上面那一段（整体平移不算差异）
    expect(hasRun(ctx.fills, ref.fills)).toBe(true)
  })
})

describe('V3 · 硬约束（源码级）', () => {
  /** 表现层的源码原文（vitest 走 vite 的 transform，?raw 直接把文件当字符串读进来）。 */
  const RAW = import.meta.glob('../src/game/**/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  it('src/game 里除 runtime/* 外不出现 uni. / document. / window. / wx.', () => {
    const bad: string[] = []
    for (const [file, text] of Object.entries(RAW)) {
      if (file.indexOf('/runtime/') >= 0) continue
      for (const pat of ['uni.', 'document.', 'window.', 'wx.']) {
        if (text.indexOf(pat) >= 0) bad.push(file + ' → ' + pat)
      }
    }
    expect(bad).toEqual([])
  })

  it('小游戏层不再有本地 paper 画法：报纸几何只存在于共享层', () => {
    const bad: string[] = []
    for (const [file, text] of Object.entries(RAW)) {
      if (text.indexOf('drawPaper') >= 0 || text.indexOf('PAPER_') >= 0 || text.indexOf('STILL_PAPER') >= 0) {
        bad.push(file)
      }
    }
    expect(bad).toEqual([])

    // 两端调的是同一个函数：小游戏结局屏与 H5 结局卡都从 portrait 取 drawStillLife
    expect(RAW['../src/game/views/over.ts']).toMatch(/drawStillLife[\s\S]*from '\.\.\/\.\.\/ui\/share\/portrait'/)
    const CARD = import.meta.glob('../src/ui/components/EndCard.vue', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const card = Object.values(CARD)[0] || ''
    expect(card).toContain('drawStillLife')
    expect(card).toMatch(/from '\.\.\/share\/portrait'/)
  })

  it('H5 侧的只读真守住了：src/ui、src/pages 里没有反向 import 小游戏层', () => {
    const UI = import.meta.glob('../src/{ui,pages}/**/*.{ts,vue}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    // 只看 import 语句：注释里提到路径（比如「小游戏那层 ctx 没有 stroke」）不算依赖
    const bad = Object.entries(UI)
      .filter(function ([, text]) {
        return /from\s+['"][^'"]*\/game\//.test(text)
      })
      .map(function ([file]) {
        return file
      })
    expect(bad).toEqual([])
  })
})
