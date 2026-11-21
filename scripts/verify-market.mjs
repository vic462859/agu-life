// 等价性验收：把原 game.js 里的行情/剧本函数原样抽出来跑，与 src/core 实现逐字段比对。
// 比对项：BL 年块、makeQ 剧本（史实/抽签）、buildMap 洗牌、buildKty 板块强弱。
// 两侧喂同一串随机数，因此也验证了随机数的调用顺序。
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const srcPath = process.argv[2] || resolve(root, '../default-workspace/.tmp-game/src/game.js')
const code = readFileSync(srcPath, 'utf8')
const BT = String.fromCharCode(96)

function scanBalanced(start) {
  let i = start
  while (code[i] === ' ' || code[i] === '\n') i++
  const begin = i
  let depth = 0
  let quote = null
  for (; i < code.length; i++) {
    const ch = code[i]
    if (quote) {
      if (ch === '\\') { i++; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === BT) { quote = ch; continue }
    if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') { depth--; if (depth === 0) { i++; break } }
  }
  return code.slice(begin, i)
}

function grabConst(name) {
  const re = new RegExp('const\\s+' + name + '\\s*=')
  const m = re.exec(code)
  if (!m) throw new Error('const not found: ' + name)
  return 'const ' + name + '=' + scanBalanced(m.index + m[0].length)
}

function grabFunction(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{')
  const m = re.exec(code)
  if (!m) throw new Error('function not found: ' + name)
  return scanBalanced(m.index)
}

const chunk = [
  "let MODE='real', MAP=[];",
  grabConst('M'),
  grabConst('ORDER'),
  grabFunction('buildBlocks'),
  grabFunction('buildMap'),
  grabFunction('buildKty'),
  grabFunction('makeQ'),
  'const BL=buildBlocks();',
].join('\n')

const factory = new Function(
  '__rnd',
  chunk.replace(/Math\.random\(\)/g, '__rnd()') +
    '\n; return { buildBlocks: buildBlocks, buildMap: buildMap, buildKty: buildKty, makeQ: makeQ, setMode: function (m) { MODE = m }, setMap: function (m) { MAP = m } }',
)

async function importBundle(entry, name) {
  const dir = mkdtempSync(join(tmpdir(), 'agu-verify-'))
  const outfile = join(dir, name + '.mjs')
  const result = await build({
    entryPoints: [resolve(root, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  })
  writeFileSync(outfile, result.outputFiles[0].text)
  return await import(pathToFileURL(outfile).href)
}

function sequence(n) {
  const arr = []
  let a = 12345
  for (let i = 0; i < n; i++) {
    a = (a * 1103515245 + 12345) % 2147483648
    arr.push(a / 2147483648)
  }
  return arr
}
function makeRng(arr) {
  let i = 0
  const next = function () { return arr[i++] }
  return { next: next, int: function (n) { return Math.floor(next() * n) } }
}

const results = []
function check(name, same, extra) {
  results.push({ name: name, ok: same, extra: extra || '' })
}

const ref = factory(makeRng(sequence(20000)).next, 'real', [])
const blocksMod = await importBundle('src/core/data/blocks.ts', 'blocks')
check('BL 年块（36 年季线）', JSON.stringify(ref.buildBlocks()) === JSON.stringify(blocksMod.BL))

const market = await importBundle('src/core/engine/market.ts', 'market')
const rngMod = await importBundle('src/core/rng.ts', 'rngmod')

const realMap = ref.buildMap()
ref.setMap(realMap)
const refQ = ref.makeQ()
const myMap = market.buildMap('real', rngMod.createRng(1))
const myQ = market.buildQuarters(myMap)
check('buildMap 史实模式', JSON.stringify(realMap) === JSON.stringify(myMap))
check('makeQ 史实模式 144 季', JSON.stringify(refQ) === JSON.stringify(myQ), '季度数 ' + myQ.length)

const refDraw = factory(makeRng(sequence(20000)).next, 'draw', [])
refDraw.setMode('draw')
const refDrawMap = refDraw.buildMap()
const myDrawMap = market.buildMap('draw', makeRng(sequence(20000)))
check('buildMap 抽签洗牌（随机顺序一致）', JSON.stringify(refDrawMap) === JSON.stringify(myDrawMap))

const myDrawQ = market.buildQuarters(myDrawMap)
const ref2 = factory(makeRng(sequence(20000)).next, 'draw', [])
ref2.buildMap()
ref2.setMap(myDrawMap)
check('makeQ 抽签模式', JSON.stringify(ref2.makeQ()) === JSON.stringify(myDrawQ))

const refKty = factory(makeRng(sequence(400)).next, 'real', []).buildKty()
const myKty = market.buildKty(makeRng(sequence(400)))
check('buildKty 板块强弱（随机顺序一致）', JSON.stringify(refKty) === JSON.stringify(myKty))

let bad = 0
for (const r of results) {
  if (!r.ok) bad++
  console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  [' + r.extra + ']' : ''))
}
console.log(bad === 0 ? 'ALL EQUIVALENT' : bad + ' MISMATCH')
process.exit(bad === 0 ? 0 : 1)
