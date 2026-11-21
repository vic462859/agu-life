import { describe, expect, it } from 'vitest'
import { CountUp, Ritual } from '../src/game/anim'
import { Game } from '../src/game/app'
import type { Storage } from '../src/game/app'
import { Layout } from '../src/game/layout'
import type { Ctx2D } from '../src/game/paint'
import type { PosterSink } from '../src/game/posterjob'
import { readSenses, SENS_KEY, writeSenses } from '../src/game/sfx'
import type { HapticKind, HapticPlay, SfxKind, SfxPlay } from '../src/game/sfx'

/** 假 canvas：只记账，不画。顺便记下每个 fillRect 的底色（主/次按钮要靠它验）。 */
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

const W = 430
const H = 900

function boot(
  o: {
    h?: number
    storage?: Storage
    sfx?: SfxPlay
    haptic?: HapticPlay
    poster?: PosterSink
    seed?: number
  } = {},
): {
  game: Game
  ctx: FakeCtx
} {
  const ctx = new FakeCtx()
  const game = new Game({
    ctx: ctx,
    width: W,
    height: o.h || H,
    seed: o.seed == null ? 4242 : o.seed,
    storage: o.storage,
    sfx: o.sfx,
    haptic: o.haptic,
    poster: o.poster,
  })
  game.render()
  return { game: game, ctx: ctx }
}

function find(
  game: Game,
  id: string,
): { id: string; rect: Rect; enabled: boolean } | null {
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

function startTrade(game: Game): void {
  game.render()
  const p = center(game, 'org:0')
  game.tap(p.x, p.y)
  game.render()
  expect(game.view).toBe('trade')
}

/** 推进 n 季：撞上事件就用第一个选项。 */
function advance(game: Game, n: number): void {
  for (let i = 0; i < n; i++) {
    if (game.view === 'event') {
      tapCenter(game, 'ev:0')
      continue
    }
    if (game.view !== 'trade') return
    tapCenter(game, 'step')
  }
}

/** 一路打到结局屏（过一年 ×4 最快；晚年事件一场接一场）。 */
function playToEnd(game: Game): void {
  startTrade(game)
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

/** 内存存储：同一份 map 交给两个 Game，就是「同一个玩家重开页面」。 */
function memStore(): { storage: Storage; map: Map<string, string> } {
  const map = new Map<string, string>()
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

describe('MG3 · 事件卡层', () => {
  it('遮罩不可点穿：事件屏只有遮罩与选项两层，点在遮罩上什么都不会发生', () => {
    const { game } = boot()
    startTrade(game)
    advance(game, 6)
    expect(game.view).toBe('event')
    game.render()

    const ids = game.regions().map((r) => r.id)
    // 交易页的命中全留在下面那层（一次性 Layout），能接点击的只有遮罩 + 选项
    expect(ids[0]).toBe('mask')
    expect(ids.every((id) => id === 'mask' || id.indexOf('ev:') === 0)).toBe(true)

    const pending = game.game!.pending
    const qi = game.game!.s.qi
    // 屏幕左上角（卡片之外）点一下：遮罩吃掉这一手，不推进、不选选项
    game.tap(2, 2)
    expect(game.view).toBe('event')
    expect(game.game!.pending).toEqual(pending)
    expect(game.game!.s.qi).toBe(qi)

    // Layout 层再验一次：遮罩先登记、选项后登记，谁在上面一目了然
    const L = new Layout(W, H)
    L.hit('mask', { x: 0, y: 0, w: W, h: H }, true, false)
    L.hit('ev:0', { x: 20, y: 300, w: 200, h: 60 }, true)
    expect(L.tap(30, 310)).toBe('ev:0')
    expect(L.tap(300, 60)).toBe('mask')
    // 遮罩不参与内容高度（mark=false）：卡片短的时候不该凭空多出一截可滚区
    expect(L.contentBottom()).toBe(360)
  })

  it('事件卡滚动：选项跟着内容走，旧坐标不再命中、新坐标点得中', () => {
    // 矮屏：卡片一定超过一屏，才有得滚（事件卡至少两个选项，谁都装不下一整张）
    const { game } = boot({ h: 260 })
    startTrade(game)
    advance(game, 6)
    expect(game.view).toBe('event')
    game.render()
    expect(game.regions().filter((r) => r.id.indexOf('ev:') === 0).length).toBeGreaterThan(1)

    game.scrollPage(0)
    game.render()
    const before = rectOf(game, 'ev:0')

    game.scrollPage(1e9)
    game.render()
    const max = game.scrolled
    expect(max).toBeGreaterThan(0)
    // 退到「选项还留在屏幕上」的位置：只挪一段，不挪到底
    game.scrollPage(Math.min(120, max))
    game.render()
    const scrolled = game.scrolled
    expect(scrolled).toBeGreaterThan(0)

    const after = rectOf(game, 'ev:0')
    // 画在哪就点在哪：屏幕坐标正好是旧坐标减去同一个滚动偏移
    expect(after.y).toBeCloseTo(before.y - scrolled, 5)

    const pending = game.game!.pending
    // 滚动前那个坐标现在落在别处了：它不可能还选中 ev:0（少了这场偏移就会点错）
    const oldY = before.y + before.h / 2
    expect(oldY < after.y || oldY > after.y + after.h).toBe(true)

    // 选项之间的缝（卡片自己的区域）点了不生效，也不会穿到下层
    game.tap(after.x + after.w / 2, after.y + after.h + 4)
    expect(game.game!.pending).toEqual(pending)

    // 用滚动后的坐标点：选项生效
    game.tap(after.x + after.w / 2, after.y + after.h / 2)
    expect(game.game!.pending).toBeNull()
  })
})

describe('MG3 · 结局六层仪式', () => {
  it('逐层可见：0.26s 一层，跳过后六层全在', () => {
    const r = new Ritual(6, 0.26)
    expect(r.stage).toBe(0)
    expect(r.alpha(1)).toBe(0)
    r.advance(0.26)
    expect(r.stage).toBe(1)
    expect(r.alpha(1)).toBe(1)
    expect(r.alpha(2)).toBe(0)
    r.advance(0.13)
    expect(r.stage).toBe(1)
    expect(r.alpha(2)).toBeCloseTo(0.5, 5)
    expect(r.alphas().filter((a) => a > 0).length).toBe(2)
    expect(r.done).toBe(false)
    r.advance(10)
    expect(r.stage).toBe(6)
    expect(r.alphas().every((a) => a === 1)).toBe(true)
    expect(r.done).toBe(true)

    const skip = new Ritual(6, 0.26)
    skip.advance(0.1)
    skip.skip()
    expect(skip.done).toBe(true)
    expect(skip.alphas().every((a) => a === 1)).toBe(true)
  })

  it('结局屏的六层由 frame(dt) 推进，跳过之后 12 项复盘与彩蛋都画出来', () => {
    const { game, ctx } = boot()
    playToEnd(game)
    expect(game.view).toBe('over')
    expect(game.layers.every((a) => a === 0)).toBe(true)

    for (let i = 0; i < 6; i++) game.frame(0.05)
    expect(game.layers[0]).toBe(1)
    expect(game.layers[1]).toBeGreaterThan(0)
    expect(game.layers[2]).toBe(0)
    expect(game.ritualDone).toBe(false)

    game.render()
    // 没演完：只有「跳过」，两个出口按钮还没解锁
    expect(find(game, 'skip')).not.toBeNull()
    expect(find(game, 'poster')!.enabled).toBe(false)
    tapCenter(game, 'skip')
    expect(game.ritualDone).toBe(true)

    ctx.texts.length = 0
    game.render()
    const all = ctx.texts.join('|')
    expect(all).toContain('三十六年复盘')
    expect(all).toContain('12 项')
    expect(all).toContain('档案')
    expect(all).toContain('那三十六年')

    // 出口按钮在内容底部：先滚到底再看它解锁没有
    game.scrollPage(1e9)
    game.render()
    expect(find(game, 'poster')).not.toBeNull()
    expect(ctx.texts.join('|')).toContain('生成战报')
    // 六层演完 = 两个按钮解锁、跳过消失
    expect(find(game, 'poster')!.enabled).toBe(true)
    expect(find(game, 'again')!.enabled).toBe(true)
    expect(find(game, 'skip')).toBeNull()
  })

  it('金额补间收敛到终值（不读系统时间，只用 dt）', () => {
    const c = new CountUp(10000, 0.9)
    expect(c.value).toBe(10000)
    expect(c.done).toBe(true)
    c.set(1200000)
    expect(c.done).toBe(false)
    c.advance(0.3)
    expect(c.value).toBeGreaterThan(10000)
    expect(c.value).toBeLessThan(1200000)
    c.advance(0.6)
    expect(c.value).toBe(1200000)
    expect(c.done).toBe(true)
    // 跳过动画直接落终值
    c.set(2000000)
    c.jump()
    expect(c.value).toBe(2000000)
  })
})

describe('MG3 · 续玩 / 提示 / 分级 / 音效 / 海报', () => {
  it('续玩：读档恢复季数与资产，两个选项都在', () => {
    const store = memStore()
    const first = boot({ storage: store.storage })
    startTrade(first.game)
    advance(first.game, 5)
    const qi = first.game.game!.s.qi
    const asset = first.game.game!.s.asset
    expect(qi).toBeGreaterThan(0)
    expect(store.map.get('agu_life_save_v1:mg1')).toBeTruthy()

    // 第二次启动 = 同一个玩家重开页面
    const second = boot({ storage: store.storage })
    expect(second.game.view).toBe('resume')
    expect(find(second.game, 'resume:go')!.enabled).toBe(true)
    expect(find(second.game, 'resume:new')!.enabled).toBe(true)
    second.ctx.texts.length = 0
    second.game.render()
    expect(second.ctx.texts.join('|')).toContain('继续上一局')

    tapCenter(second.game, 'resume:go')
    expect(second.game.view).toBe('trade')
    expect(second.game.game!.s.qi).toBe(qi)
    expect(second.game.game!.s.asset).toBe(asset)

    // 「重新开始」清掉存档，回到出身页
    const third = boot({ storage: store.storage })
    expect(third.game.view).toBe('resume')
    tapCenter(third.game, 'resume:new')
    expect(third.game.view).toBe('org')
    expect(store.map.get('agu_life_save_v1:mg1')).toBe('')
  })

  it('行动点耗尽点门：给一句话，不许静默', () => {
    const { game, ctx } = boot()
    startTrade(game)
    game.game!.s.ap = 0
    game.render()

    expect(find(game, 'gate:watch')!.enabled).toBe(false)
    tapCenter(game, 'gate:watch')
    expect(game.noticeNow).toBe('今年的机会用完了。')
    expect(game.view).toBe('trade')

    ctx.texts.length = 0
    game.render()
    expect(ctx.texts.join('|')).toContain('今年的机会用完了。')

    // 说完之后会自己消失（倒计时也走 frame(dt)）
    for (let i = 0; i < 80; i++) game.frame(0.05)
    expect(game.noticeNow).toBeNull()
  })

  it('过一季是主按钮、过一年 ×4 是次按钮：底色两级', () => {
    const { game, ctx } = boot()
    startTrade(game)
    game.scrollPage(1e9)
    game.render()
    const step = find(game, 'step')!
    const year = find(game, 'year')!
    expect(step.enabled).toBe(true)
    expect(year.enabled).toBe(true)

    /** 同一块矩形上落下的最后一个底色（边框是 4 条 1px，只认整块）。 */
    function lastFill(r: Rect): string {
      const hit = ctx.fills.filter((f) => f.x === r.x && f.y === r.y && f.w === r.w && f.h === r.h)
      return hit.length ? hit[hit.length - 1].style : ''
    }
    const stepFill = lastFill(step.rect)
    const yearFill = lastFill(year.rect)
    expect(stepFill).toBe('#d8a441')
    expect(yearFill).toBe('#0f1620')
    expect(stepFill).not.toBe(yearFill)
  })

  it('音效开关：关掉后不再响，偏好落盘，重开还是关', () => {
    const store = memStore()
    const played: SfxKind[] = []
    const sfx: SfxPlay = (k) => {
      played.push(k)
    }
    const { game } = boot({ storage: store.storage, sfx: sfx })
    startTrade(game)
    expect(game.sfxEnabled).toBe(true)

    tapCenter(game, 'sfx')
    expect(game.sfxEnabled).toBe(false)
    expect(JSON.parse(store.map.get('agu_sfx_v1') as string).sfx).toBe(false)

    played.length = 0
    advance(game, 2)
    expect(played).toEqual([])

    tapCenter(game, 'sfx')
    expect(game.sfxEnabled).toBe(true)
    expect(played).toEqual(['click'])

    const again = boot({ storage: store.storage, sfx: sfx })
    expect(again.game.sfxEnabled).toBe(true)

    const off = memStore()
    off.map.set('agu_sfx_v1', '{"sfx":false,"haptic":true}')
    const muted = boot({ storage: off.storage, sfx: sfx })
    expect(muted.game.sfxEnabled).toBe(false)
  })

  it('生成战报：把 core 的 EndView 交给平台层，结果原样提示出来', async () => {
    const calls: { title: string; assetText: string }[] = []
    const poster: PosterSink = function (end, assetText) {
      calls.push({ title: end.title, assetText: assetText })
      return Promise.resolve({ ok: true, msg: '已保存到相册' })
    }
    const { game } = boot({ poster: poster })
    playToEnd(game)
    tapCenter(game, 'skip')
    game.render()

    tapCenter(game, 'poster')
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.length).toBe(1)
    expect(calls[0].title.length).toBeGreaterThan(0)
    expect(calls[0].assetText.indexOf('¥')).toBe(0)
    expect(game.noticeNow).toBe('已保存到相册')
  })
})
/* ---------------- V2b：按压态 / 数字补间 / 感官开关 ---------------- */

/** 这一帧有没有在 r 的内侧画 1px 的边（按下态：颜色是提亮色，不是金色）。 */
function hasRing(ctx: FakeCtx, r: Rect): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.51
  return ctx.fills.some((f) => {
    return f.style === '#eaf1f8' && near(f.x, r.x + 1) && near(f.y, r.y + 1) && near(f.w, r.w - 2) && near(f.h, 1)
  })
}

/** 推进一手：撞上事件就用第一个选项（两种都是「结算往前走了」）。 */
function stepOnce(game: Game): void {
  if (game.view === 'event') tapCenter(game, 'ev:0')
  else tapCenter(game, 'step')
}

describe('V2b · 按压态 / 补间 / 感官开关', () => {
  it('按下态：down 点亮命中的那块，up / 滑过 6px / 滚动区都不点亮', () => {
    const { game, ctx } = boot()
    startTrade(game)

    // 日志区是滚动把手（命中登记为禁用）：按下去不该点亮，也不该触发点击
    const log = reveal(game, 'log:area')
    game.down(log.x + log.w / 2, log.y + log.h / 2)
    expect(game.pressedId).toBe(null)
    game.up()
    expect(game.view).toBe('trade')

    // 按在「过一季」上：按下态点亮 + 绘制时叠一圈 1px 的边
    const r = reveal(game, 'step')
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    game.down(cx, cy)
    expect(game.pressedId).toBe('step')
    ctx.fills.length = 0
    game.render()
    expect(hasRing(ctx, rectOf(game, 'step'))).toBe(true)

    // 拖动超过 6px 的阈值：这一手是滑动，按下态立刻清掉
    game.move(cx, cy + 7)
    expect(game.pressedId).toBe(null)
    game.up()
    expect(game.pressedId).toBe(null)

    // 再按一下：同样点亮，松手就清（这一记是真点击，与按下态本身无关）
    game.down(cx, cy)
    expect(game.pressedId).toBe('step')
    ctx.fills.length = 0
    game.render()
    expect(hasRing(ctx, rectOf(game, 'step'))).toBe(true)
    game.up()
    expect(game.pressedId).toBe(null)
    ctx.fills.length = 0
    game.render()
    expect(hasRing(ctx, rectOf(game, 'step'))).toBe(false)
  })

  it('补间：结算从旧值滚到新值；连点过一季先跳到终值再开下一段', () => {
    const { game } = boot()
    startTrade(game)
    const before = game.assetNow

    stepOnce(game)
    const a1 = (game.game as { s: { asset: number } }).s.asset
    expect(a1).not.toBe(before)
    // 还没推帧：数字仍停在旧值，等 frame(dt) 才动
    expect(game.assetNow).toBeCloseTo(before, 6)

    game.frame(0.05)
    game.frame(0.05)
    game.frame(0.05)
    const mid = game.assetNow
    expect(mid).not.toBeCloseTo(a1, 6)
    expect(Math.abs(mid - before) < Math.abs(a1 - before)).toBe(true)

    // 上一段还在滚就再点一季：这一刻必须落在上一段的终值上（不排队、不从半路叠）
    stepOnce(game)
    expect(game.assetNow).toBeCloseTo(a1, 6)
    const a2 = (game.game as { s: { asset: number } }).s.asset
    for (let i = 0; i < 20; i++) game.frame(0.05)
    expect(game.assetNow).toBeCloseTo(a2, 6)
  })

  it('开关：音效关掉后注入的 sfx 一次不响，震动照旧；两个开关都能落盘', () => {
    const store = memStore()
    const sfx: SfxKind[] = []
    const haptic: HapticKind[] = []
    const { game } = boot({
      storage: store.storage,
      sfx: (k) => sfx.push(k),
      haptic: (k) => haptic.push(k),
    })
    startTrade(game)
    // 开局那一下是有效点击（点出身卡）
    expect(sfx).toEqual(['click'])
    expect(haptic).toEqual(['tap'])

    tapCenter(game, 'sfx')
    expect(game.sfxEnabled).toBe(false)
    expect(JSON.parse(store.map.get(SENS_KEY) as string).sfx).toBe(false)
    expect(game.hapticEnabled).toBe(true)

    sfx.length = 0
    haptic.length = 0
    stepOnce(game)
    expect(sfx).toEqual([])
    // 音效关不影响震动：点击一下 + 结算一下
    expect(haptic).toEqual(['tap', 'settle'])

    tapCenter(game, 'hb')
    expect(game.hapticEnabled).toBe(false)
    expect(JSON.parse(store.map.get(SENS_KEY) as string)).toEqual({ sfx: false, haptic: false })
    haptic.length = 0
    stepOnce(game)
    expect(haptic).toEqual([])

    const again = boot({ storage: store.storage })
    expect(again.game.sfxEnabled).toBe(false)
    expect(again.game.hapticEnabled).toBe(false)
  })

  it('开关存档：没有档 / 坏档都回到默认全开，写进去能原样读回', () => {
    const map = new Map<string, string>()
    const get = (k: string) => (map.has(k) ? (map.get(k) as string) : null)
    const set = (k: string, v: string) => {
      map.set(k, v)
    }
    expect(readSenses(null)).toEqual({ sfx: true, haptic: true })
    expect(readSenses(get)).toEqual({ sfx: true, haptic: true })
    map.set(SENS_KEY, '这不是 JSON')
    expect(readSenses(get)).toEqual({ sfx: true, haptic: true })
    writeSenses(set, { sfx: false, haptic: true })
    expect(readSenses(get)).toEqual({ sfx: false, haptic: true })
    // 坏档 / 缺字段不算「关」：只有明确的 false 才算
    map.set(SENS_KEY, '{"sfx":0}')
    expect(readSenses(get)).toEqual({ sfx: true, haptic: true })
  })
})

