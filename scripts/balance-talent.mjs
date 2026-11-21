// 天赋的平衡对照：同一批 seed、同一套自动策略、三组仓位，跑「不带天赋 vs 每个天赋各带一次」。
// 用法：node scripts/balance-talent.mjs [--seeds 200] [--from 1000] [--talent cash]
// 判据（照 docs/adr/0001-cut-semantics.md 的方法论）：平均结局倍数 Δ ≤ +15%、爆仓率 Δ ≤ +3pp。
// 超阈值就停下报表，不改数值。
// 零新增依赖：只借仓库里已有的 esbuild 把 core 打成一份 ESM 再跑（同 balance-cut.mjs）。
import { build } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const argv = process.argv.slice(2)
function arg(name, def) {
  const i = argv.indexOf('--' + name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const count = Number(arg('seeds', 200))
const from = Number(arg('from', 1000))
const only = arg('talent', '')
const rebal = arg('rebalance', 'yearly')
// 出身下标（0=厂里子弟 / 1=机关双职工 / 2=深圳回来）：属性天赋在不同的出身上有不同的落点。
const org = Number(arg('org', 0))

const out = path.join(os.tmpdir(), 'agu-balance-talent.mjs')
await build({
  stdin: {
    contents: "export * from './src/core'\nexport * from './src/core/data/talents'\nexport * from './src/core/meta'",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  outfile: out,
  write: true,
})
const C = await import('file://' + out.replace(/\\/g, '/'))

const TALENTS = C.TALENTS
const variants = [{ id: null, name: '不带天赋' }].concat(TALENTS.map(function (t) { return { id: t.id, name: t.name } }))
  .filter(function (v) { return !only || v.id === null || v.id === only })

// 第四组「行动派」是给属性天赋用的量具：它每年真的花行动点（打探 → 请经理喝酒 → 盯盘），
// 所以盘感 / 人脉 / 声望 / 家这些阈值型字段才有机会被踩到。前三组是 ADR 要求的固定仓位组。
const groups = [
  { name: '满仓(不杠杆)', strategy: 'base', pos: 1 },
  { name: '半仓(不杠杆)', strategy: 'base', pos: 0.5 },
  { name: '满仓+杠杆', strategy: 'aggr', pos: 1 },
  { name: '行动派(满仓)', strategy: 'act', pos: 1 },
]

/** 行动派的一年：3 次行动点 = 打探 → 请经理喝酒 → 盯盘；摸清了就押真消息指的那个赛道。 */
function playActActions(g, rng) {
  for (let i = 0; i < 3; i++) {
    if (g.phase !== 'trade' || g.s.over || g.s.ap <= 0) break
    if (!g.s.probed) {
      g = C.probeIntel(g, rng).state
      continue
    }
    if (i === 1) g = C.runAct(g, 'social', 0, rng).state
    else g = C.runAct(g, 'watch', 0, rng).state
  }
  return g
}

/** 自动策略（与 balance-cut.mjs 同一套）：年初换到上一年超额最高的板块，事件一律选第 1 项。 */
function play(seed, talentId, gm) {
  const rng = C.createRng(seed)
  let g = C.createGame(org, 'real', seed, rng, talentId).state
  let guard = 0
  while (g.phase === 'trade' && guard++ < 3000) {
    if (g.pending) {
      const p = g.pending
      if (p.type === 'year') g = C.chooseYear(g, 0, rng).state
      else if (p.type === 'event') g = C.chooseEvent(g, 0, rng).state
      else break
      continue
    }
    const Q = C.buildQuarters(g.map)
    const q = Q[g.s.qi]
    if (q && (rebal === 'quarterly' || q.q === 1)) {
      if (gm.strategy === 'act') g = playActActions(g, rng)
      if (g.phase !== 'trade' || g.s.over) break
      const prev = g.s.kty && g.s.kty[q.my - 1]
      if (gm.strategy === 'act' && g.s.probed && g.s.intel) {
        const truth = g.s.flip ? g.s.intel[1] : g.s.intel[3]
        if (truth !== g.s.sect) g = C.setSector(g, truth).state
      } else if (prev) {
        let best = null
        let bestV = -Infinity
        for (const k of Object.keys(prev)) {
          if (prev[k] > bestV) { bestV = prev[k]; best = k }
        }
        if (best && best !== g.s.sect) g = C.setSector(g, best).state
      }
      if (gm.strategy === 'aggr') {
        if (!g.s.lev) g = C.toggle(g, 'lev').state
        g = C.setPosition(g, 1).state
      } else {
        if (g.s.lev) g = C.toggle(g, 'lev').state
        g = C.setPosition(g, gm.pos).state
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
  return { mult: g.s.asset / g.s.start, busted: g.s.busted }
}

function stats(talentId, gm) {
  const mults = []
  let bust = 0
  for (let i = 0; i < count; i++) {
    const r = play(from + i, talentId, gm)
    mults.push(r.mult)
    if (r.busted) bust++
  }
  const mean = mults.reduce(function (a, b) { return a + b }, 0) / mults.length
  return { mean: mean, bustRate: bust / mults.length, n: mults.length }
}

function pct(v) { return (v * 100).toFixed(1) + '%' }
function fx(v) { return v.toFixed(2) + '×' }
function sign(v) { return (v >= 0 ? '+' : '') + v.toFixed(2) }

console.log('天赋平衡对照：seed ' + from + '..' + (from + count - 1) + '（' + count + ' 局/格）｜换仓=' + rebal + '｜出身=' + C.ORG[org].k + '｜策略=上一年超额最高板块 / 事件选第 1 项')

/* --- 效果落点：每个天赋到底改了哪几个字段，以及那个字段在引擎里的作用点 --- */
const LANDING = {
  sense: '盘感 40→风险×0.75，60→风险×0.5（engine/settle.ts senseK）',
  net: '请经理喝酒问出底牌 0.3 + 人脉/200（engine/actions.ts）',
  rep: '声望 30 才进得去「去上市公司调研」（engine/actions.ts need 30）',
  fam: '家 < 30 每年 10% 被过户掉 18%（engine/step.ts）',
  fa: '成长股暴雷概率 ×0.5（engine/settle.ts:103），永不过期',
  cash: '本金与目标同抬：绝对值门槛（大户/资本系）更容易够到',
}
function probe() {
  const base = C.createGame(org, 'real', from, C.createRng(from), null).state.s
  const rows = []
  for (const t of TALENTS) {
    const s = C.createGame(org, 'real', from, C.createRng(from), t.id).state.s
    const diff = []
    for (const k of Object.keys(base)) {
      if (JSON.stringify(base[k]) !== JSON.stringify(s[k])) diff.push(k + ' ' + JSON.stringify(base[k]) + '→' + JSON.stringify(s[k]))
    }
    rows.push({ name: t.name, price: t.price, diff: diff.join('，'), landing: LANDING[t.id] || '' })
  }
  return rows
}
console.log('=== 效果落点（同一 seed 带/不带，逐字段差分）===')
console.log('天赋\t价\t改了哪些字段\t作用点')
for (const r of probe()) console.log(r.name + '\t' + r.price + '\t' + r.diff + '\t' + r.landing)

const table = []
for (const gm of groups) {
  const base = stats(null, gm)
  console.log('')
  console.log('=== ' + gm.name + ' ｜不带天赋基线：平均 ' + fx(base.mean) + '｜爆仓 ' + pct(base.bustRate) + '｜n=' + base.n + ' ===')
  console.log('天赋\t平均倍数\tΔ倍数\t爆仓率\tΔ爆仓\t判定')
  for (const v of variants) {
    if (v.id === null) continue
    const cur = stats(v.id, gm)
    const dm = ((cur.mean - base.mean) / base.mean) * 100
    const db = (cur.bustRate - base.bustRate) * 100
    const ok = dm <= 15 && db <= 3
    table.push({ talent: v.name, group: gm.name, mean: cur.mean, dm: dm, bust: cur.bustRate, db: db, ok: ok })
    console.log(v.name + '\t' + fx(cur.mean) + '\t' + sign(dm) + '%\t' + pct(cur.bustRate) + '\t' + sign(db) + 'pp\t' + (ok ? 'PASS' : 'FAIL'))
  }
}

console.log('')
console.log('=== 六行汇总（每格是 Δ倍数 / Δ爆仓，阈值 +15% / +3pp）===')
console.log('天赋\t' + groups.map(function (g) { return g.name }).join('\t') + '\t判定')
for (const v of variants) {
  if (v.id === null) continue
  const cells = table.filter(function (r) { return r.talent === v.name })
  const bad = cells.filter(function (r) { return !r.ok })
  console.log(v.name + '\t' + cells.map(function (r) { return sign(r.dm) + '% / ' + sign(r.db) + 'pp' }).join('\t') + '\t' + (bad.length ? 'FAIL' : 'PASS'))
}
const worstM = table.reduce(function (m, r) { return Math.max(m, r.dm) }, -Infinity)
const worstB = table.reduce(function (m, r) { return Math.max(m, r.db) }, -Infinity)
const fails = table.filter(function (r) { return !r.ok })
console.log('')
console.log('最大 Δ倍数 ' + sign(worstM) + '%（阈值 +15.00）｜最大 Δ爆仓 ' + sign(worstB) + 'pp（阈值 +3.00）')
console.log(fails.length
  ? '超阈值 ' + fails.length + ' 格：' + fails.map(function (r) { return r.talent + '/' + r.group }).join('、') + ' ⇒ 按 ADR 停下来报表，不改数值'
  : '全部 ' + table.length + ' 格在阈值内')

fs.unlinkSync(out)
