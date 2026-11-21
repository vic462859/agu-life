// 开发探针（不进 src）：把 core 与 sectorSeries 打成一个 node 包，打印真实局面下的序列，用来校准 span。
// core 的 step/choose* 都是纯函数（返回 StepOutcome），所以这里一路用返回值推进。
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'

const root = path.resolve('.')
const out = path.join(root, 'docs/shots/_sector-probe-bundle.mjs')

const res = await build({
  stdin: {
    contents: "export * from './src/core'; export { sectorSeries, DEFAULT_SPAN } from './src/ui/share/sectorSeries'",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  write: false,
})
fs.writeFileSync(out, res.outputFiles[0].text)
const C = await import(pathToFileURL(out).href + '?v=' + Date.now())

const seed = Number(process.argv[2] || 19911219)
const rng = C.createRng(seed)
let g = C.createGame(0, 'real', seed, rng).state
const SECTS = ['龙头', '题材', '成长', '红利', '壳']
const targets = (process.argv[3] || '4,8,12,20,32,40').split(',').map(Number)

function advanceTo(target) {
  let guard = 0
  while (g.s.qi < target && g.phase === 'trade' && guard++ < 400) {
    if (g.pending) {
      if (g.pending.type === 'event') g = C.chooseEvent(g, 0, rng).state
      else if (g.pending.type === 'year') g = C.chooseYear(g, 0, rng).state
      else break
    } else {
      g = C.step(g, rng).state
    }
  }
}

for (const t of targets) {
  advanceTo(t)
  if (g.phase !== 'trade') { console.log('phase=' + g.phase + ' at qi=' + g.s.qi); break }
  console.log('--- qi=' + g.s.qi + ' (span 12) ---')
  for (const s of SECTS) {
    const a = C.sectorSeries(g.map, g.s.kty, s, g.s.qi, 12)
    const d = a.length > 1 ? a[a.length - 1] - 100 : 0
    console.log(s.padEnd(4) + ' n=' + String(a.length - 1).padStart(2) + ' delta=' + d.toFixed(1).padStart(6) + '%  ' + a.map(function (v) { return v.toFixed(1) }).join(' '))
  }
}
