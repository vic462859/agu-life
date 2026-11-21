/**
 * 交易页三处折叠（消息 / 日志 / 走势）的记忆。
 *
 * 为什么单独存一份：折叠是**看的心情**，不是局面的一部分。写进存档会让 encodeChallenge /
 * deserialize 的版本字段跟着变，挑战码复现就不可比了；所以它只记在 agu_fold_v1，
 * 并用「当前局」的指纹（模式 + seed）当钥匙 —— 换一局自动回到默认折叠，同一局刷新还是你上次的样子。
 */
export type FoldKey = 'intel' | 'log' | 'chart'

export interface FoldState {
  /** 当前局指纹：模式 + seed。换局即失效。 */
  sig: string
  intel: boolean
  log: boolean
  chart: boolean
}

export const FOLD_KEY = 'agu_fold_v1'

/** 默认：三处都折叠（一屏决策）。 */
export function foldClosed(): Record<FoldKey, boolean> {
  return { intel: false, log: false, chart: false }
}

/** 当前局指纹。还没开局时给空串，任何存档都对不上，于是回到默认。 */
export function foldSig(state: { seed: number; mode: string } | null | undefined): string {
  if (!state) return ''
  return String(state.mode) + ':' + String(state.seed)
}

/** 读：指纹不符、损坏、没有，一律回到默认折叠。 */
export function parseFold(raw: string | null, sig: string): Record<FoldKey, boolean> {
  const out = foldClosed()
  if (!raw || !sig) return out
  try {
    const o = JSON.parse(raw) as Partial<FoldState> | null
    if (!o || o.sig !== sig) return out
    out.intel = o.intel === true
    out.log = o.log === true
    out.chart = o.chart === true
  } catch (e) {
    return out
  }
  return out
}

/** 写：只写三个布尔 + 指纹，no game state。 */
export function serializeFold(sig: string, f: Record<FoldKey, boolean>): string {
  const o: FoldState = { sig: sig, intel: f.intel === true, log: f.log === true, chart: f.chart === true }
  return JSON.stringify(o)
}
