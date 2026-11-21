/** 年代分段：把年份映射成一段主题 token（只用年份，不做任何游戏判断）。 */
export interface EraInfo {
  key: '80s' | '90s' | '00s' | '10s' | '20s'
  /** 年代标签，用于展示。 */
  label: string
  /** 挂到元素上的 class。 */
  cls: string
}

const ERAS: EraInfo[] = [
  { key: '80s', label: '1980s', cls: 'ag-era-80s' },
  { key: '90s', label: '1990s', cls: 'ag-era-90s' },
  { key: '00s', label: '2000s', cls: 'ag-era-00s' },
  { key: '10s', label: '2010s', cls: 'ag-era-10s' },
  { key: '20s', label: '2020s', cls: 'ag-era-20s' },
]

export function eraList(): EraInfo[] {
  return ERAS
}

/** 年份 → 年代。越界按最近的段处理。 */
export function eraOf(year: number): EraInfo {
  if (!isFinite(year) || year <= 0) return ERAS[1]
  if (year < 1990) return ERAS[0]
  if (year < 2000) return ERAS[1]
  if (year < 2010) return ERAS[2]
  if (year < 2020) return ERAS[3]
  return ERAS[4]
}

/** 从事件卡标题里捞年份（"1992 · Q2" / "1992 · 年底"）；迷雾模式捞不到就返回 null。 */
export function eraFromTitle(title: string): EraInfo | null {
  const m = /(\d{4})/.exec(title || '')
  if (!m) return null
  return eraOf(parseInt(m[1], 10))
}
