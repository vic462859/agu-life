/**
 * 静物「揉皱的报纸」的纸面几何 —— 共享层：H5 结局卡与小游戏结局屏调的是同一份。
 *
 * 为什么要单独一个文件：原先 paper 是 portrait.ts 里一张 18×9 的 ASCII 点阵，
 * 二十来列里几乎每格都是白块（只留几个 '-' 当阴影），放大 3 倍是一团白色噪点，读不出报纸。
 * 点阵本身没有轮廓可救（改点阵要动几十个字符且仍然只能长成一块白），所以换成几何画法，
 * 并且放在共享层 —— 只修小游戏等于让「用户真正在看的 H5」继续是差的那一版。
 *
 * 硬约束（与 portrait.ts 同款）：
 *   · 纯函数、零依赖：不读时间 / 随机数 / DOM，同一输入两次画出的指令逐条一致；
 *   · ctx 由调用方注入，只用 fillRect + fillStyle（小游戏 ctx 契约里没有 stroke / lineWidth）；
 *   · 32×32 逻辑网格：scale = floor(min(w, h) / 32)（与另外四件静物同一套定位），
 *     一格 = scale 像素，96 → 3px/格；所有矩形都落在格线上，放大不糊；
 *   · 缺口是真的洞：纸面按缺格拆成几块画，不拿底色去盖 ——
 *     所以透明底的画布（H5 那张 canvas 先 clearRect 再画）也对，不需要传背景色。
 *
 * 形状：折起来的报纸 = 上下两半纸面（下半张左右各露出 1 格）+ 折缝硬阴影
 *      + 2 条整幅折痕 + 4 行短印刷行（只占左边一截，与折痕区分）
 *      + 受光边（上/左）/ 背光边（右/下）+ 2 处不规则缺口（右上角撕掉、左下角揉掉）。
 */
/** 只声明用得到的 2D 能力：与 portrait.ts 的 PortraitCtx、小游戏的 Ctx2D 都相容。 */
export interface StillCtx {
  fillStyle?: unknown
  fillRect?(x: number, y: number, w: number, h: number): void
}

/** 纸的四档颜色。缺省值与 src/ui/styles/tokens.css 同源（改 tokens 请同步这里）。 */
export interface StillColors {
  /** 纸面（--ink-0）。 */
  paper: string
  /** 受光边（比纸面更亮一档）。 */
  lit: string
  /** 背光边（--ink-1）。 */
  shade: string
  /** 折痕 / 印刷行（--ink-2）。 */
  crease: string
  /** 折缝硬阴影（--bg-0）。 */
  deep: string
}

export const DEFAULT_STILL_COLORS: StillColors = {
  paper: '#eaf1f8',
  lit: '#ffffff',
  shade: '#9fadbe',
  crease: '#6b798b',
  deep: '#06090d',
}

/** 逻辑网格边长（与另四件静物的 32×32 同一套坐标）。 */
const GRID = 32

interface Cell {
  /** 网格坐标与格数（全部整数，落格线）。 */
  x: number
  y: number
  w: number
  h: number
  /** 三个色槽之一。 */
  c: 'paper' | 'lit' | 'shade' | 'crease' | 'deep'
}

/**
 * 报纸的格子账（按绘制顺序；后画的压先画的）。
 * 行账：顶面 9–15，折缝 16，底面 17–24；右上角与左下角各缺一格以上（缺口）。
 */
const PAPER_CELLS: Cell[] = [
  // 上面那半张（比下面窄 1 格：它是折过来的那一面）；右上角缺两块，所以顶面拆成三条
  { x: 6, y: 10, w: 18, h: 1, c: 'paper' },
  { x: 6, y: 11, w: 19, h: 5, c: 'paper' },
  // 下面那半张（左右各露出 1 格）；左下角缺三块，所以底面拆成四条
  { x: 5, y: 17, w: 21, h: 5, c: 'paper' },
  { x: 6, y: 22, w: 20, h: 1, c: 'paper' },
  { x: 7, y: 23, w: 19, h: 1, c: 'paper' },
  // 受光边：顶沿 + 左沿（左沿到缺口上缘为止）
  { x: 6, y: 9, w: 17, h: 1, c: 'lit' },
  { x: 5, y: 17, w: 1, h: 5, c: 'lit' },
  // 背光边：右上沿（从缺口下缘起）+ 右沿 + 底沿
  { x: 24, y: 11, w: 1, h: 5, c: 'shade' },
  { x: 25, y: 17, w: 1, h: 8, c: 'shade' },
  { x: 5, y: 24, w: 21, h: 1, c: 'shade' },
  // 折缝：两半之间的硬阴影
  { x: 5, y: 16, w: 21, h: 1, c: 'deep' },
  // 折痕两条（整幅宽）
  { x: 6, y: 14, w: 19, h: 1, c: 'crease' },
  { x: 5, y: 20, w: 21, h: 1, c: 'crease' },
  // 印刷行四条（短横，只占左边一截）
  { x: 8, y: 11, w: 12, h: 1, c: 'crease' },
  { x: 8, y: 12, w: 8, h: 1, c: 'crease' },
  { x: 8, y: 18, w: 14, h: 1, c: 'crease' },
  { x: 8, y: 22, w: 11, h: 1, c: 'crease' },
]

/**
 * 画一张折起来的报纸，落在 x/y/w/h 画框里（正方形最好；不是正方形就按短边定 scale）。
 * 透明度、底色一概不管：调用方想在什么底上画都行 —— 缺口是真的洞，不会盖上任何颜色。
 */
export function drawPaper(
  ctx: StillCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  colors?: Partial<StillColors> | null,
): void {
  const fr = ctx.fillRect
  if (typeof fr !== 'function') return
  const c: StillColors = {
    paper: (colors && colors.paper) || DEFAULT_STILL_COLORS.paper,
    lit: (colors && colors.lit) || DEFAULT_STILL_COLORS.lit,
    shade: (colors && colors.shade) || DEFAULT_STILL_COLORS.shade,
    crease: (colors && colors.crease) || DEFAULT_STILL_COLORS.crease,
    deep: (colors && colors.deep) || DEFAULT_STILL_COLORS.deep,
  }
  const bx = Number(x) || 0
  const by = Number(y) || 0
  const bw = Math.max(1, Number(w) || 1)
  const bh = Math.max(1, Number(h) || 1)
  const scale = Math.max(1, Math.floor(Math.min(bw / GRID, bh / GRID)))
  const ox = bx + (bw - GRID * scale) / 2
  const oy = by + (bh - GRID * scale) / 2
  for (let i = 0; i < PAPER_CELLS.length; i++) {
    const cell = PAPER_CELLS[i]
    ctx.fillStyle = c[cell.c]
    fr.call(
      ctx,
      Math.round(ox + cell.x * scale),
      Math.round(oy + cell.y * scale),
      Math.max(1, Math.round(cell.w * scale)),
      Math.max(1, Math.round(cell.h * scale)),
    )
  }
}
