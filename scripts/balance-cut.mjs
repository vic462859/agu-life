// cut（割在最低点）语义修正的量化对比：同一批 seed、同一套自动策略，跑「旧行为 vs 新行为」。
// 用法：node scripts/balance-cut.mjs [--variant old|new|flat-safe|all] [--seeds 200] [--from 1000]
// 零新增依赖：只借仓库里已有的 esbuild（docs/shots 的脚本也在用它）把 core 打成一份 ESM 再跑。
import { build } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const argv = process.argv.slice(2)
function arg(name, def) {
  const i = argv.indexOf('--' + name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const which = arg('variant', 'all')
const count = Number(arg('seeds', 200))
const from = Number(arg('from', 1000))
// 换仓频率：quarterly=每季都把仓位补回半仓（cut 的效果会被立刻抹平）；
//          yearly=只在年初补回半仓（更能看出"割了之后那半年的空仓"有什么影响）。
const rebal = arg('rebalance', 'yearly')
// 策略：base=固定仓位、不上杠杆；aggr=满仓 + 杠杆 + 追去年最猛（用来验尾部风险）
let strategy = arg('strategy', 'base')
// 固定仓位档（0 / 0.25 / 0.5 / 1 是游戏里的四档）。默认半仓；扫描时逐档改写。
let pos = Number(arg('pos', 0.5))
// 扫参数模式：割肉代价 10%→40%，两档仓位各跑一遍
const sweep = argv.indexOf('--sweep') >= 0
// 扫杠杆项系数：三组策略（满仓 / 半仓 / 满仓+杠杆）× c ∈ 0.04/0.06/0.08/0.10
const sweepC = argv.indexOf('--sweep-c') >= 0
const levCoeffs = arg('coeffs', '0.04,0.06,0.08,0.10').split(',').map(Number)
const losses = arg('losses', '0.10,0.15,0.20,0.25,0.30,0.35,0.40').split(',').map(Number)
const positions = [1, 0.5]

const out = path.join(os.tmpdir(), 'agu-balance-cut.mjs')
await build({
  stdin: {
    contents: "export * from './src/core'\nexport { setCutMode, getCutMode, setCutLoss, getCutLoss, setCutLev, cutLoss } from './src/core/engine/events'",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  outfile: out,
  write: true,
})
const C = await import('file://' + out.replace(/\\/g, '/'))

/** 自动策略（简单且确定）：每季固定半仓，板块按上一年超额最高的那个，不探消息、不上杠杆，事件一律选第一个。 */
function play(seed) {
  const rng = C.createRng(seed)
  let g = C.createGame(0, 'real', seed, rng).state
  let cutSeen = 0
  let cutPos = null
  let guard = 0
  while (g.phase === 'trade' && guard++ < 3000) {
    if (g.pending) {
      const p = g.pending
      if (p.type === 'year') {
        g = C.chooseYear(g, 0, rng).state
      } else if (p.type === 'event') {
        const ev = C.EV ? null : null
        const before = g.s.pos
        const key = p.key
        const opt = { key: key, index: 0 }
        const res = C.chooseEvent(g, 0, rng)
        // 记录 cut 触发时的仓位（EV['1994-3'] 的第 0 个选项就是 cut）
        if (key === '1994-3' && opt.index === 0) {
          cutSeen++
          cutPos = before
        }
        g = res.state
      } else break
      continue
    }
    const Q = C.buildQuarters(g.map)
    const q = Q[g.s.qi]
    if (q && (rebal === 'quarterly' || q.q === 1)) {
      const prev = g.s.kty && g.s.kty[q.my - 1]
      if (prev) {
        let best = null
        let bestV = -Infinity
        for (const k of Object.keys(prev)) {
          if (prev[k] > bestV) { bestV = prev[k]; best = k }
        }
        if (best && best !== g.s.sect) g = C.setSector(g, best).state
      }
      if (strategy === 'aggr') {
        if (!g.s.lev) g = C.toggle(g, 'lev').state
        g = C.setPosition(g, 1).state
      } else {
        if (g.s.lev) g = C.toggle(g, 'lev').state
        g = C.setPosition(g, pos).state
      }
    }
    g = C.step(g, rng).state
  }
  let lg = 0
  while (g.phase === 'late' && lg++ < 100) {
    g = C.lateStep(g, rng).state
    if (g.phase === 'end') break
    g = C.chooseLate(g, 0, rng).state
  }
  const end = C.endView(g)
  const base = String(end.title).replace(/（.*?）/g, '')
  return {
    title: base,
    busted: g.s.busted,
    mult: g.s.asset / g.s.start,
    seasons: g.s.seasons,
    cutSeen: cutSeen,
    cutPos: cutPos,
  }
}

function stats(mode, loss) {
  C.setCutMode(mode)
  // loss == null ⇒ 走 cutLoss(pos) 公式；给数字 ⇒ 钉成常数（扫参数时用）
  C.setCutLoss(loss == null ? null : loss)
  const titles = {}
  const mults = []
  let bust = 0
  let seasonSum = 0
  let cutRuns = 0
  let cutFlat = 0
  for (let i = 0; i < count; i++) {
    const r = play(from + i)
    titles[r.title] = (titles[r.title] || 0) + 1
    mults.push(r.mult)
    if (r.busted) bust++
    seasonSum += r.seasons
    if (r.cutSeen > 0) cutRuns++
    if (r.cutSeen > 0 && r.cutPos === 0) cutFlat++
  }
  const sorted = mults.slice().sort(function (a, b) { return a - b })
  const mean = mults.reduce(function (a, b) { return a + b }, 0) / mults.length
  const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  return {
    mode: mode,
    n: mults.length,
    titles: titles,
    mean: mean,
    median: mid,
    bustRate: bust / mults.length,
    seasonAvg: seasonSum / mults.length,
    cutRuns: cutRuns,
    cutFlat: cutFlat,
  }
}

function pct(v) { return (v * 100).toFixed(1) + '%' }
function fx(v) { return v.toFixed(2) + '×' }

const ORDER = ['爆仓', '白干一场', '温饱', '小康', '大户', '传奇', '资本系', '孤家寡人', '善终']

// ---- 扫杠杆项 c：三组策略 × 四档 c，判据是每组 |Δ平均倍数| ≤5% 且 |Δ爆仓率| ≤2pp ----
if (sweepC) {
  const groups = [
    { name: '满仓(不杠杆)', strategy: 'base', pos: 1 },
    { name: '半仓(不杠杆)', strategy: 'base', pos: 0.5 },
    { name: '满仓+杠杆', strategy: 'aggr', pos: 1 },
  ]
  console.log('扫杠杆项 c：seed ' + from + '..' + (from + count - 1) + '（' + count + ' 局/格）｜换仓=' + rebal + '｜口径=liquidate｜对照=legacy')
  const bases = []
  for (const gm of groups) {
    strategy = gm.strategy
    pos = gm.pos
    bases.push(stats('legacy'))
  }
  const results = []
  for (const c of levCoeffs) {
    C.setCutLev(c)
    const row = { c: c, cells: [] }
    for (let i = 0; i < groups.length; i++) {
      strategy = groups[i].strategy
      pos = groups[i].pos
      row.cells.push(stats('liquidate'))
    }
    results.push(row)
  }
  C.setCutLev(0.06)
  for (const r of results) {
    console.log('')
    console.log('### c = ' + r.c.toFixed(2))
    console.log('组  legacy 平均  新 平均  Δ平均  legacy 爆仓  新 爆仓  Δ爆仓  判定')
    groups.forEach(function (gm, i) {
      const c0 = r.cells[i]
      const b = bases[i]
      const dm = ((c0.mean - b.mean) / b.mean) * 100
      const db = (c0.bustRate - b.bustRate) * 100
      console.log(gm.name + '  ' + fx(b.mean) + '  ' + fx(c0.mean) + '  ' + (dm >= 0 ? '+' : '') + dm.toFixed(2) + '%  ' +
        pct(b.bustRate) + '  ' + pct(c0.bustRate) + '  ' + (db >= 0 ? '+' : '') + db.toFixed(2) + 'pp  ' +
        ((Math.abs(dm) <= 5 && Math.abs(db) <= 2) ? 'PASS' : 'FAIL'))
    })
  }
  console.log('')
  console.log('判据：三组全过 ｜Δ平均倍数| ≤ 5% 且 |Δ爆仓率| ≤ 2pp')
  const pass = []
  for (const r of results) {
    const ok = r.cells.every(function (c0, i) {
      const b = bases[i]
      const dm = ((c0.mean - b.mean) / b.mean) * 100
      const db = (c0.bustRate - b.bustRate) * 100
      return Math.abs(dm) <= 5 && Math.abs(db) <= 2
    })
    if (ok) pass.push(r.c)
    const worstMean = Math.max.apply(null, r.cells.map(function (c0, i) { const b = bases[i]; return Math.abs(((c0.mean - b.mean) / b.mean) * 100) }))
    const worstBust = Math.max.apply(null, r.cells.map(function (c0, i) { const b = bases[i]; return Math.abs((c0.bustRate - b.bustRate) * 100) }))
    console.log('c=' + r.c.toFixed(2) + '  ' + (ok ? 'PASS' : 'FAIL') + '  最大 |Δ平均| ' + worstMean.toFixed(2) + '%  最大 |Δ爆仓| ' + worstBust.toFixed(2) + 'pp')
  }
  console.log(pass.length
    ? '满足判据：' + pass.map(function (v) { return v.toFixed(2) }).join(', ') + '｜最小 c = ' + Math.min.apply(null, pass).toFixed(2)
    : '满足判据：无')
  fs.unlinkSync(out)
  process.exit(0)
}

// ---- 扫参数模式：割肉代价 × 两档仓位 ----
if (sweep) {
  console.log('扫参数：seed ' + from + '..' + (from + count - 1) + '（' + count + ' 局/格）｜换仓=' + rebal + '｜口径=liquidate（空仓不扣）｜对照=legacy')
  const baseByPos = new Map()
  for (const q of positions) {
    pos = q
    baseByPos.set(q, stats('legacy'))
  }
  const cells = []
  for (const loss of losses) {
    const one = []
    for (const q of positions) {
      pos = q
      one.push(stats('liquidate', loss))
    }
    cells.push({ loss: loss, one: one })
  }
  positions.forEach(function (q, i) {
    const b = baseByPos.get(q)
    console.log('')
    console.log('=== 仓位 ' + q + ' ｜legacy 基线：平均 ' + fx(b.mean) + '｜中位 ' + fx(b.median) + '｜爆仓 ' + pct(b.bustRate) + '｜温饱 ' + (b.titles['温饱'] || 0) + '｜小康 ' + (b.titles['小康'] || 0) + '｜大户 ' + (b.titles['大户'] || 0) + ' ===')
    console.log('割肉代价	平均倍数	偏差	中位数	爆仓率	温饱	小康	大户	传奇	触发空仓')
    for (const r of cells) {
      const c = r.one[i]
      const d = ((c.mean - b.mean) / b.mean) * 100
      console.log((r.loss * 100).toFixed(0) + '%	' + fx(c.mean) + '	' + (d >= 0 ? '+' : '') + d.toFixed(2) + '%	' + fx(c.median) + '	' + pct(c.bustRate) +
        '	' + (c.titles['温饱'] || 0) + '	' + (c.titles['小康'] || 0) + '	' + (c.titles['大户'] || 0) + '	' + (c.titles['传奇'] || 0) + '	' + c.cutFlat)
    }
  })
  console.log('')
  console.log('判据：两档仓位的 |平均倍数偏差| ≤ 5% 且 爆仓率变化 ≤ 5pp')
  const pass = []
  for (const r of cells) {
    const d = r.one.map(function (c, i) { const b = baseByPos.get(positions[i]); return ((c.mean - b.mean) / b.mean) * 100 })
    const db = r.one.map(function (c, i) { const b = baseByPos.get(positions[i]); return (c.bustRate - b.bustRate) * 100 })
    const ok = d.every(function (v) { return Math.abs(v) <= 5 }) && db.every(function (v) { return Math.abs(v) <= 5 })
    if (ok) pass.push(r.loss)
    console.log((r.loss * 100).toFixed(0) + '%	' + (ok ? 'PASS' : 'FAIL') + '	偏差 ' + d.map(function (v) { return (v >= 0 ? '+' : '') + v.toFixed(2) + '%' }).join(' / ') + '	爆仓 Δ ' + db.map(function (v) { return v.toFixed(2) + 'pp' }).join(' / '))
  }
  console.log(pass.length
    ? '满足判据：' + pass.map(function (v) { return (v * 100).toFixed(0) + '%' }).join(', ') + '｜最小代价 = ' + (Math.min.apply(null, pass) * 100).toFixed(0) + '%'
    : '满足判据：无')
  fs.unlinkSync(out)
  process.exit(0)
}

const modes = which === 'all' ? ['legacy', 'liquidate'] : [which === 'old' ? 'legacy' : 'liquidate']
const rows = modes.map(function (m) { return stats(m) })

// 表：行=指标，列=各变体
const head = ['指标'].concat(rows.map(function (r) { return r.mode }))
const lines = []
lines.push(head.join('\t'))
for (const t of ORDER) {
  lines.push([t].concat(rows.map(function (r) { return String(r.titles[t] || 0) })).join('\t'))
}
lines.push(['—— 合计', ].concat(rows.map(function (r) { return String(r.n) })).join('\t'))
lines.push(['平均结局倍数', ].concat(rows.map(function (r) { return fx(r.mean) })).join('\t'))
lines.push(['中位数倍数', ].concat(rows.map(function (r) { return fx(r.median) })).join('\t'))
lines.push(['爆仓率', ].concat(rows.map(function (r) { return pct(r.bustRate) })).join('\t'))
lines.push(['seasons 均值', ].concat(rows.map(function (r) { return r.seasonAvg.toFixed(2) })).join('\t'))
lines.push(['触发 cut 的局数', ].concat(rows.map(function (r) { return String(r.cutRuns) })).join('\t'))
lines.push(['其中触发时是空仓', ].concat(rows.map(function (r) { return String(r.cutFlat) })).join('\t'))

const stratText = strategy === 'aggr' ? '满仓 + 杠杆 + 追去年最猛' : '仓位 ' + pos + ' / 不杠杆'
console.log('seed ' + from + '..' + (from + count - 1) + '（' + count + ' 局）｜换仓=' + rebal + '｜' + stratText + '｜板块取上一年超额最高 / 不探消息 / 事件选第 1 项')
console.log(lines.join('\n'))

if (rows.length >= 2) {
  const legacy = rows[0]
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const dBust = (r.bustRate - legacy.bustRate) * 100
    const dMean = ((r.mean - legacy.mean) / legacy.mean) * 100
    const okBust = Math.abs(dBust) <= 5
    const okMean = Math.abs(dMean) <= 5
    console.log('\n[' + r.mode + ' vs legacy] 爆仓率变化 ' + dBust.toFixed(2) + ' 个百分点（阈值 ±5.00）' + (okBust ? ' PASS' : ' FAIL') +
      '｜平均倍数变化 ' + dMean.toFixed(2) + '%（阈值 ±5%）' + (okMean ? ' PASS' : ' FAIL') +
      '｜结论 ' + (okBust && okMean ? '在阈值内，可以落地' : '超阈值，不要落地'))
  }
}

fs.unlinkSync(out)
