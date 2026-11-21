// 由 scripts/extract-data.mjs 从原 game.js 生成，勿手改。
import type { SectorId } from '../types'

/** 板块基础系数。 */
export const K: Record<SectorId, number> = {
  "龙头": 1.06,
  "题材": 1.04,
  "成长": 1,
  "红利": 0.95,
  "壳": 1.1
}

/** 板块顺序（到处都用它做稳定排序）。 */
export const ORDER: readonly SectorId[] = ['龙头', '题材', '成长', '红利', '壳']

/** 板块对应的“票”的名字。 */
export const BOOK: Record<SectorId, string> = {
  "龙头": '次新妖股',
  "题材": '传媒题材',
  "成长": '制造白马',
  "红利": '银行红利',
  "壳": 'ST 壳'
}

/** 一句话说明。 */
export const BOOKSUB: Record<SectorId, string> = {
  "龙头": '最凶，也最脆',
  "题材": '消息一来就疯',
  "成长": '看业绩吃饭',
  "红利": '最闷，不动',
  "壳": '赌重组，退市归零'
}

/** 标签。 */
export const TAG: Record<SectorId, string> = {
  "龙头": '情绪',
  "题材": '主线',
  "成长": '业绩',
  "红利": '分红',
  "壳": '重组'
}
