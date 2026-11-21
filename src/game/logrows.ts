/**
 * 日志流的行模型：按年份分组 → 拍平成一维行数组 → 只切窗口里那几行来画。
 * 纯函数，不碰平台、不读时间：行高、切窗、滚动上限都从 theme.lh 一处算。
 */
import type { LogItem, Tone } from '../core'
import { lh, T } from './theme'

/** 日志区一次显示几行（可见 6–8 行的区间，行数固定才好算窗口）。 */
export const LOG_VIEW_ROWS = 7

/** 日志区本体在 Layout 里的 id（手势靠它认出「内层」，点击永远打不中）。 */
export const LOG_AREA_ID = 'log:area'

export interface LogRow {
  /** year = 年份分组头，item = 一条日志。 */
  kind: 'year' | 'item'
  text: string
  tone: Tone
  year: string
}

/** 固定行高：切窗口、滚动上限、行基线全部用它，改一处就够。 */
export function logRowH(): number {
  return lh(T.caption) + 5
}

/** 日志区高度 = 整数行 × 行高：行永远整行可见，没有半行被裁掉的边缘（契约里没有 clip）。 */
export function logViewH(): number {
  return LOG_VIEW_ROWS * logRowH()
}

/**
 * 按年份分组拍平。内核给了 year 就用它，没给就用调用方给的兜底年份。
 * 相邻同年只出一个分组头。
 */
export function buildLogRows(items: LogItem[], fallback: string): LogRow[] {
  const rows: LogRow[] = []
  let last = ''
  for (const it of items) {
    const y = typeof it.year === 'number' && isFinite(it.year) ? String(it.year) : fallback
    if (y !== last) {
      rows.push({ kind: 'year', text: y, tone: 'w', year: y })
      last = y
    }
    rows.push({ kind: 'item', text: it.text, tone: it.tone, year: y })
  }
  return rows
}

/** 内层滚动的上限（像素）。 */
export function maxOffset(count: number, viewH: number): number {
  return Math.max(0, count * logRowH() - viewH)
}

/** 窗口化切片：给定偏移与视口高，返回要画的行区间 [start, end)。 */
export function windowSlice(rows: LogRow[], topPx: number, viewH: number): { start: number; end: number } {
  const h = logRowH()
  const max = maxOffset(rows.length, viewH)
  const top = topPx < 0 ? 0 : topPx > max ? max : topPx
  const start = Math.floor(top / h)
  const n = Math.max(1, Math.ceil(viewH / h))
  return { start: start, end: Math.min(rows.length, start + n) }
}
