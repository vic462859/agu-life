/**
 * 海报用的颜色：canvas 取不到 CSS 变量，这里是与 tokens.css 一一对应的"画布镜像"。
 * 改 tokens.css 里这些色值时，请同步改这里（只有这 9 个常数）。
 */
export const P = {
  bg0: '#06090d',
  bg1: '#0a0f16',
  bg2: '#0f1620',
  ink0: '#eaf1f8',
  ink1: '#9fadbe',
  ink2: '#6b798b',
  gold: '#f6cf72',
  gold1: '#d8a441',
  teal: '#3ee0cb',
  red: '#ff6a6a',
  line: 'rgba(255,255,255,0.12)',
} as const
