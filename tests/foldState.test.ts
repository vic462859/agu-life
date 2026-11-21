import { describe, expect, it } from 'vitest'
import { FOLD_KEY, foldSig, parseFold, serializeFold } from '../src/ui/components/foldState'

describe('交易页折叠记忆', () => {
  it('没有存档时三处都折叠', () => {
    expect(parseFold(null, 'real:7')).toEqual({ intel: false, log: false, chart: false })
  })

  it('同一局刷新后恢复上次的展开状态', () => {
    const raw = serializeFold('real:7', { intel: true, log: false, chart: true })
    expect(parseFold(raw, 'real:7')).toEqual({ intel: true, log: false, chart: true })
  })

  it('换一局（指纹不同）回到默认折叠，不把上一局的心情带过来', () => {
    const raw = serializeFold('real:7', { intel: true, log: true, chart: true })
    expect(parseFold(raw, 'real:8')).toEqual({ intel: false, log: false, chart: false })
  })

  it('还没开局（指纹为空）不认任何记忆', () => {
    const raw = serializeFold('real:7', { intel: true, log: true, chart: true })
    expect(parseFold(raw, '')).toEqual({ intel: false, log: false, chart: false })
  })

  it('存档损坏不抛，直接回到默认', () => {
    expect(parseFold('{oops', 'real:7')).toEqual({ intel: false, log: false, chart: false })
    expect(parseFold('null', 'real:7')).toEqual({ intel: false, log: false, chart: false })
  })

  it('只认 true，别的一律当折叠', () => {
    const raw = JSON.stringify({ sig: 'real:7', intel: 1, log: 'yes', chart: null })
    expect(parseFold(raw, 'real:7')).toEqual({ intel: false, log: false, chart: false })
  })

  it('指纹由模式与 seed 组成，缺状态时为空串', () => {
    expect(foldSig({ seed: 7, mode: 'fog' })).toBe('fog:7')
    expect(foldSig(null)).toBe('')
  })

  it('存档键不进存档版本字段（键名独立）', () => {
    expect(FOLD_KEY).toBe('agu_fold_v1')
    expect(serializeFold('real:7', { intel: false, log: false, chart: false })).not.toContain('version')
  })
})
