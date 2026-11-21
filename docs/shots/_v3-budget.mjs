#!/usr/bin/env node
/**
 * 分区预算量尺（开发工具）：在真浏览器里把每一屏画一遍，从「面板底色的 fillRect」里量出
 * 每块面板的真高度（面板高度依赖 measureText，Node 里量不出真值），POST 回 JSON。
 * 用法：node docs/shots/_v3-budget.mjs [端口] → 浏览器打开 → docs/shots/_v3-budget.json
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

const root = path.resolve('.')
const bundle = await build({
  stdin: { contents: "export { Game } from './src/game/app'", resolveDir: root, loader: 'ts' },
  bundle: true,
  format: 'iife',
  globalName: 'G',
  target: 'es2020',
  write: false,
})
const js = bundle.outputFiles[0].text

const BODY = [
  'const W = 390, H = 844, DPR = 2',
  'function boot(meta) {',
  '  const cv = document.createElement("canvas")',
  '  cv.width = W * DPR; cv.height = H * DPR',
  '  cv.style.width = W + "px"; cv.style.height = H + "px"',
  '  document.body.appendChild(cv)',
  '  const ctx = cv.getContext("2d")',
  '  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)',
  '  const fills = []',
  '  const fillRect = ctx.fillRect.bind(ctx)',
  '  ctx.fillText = (function (orig) { return function (t, x, y) { this.__lastText = String(t); return orig.call(this, t, x, y) } })(ctx.fillText.bind(ctx))',
  '  ctx.fillRect = function (x, y, w, h) { fills.push({ style: String(this.fillStyle), x: x, y: y, w: w, h: h }); return fillRect(x, y, w, h) }',
  '  const map = new Map()',
  '  if (meta) map.set("agu_meta_v1", JSON.stringify(meta))',
  '  const storage = { get(k) { return map.has(k) ? map.get(k) : null }, set(k, v) { map.set(k, v) } }',
  '  const game = new G.Game({ ctx: ctx, width: W, height: H, storage: storage, seed: 4242 })',
  '  game.render()',
  '  return { game: game, fills: fills }',
  '}',
  '/** 面板 = 用面板底色铺的整列矩形（col.x 起、col.w 宽）；按绘制顺序取第一笔。 */',
  'function panels(fills, colX, colW) {',
  '  const out = []',
  '  for (const f of fills) {',
  '    if (f.x !== colX || f.w !== colW || f.h < 20) continue',
  '    if (f.style !== "#0f1620" && f.style !== "#0a0f16") continue',
  '    out.push({ y: Math.round(f.y), h: Math.round(f.h), tone: f.style === "#0f1620" ? "bg2" : "bg1" })',
  '  }',
  '  return out',
  '}',
  'function ids(game) { return game.regions().map(function (r) { return r.id }) }',
  'function tap(game, id) {',
  '  const r = game.regions().find(function (h) { return h.id === id })',
  '  game.tap(r.rect.x + r.rect.w / 2, r.rect.y + r.rect.h / 2)',
  '  game.render()',
  '}',
  'function reveal(game, id) {',
  '  for (let i = 0; i < 16; i++) {',
  '    game.render()',
  '    const r = game.regions().find(function (h) { return h.id === id })',
  '    if (r.rect.y >= 0 && r.rect.y + r.rect.h <= H) return r',
  '    game.scrollPage(Math.max(0, game.scrolled + r.rect.y - 200))',
  '  }',
  '  game.render()',
  '  return game.regions().find(function (h) { return h.id === id })',
  '}',
  'function tapv(game, id) { const r = reveal(game, id); game.tap(r.rect.x + r.rect.w / 2, r.rect.y + r.rect.h / 2); game.render() }',
  'async function main() {',
  '  const out = { size: [W, H], screens: {} }',
  '  const col = { x: (W - Math.min(W - 2 * Math.max(16, Math.min(40, W * 0.06)), 560)) / 2 }',
  '  const colW = Math.min(W - 2 * Math.max(16, Math.min(40, W * 0.06)), 560)',
  '',
  '  // 出身屏（挑战码面板在里头）',
  '  const A = boot({ v: 1, points: 6, unlocked: [], lastSettled: null, currentTalent: null })',
  '  A.fills.length = 0',
  '  A.game.render()',
  '  out.screens.org = { panels: panels(A.fills, col.x, colW), ids: ids(A.game) }',
  '  const orgBottom = Math.max.apply(null, A.game.regions().map(function (r) { return r.rect.y + r.rect.h }))',
  '  out.screens.org.lastHitBottom = Math.round(orgBottom)',
  '',
  '  // 天赋屏',
  '  tap(A.game, "org:0")',
  '  A.fills.length = 0',
  '  A.game.render()',
  '  out.screens.talent = { panels: panels(A.fills, col.x, colW), ids: ids(A.game) }',
  '',
  '  // 交易页（第一屏 = 决策元素：顶栏 / 上岸 / 贵贱 / 板块卡）',
  '  const first = A.game.talentOffer[0]',
  '  tap(A.game, "talent:" + first.id)',
  '  tap(A.game, "talent:" + first.id)',
  '  A.game.scrollPage(0); A.fills.length = 0; A.game.render()',
  '  const tPanels = panels(A.fills, col.x, colW)',
  '  const sector = A.game.regions().filter(function (r) { return r.id.indexOf("sector:") === 0 })',
  '  out.screens.trade = {',
  '    panels: tPanels,',
  '    sectorCards: sector.map(function (r) { return { id: r.id, y: Math.round(r.rect.y), h: r.rect.h } }),',
  '    foldY: H,',
  '    ids: ids(A.game),',
  '  }',
  '',
  '  // 结局屏',
  '  let g = 0',
  '  while (A.game.view !== "over" && g++ < 400) {',
  '    if (A.game.view === "event") { tapv(A.game, "ev:0"); continue }',
  '    tapv(A.game, "year")',
  '  }',
  '  for (let i = 0; i < 40; i++) A.game.frame(0.1)',
  '  A.game.scrollPage(0); A.fills.length = 0; A.game.render()',
  '  const oPanels = panels(A.fills, col.x, colW)',
  '  out.screens.over = { panels: oPanels, ids: ids(A.game) }',
  '  out.screens.over.totalContent = Math.round(A.game.regions().length ? Math.max.apply(null, A.game.regions().map(function (r) { return r.rect.y + r.rect.h })) : 0)',
  '',
  '  await fetch("/save", { method: "POST", body: JSON.stringify(out) })',
  '  document.title = "DONE"',
  '}',
  'main().catch(function (e) { document.title = "ERR:" + (e && e.message ? e.message : e) })',
].join('\n')

const page =
  '<!doctype html><html><head><meta charset="utf-8"><title>v3-budget</title>' +
  '<style>html,body{margin:0;background:#06090d}canvas{display:block}</style></head><body>' +
  '<script>' + js + '</scr' + 'ipt><script>' + BODY + '</scr' + 'ipt></body></html>'

const srv = http.createServer(function (req, res) {
  const u = new URL(req.url || '/', 'http://127.0.0.1')
  if (req.method === 'POST' && u.pathname === '/save') {
    let body = ''
    req.on('data', function (c) {
      body += c
    })
    req.on('end', function () {
      fs.writeFileSync(path.join(root, 'docs', 'shots', '_v3-budget.json'), body)
      console.log(JSON.stringify(JSON.parse(body), null, 1))
      res.end('ok')
    })
    return
  }
  res.setHeader('Content-Type', 'text/html;charset=utf-8')
  res.end(page)
})
const port = Number(process.argv[2] || 5255)
srv.listen(port, '127.0.0.1', function () {
  console.log('budget on http://127.0.0.1:' + port)
})
