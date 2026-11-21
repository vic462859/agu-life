import { describe, expect, it } from 'vitest'
import { ellipsize, fitLines, truncate, wrapText } from '../src/game/text'

/** 假 measure：一个码点算 10px。只验排版逻辑，不依赖真实字体度量。 */
const m = (s: string) => Array.from(s).length * 10

describe('中文换行', () => {
  it('逐字换行：每行不超过给定宽度，拼起来等于原文', () => {
    const text = '一二三四五六七八九十'.repeat(4)
    const rows = wrapText(text, 100, m)
    expect(rows.length).toBe(4)
    expect(rows.join('')).toBe(text)
    for (const r of rows) expect(m(r)).toBeLessThanOrEqual(100)
  })

  it('标点不另起一行：超宽的标点跟上一行结尾', () => {
    const rows = wrapText('一二三四五六七八九十，一一', 100, m)
    expect(rows[0].endsWith('，')).toBe(true)
    for (const r of rows) expect(r.startsWith('，')).toBe(false)
  })

  it('空串与换行符：不产出空行', () => {
    expect(wrapText('', 100, m)).toEqual([])
    expect(wrapText('甲\n乙', 100, m)).toEqual(['甲', '乙'])
  })
})

describe('截断与省略号', () => {
  it('放得下原样返回，放不下补省略号且不超宽', () => {
    expect(truncate('甲乙丙', 100, m)).toBe('甲乙丙')
    const cut = truncate('一二三四五六七八九十'.repeat(4), 100, m)
    expect(cut.endsWith('…')).toBe(true)
    expect(m(cut)).toBeLessThanOrEqual(100)
  })

  it('省略号自己都放不下时返回空串', () => {
    expect(ellipsize('甲乙', 5, m)).toBe('')
  })

  it('行数上限：多出来的截到最后一行', () => {
    const rows = fitLines('一二三四五六七八九十'.repeat(4), 100, 2, m)
    expect(rows.length).toBe(2)
    expect(rows[1].endsWith('…')).toBe(true)
    for (const r of rows) expect(m(r)).toBeLessThanOrEqual(100)
  })
})
