// 由 scripts/extract-data.mjs 从原 game.js 生成，勿手改。
import type { Org } from '../types'

/** 三种出身。 */
export const ORG: Org[] = [
  {
    k: '厂里子弟',
    start: 30000,
    sense: 40,
    net: 5,
    rep: 0,
    health: 100,
    fam: 55,
    d: '七年学徒，手上有茧，身体还好。你没别的本事，只有耐心。'
  },
  {
    k: '机关双职工',
    start: 52000,
    sense: 30,
    net: 15,
    rep: 12,
    health: 86,
    fam: 60,
    d: '父母都在机关，分了一套两居。你上班第一天就有报纸看。'
  },
  {
    k: '深圳回来',
    start: 20000,
    sense: 56,
    net: 38,
    rep: 4,
    health: 94,
    fam: 45,
    d: '流水线、工地、蚊帐里的夏天。你亲眼见过有人一夜换了辆车。'
  }
]
