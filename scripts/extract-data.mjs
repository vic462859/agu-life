// 从原单文件游戏（default-workspace/.tmp-game/src/game.js）抽取纯数据字面量，
// 生成 src/core/data/*.ts。只搬运字面量，不改数值与文案。
// 用法：node scripts/extract-data.mjs [game.js 路径]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const srcPath =
  process.argv[2] ||
  resolve(root, '../default-workspace/.tmp-game/src/game.js')
const code = readFileSync(srcPath, 'utf8')

function sliceLiteral(name) {
  const re = new RegExp('const\\s+' + name + '\\s*=')
  const m = re.exec(code)
  if (!m) throw new Error('literal not found: ' + name)
  let i = m.index + m[0].length
  while (code[i] === ' ' || code[i] === '\\n') i++
  const start = i
  let depth = 0
  let quote = null
  for (; i < code.length; i++) {
    const ch = code[i]
    if (quote) {
      if (ch === '\\\\') { i++; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue }
    if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') {
      depth--
      if (depth === 0) { i++; break }
    }
  }
  return code.slice(start, i)
}

function load(name) {
  const text = sliceLiteral(name)
  // 纯数据字面量，直接求值（原文件里这几个常量不含函数）。
  return eval('(' + text + ')')
}

function key(k) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k)
}
function str(s) {
  return "'" + String(s).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'").replace(/\\n/g, '\\\\n') + "'"
}
function emit(v, indent = 0) {
  const pad = '  '.repeat(indent)
  if (Array.isArray(v)) {
    if (!v.length) return '[]'
    const prim = v.every((x) => typeof x !== 'object' || x === null)
    if (prim) return '[' + v.map((x) => emit(x)).join(', ') + ']'
    return '[\n' + v.map((x) => pad + '  ' + emit(x, indent + 1)).join(',\n') + '\n' + pad + ']'
  }
  if (v && typeof v === 'object') {
    const ks = Object.keys(v)
    if (!ks.length) return '{}'
    return '{\n' + ks.map((k) => pad + '  ' + key(k) + ': ' + emit(v[k], indent + 1)).join(',\n') + '\n' + pad + '}'
  }
  if (typeof v === 'string') return str(v)
  return String(v)
}

const HEAD = '// 由 scripts/extract-data.mjs 从原 game.js 生成，勿手改。\n'

const out = {}
out['market'] =
  HEAD +
  "import type { BlockQuarter } from '../types'\n\n" +
  '/** 1990-12 起逐月上证点位（原样搬运）。 */\n' +
  'export const M: readonly number[] = ' + emit(load('M')) + '\n'

out['sectors'] =
  HEAD +
  "import type { SectorId } from '../types'\n\n" +
  '/** 板块基础系数。 */\n' +
  'export const K: Record<SectorId, number> = ' + emit(load('K')) + '\n\n' +
  '/** 板块顺序（到处都用它做稳定排序）。 */\n' +
  'export const ORDER: readonly SectorId[] = ' + emit(load('ORDER')) + '\n\n' +
  '/** 板块对应的“票”的名字。 */\n' +
  'export const BOOK: Record<SectorId, string> = ' + emit(load('BOOK')) + '\n\n' +
  '/** 一句话说明。 */\n' +
  'export const BOOKSUB: Record<SectorId, string> = ' + emit(load('BOOKSUB')) + '\n\n' +
  '/** 标签。 */\n' +
  'export const TAG: Record<SectorId, string> = ' + emit(load('TAG')) + '\n'

out['intel'] =
  HEAD +
  "import type { IntelRow } from '../types'\n\n" +
  '/** 每年两条消息：一条真、一条假（原封不动取自史实）。 */\n' +
  'export const INTEL: IntelRow[] = ' + emit(load('INTEL')) + '\n'

out['lines'] =
  HEAD +
  '/** 每个年代股民嘴里反复说的那几句话，按季度轮换。 */\n' +
  'export const LINES: Record<number, string[]> = ' + emit(load('LINES')) + '\n'

out['org'] =
  HEAD +
  "import type { Org } from '../types'\n\n" +
  '/** 三种出身。 */\n' +
  'export const ORG: Org[] = ' + emit(load('ORG')) + '\n'

out['events'] =
  HEAD +
  "import type { LifeEvent, SpecialEvent } from '../types'\n\n" +
  '/** 29 个年度人生事件。 */\n' +
  'export const YEV: LifeEvent[] = ' + emit(load('YEV')) + '\n\n' +
  '/** 晚年 8 个事件。 */\n' +
  'export const LATE: LifeEvent[] = ' + emit(load('LATE')) + '\n\n' +
  '/** 特殊年份事件。 */\n' +
  'export const EV: Record<string, SpecialEvent> = ' + emit(load('EV')) + '\n'

const dataDir = resolve(root, 'src/core/data')
mkdirSync(dataDir, { recursive: true })
for (const [name, text] of Object.entries(out)) {
  writeFileSync(resolve(dataDir, name + '.ts'), text, 'utf8')
  console.log('wrote src/core/data/' + name + '.ts', text.length, 'bytes')
}
console.log('M length =', load('M').length)
