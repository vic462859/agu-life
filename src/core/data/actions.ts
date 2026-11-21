/** 七个入口（原 game.js 的 GROUPS）。probe 不在行动格里，它挂在消息卡右上角。 */
export interface ActionGroup {
  id: string
  t: string
  d: string
}

export const GROUPS: ActionGroup[] = [
  { id: 'probe', t: '打探', d: '看真假' },
  { id: 'watch', t: '盯盘', d: '涨盘感' },
  { id: 'social', t: '社交', d: '涨人脉' },
  { id: 'biz', t: '实业', d: '押身家' },
  { id: 'study', t: '学习', d: '防暴雷' },
  { id: 'rest', t: '休息', d: '养身体，也养家' },
  { id: 'drink', t: '应酬', d: '涨声望' },
]

/** 一年只有这么多次行动点。 */
export const AP_PER_YEAR = 3

/** 空手点行动 / 打探时的同一句提示（原文照搬）。 */
export const AP_EXHAUSTED_TEXT = '今年的机会用完了。'
