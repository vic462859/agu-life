/** 栈式布局 + 命中区域登记。纯几何：不读时间、不碰 DOM、不知道画的是什么。 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface HitRegion {
  /** 事件 id，形如 org:0 / sector:成长 / pos:0.5 / step。 */
  id: string
  rect: Rect
  enabled: boolean
}

export function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * 一屏一个 Layout：光标从上往下切横条，命中区域按登记顺序落栈。
 * 宽屏时内容列居中收窄（最长 560），窄屏时等于整屏减边距。
 *
 * 滚动只有一个数：at(scroll) 把光标（= 绘制坐标）整块上移，命中区域登记的是同一批坐标
 * —— 画在哪就点在哪，不存在「命中再扣一次偏移」的第二处减法，也就没有对不齐的可能。
 */
export class Layout {
  readonly w: number
  readonly h: number
  /** 内容列。所有 view 只在这一列里排。 */
  readonly col: Rect
  private cursor: number
  private hits: HitRegion[]
  private scrollY: number
  /** 内容最低点（屏幕坐标）。 */
  private low: number

  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    const m = clamp(w * 0.06, 16, 40)
    const cw = Math.min(w - m * 2, 560)
    this.col = { x: (w - cw) / 2, y: m, w: cw, h: Math.max(120, h - m * 2) }
    this.cursor = this.col.y
    this.hits = []
    this.scrollY = 0
    this.low = this.col.y
  }

  /** 当前滚动偏移（正数 = 内容整体上移）。 */
  get offset(): number {
    return this.scrollY
  }

  /** 整页滚动：内容与命中区域一起上移 scroll 像素。 */
  at(scrollY: number): void {
    this.scrollY = scrollY
    this.cursor = this.col.y - scrollY
    this.low = this.cursor
  }

  /** 当前光标（下一条横条的顶边）。 */
  get y(): number {
    return this.cursor
  }

  seek(y: number): void {
    this.cursor = y
    this.mark(y)
  }

  /** 在光标处切一条横条并下移。 */
  block(h: number, gap: number = 0): Rect {
    const r: Rect = { x: this.col.x, y: this.cursor, w: this.col.w, h: h }
    this.cursor += h + gap
    this.mark(r.y + h)
    return r
  }

  /** 从内容列底部往上量一条（不移动光标）。gap 是它与下边界的距离。 */
  bottom(h: number, gap: number = 0): Rect {
    return { x: this.col.x, y: this.col.y + this.col.h - gap - h, w: this.col.w, h: h }
  }

  /**
   * 登记命中区域：后登记的在上。点击时从后往前找，先命中的赢（后画的上）。
   * 完全移出屏幕的区域直接禁用：滚动之后点不到看不见的按钮（部分可见仍可点）。
   * mark=false 用于「铺满整屏的遮罩」：它要挡住下层，但不能把自己算成内容高度。
   */
  hit(id: string, rect: Rect, enabled: boolean = true, mark: boolean = true): void {
    const onScreen = rect.y < this.h && rect.y + rect.h > 0 && rect.x < this.w && rect.x + rect.w > 0
    this.hits.push({
      id: id,
      rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      enabled: enabled && onScreen,
    })
    if (mark) this.mark(rect.y + rect.h)
  }

  /** 只读快照：按登记顺序（= 绘制顺序）返回，调试点 / 单测用。 */
  regions(): HitRegion[] {
    return this.hits.map(function (h) {
      return { id: h.id, rect: { x: h.rect.x, y: h.rect.y, w: h.rect.w, h: h.rect.h }, enabled: h.enabled }
    })
  }

  /** 找一条已登记区域的矩形（不论启用与否）：手势靠它认出日志区在哪。 */
  regionOf(id: string): Rect | null {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      if (this.hits[i].id === id) return this.hits[i].rect
    }
    return null
  }

  /** 内容底边的屏幕坐标（scroll=0 时）；整页滚动的上限由它决定。 */
  contentBottom(): number {
    return this.low + this.scrollY
  }

  /** 内容总高（不含上下边距）。 */
  contentHeight(): number {
    return this.contentBottom() - this.col.y
  }

  /**
   * 整页滚动的上限：内容底边贴到屏幕底，再留一个上边距当呼吸位。
   * 全仓只有这一处算偏移上限（trade / event / over 共用），不再各写一遍减法。
   */
  maxScroll(): number {
    return Math.max(0, this.contentBottom() + this.col.y - this.h)
  }

  tap(x: number, y: number): string | null {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const r = this.hits[i]
      if (r.enabled && inside(r.rect, x, y)) return r.id
    }
    return null
  }

  private mark(bottom: number): void {
    if (bottom > this.low) this.low = bottom
  }
}
