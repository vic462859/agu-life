#!/usr/bin/env node
/**
 * V3 截图（开发工具，不进 src）：esbuild 打包 src/game/app.ts → 页面里用真 canvas 画 → PNG POST 回 docs/shots。
 * 为什么在浏览器里画：布局里全是 measureText（自动换行、截断），Node 里没有字体度量就拍不出真排版。
 *
 * 用法：node docs/shots/_v3-shots.mjs [端口]   然后用浏览器打开 http://127.0.0.1:<端口>
 * 产物：v3-code.png / v3-talent.png / v3-trade.png / v3-end.png / v3-end-top.png
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

const root = path.resolve('.')
const shots = path.join(root, 'docs', 'shots')

const bundle = await build({
  stdin: { contents: "export { Game } from './src/game/app'", resolveDir: root, loader: 'ts' },
  bundle: true,
  format: 'iife',
  globalName: 'G',
  target: 'es2020',
  write: false,
})
const js = bundle.outputFiles[0].text

const PAGE_BODY = [
  'const W = 390, H = 844, DPR = 2',
  'function makeStore() {',
  '  const map = new Map()',
  '  // 天赋屏要有东西可买：6 个记忆点、什么都没解锁（三条锁着的卡按价钱排在前面）',
  "  map.set('agu_meta_v1', JSON.stringify({ v: 1, points: 6, unlocked: ['fa'], lastSettled: null, currentTalent: null }))",
  '  return { map: map, get(k) { return map.has(k) ? map.get(k) : null }, set(k, v) { map.set(k, v) } }',
  '}',
  'function boot() {',
  '  const cv = document.createElement("canvas")',
  '  cv.width = W * DPR; cv.height = H * DPR',
  '  cv.style.width = W + "px"; cv.style.height = H + "px"',
  '  document.body.appendChild(cv)',
  '  const ctx = cv.getContext("2d")',
  '  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)',
  '  const texts = []',
  '  const fillText = ctx.fillText.bind(ctx)',
  '  ctx.fillText = function (t, x, y) { texts.push({ t: String(t), x: x, y: y }); fillText(t, x, y) }',
  '  const storage = makeStore()',
  '  const clip = { read: function () { return Promise.resolve("") }, write: function () {} }',
  '  const game = new G.Game({ ctx: ctx, width: W, height: H, storage: storage, seed: 4242, clip: clip })',
  '  game.render()',
  '  return { game: game, cv: cv, texts: texts }',
  '}',
  'function at(game, id) {',
  '  const r = game.regions().find(function (h) { return h.id === id })',
  '  if (!r) throw new Error("没有命中区 " + id)',
  '  return { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 }',
  '}',
  'function reveal(game, id, at0) {',
  '  for (let i = 0; i < 16; i++) {',
  '    game.render()',
  '    const r = game.regions().find(function (h) { return h.id === id })',
  '    if (!r) throw new Error("没有命中区 " + id)',
  '    if (r.rect.y >= 0 && r.rect.y + r.rect.h <= H) return { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 }',
  '    game.scrollPage(Math.max(0, game.scrolled + r.rect.y - (at0 || 200)))',
  '  }',
  '  game.render()',
  '  const r = game.regions().find(function (h) { return h.id === id })',
  '  return { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 }',
  '}',
  'function tap(game, id) { const p = reveal(game, id); game.tap(p.x, p.y); game.render() }',
  'function save(name, cv) {',
  '  return fetch("/save?name=" + name, { method: "POST", body: cv.toDataURL("image/png") })',
  '}',
  'async function main() {',
  '  const saved = []',
  '  const A = boot()',
  '  // 1 开局屏：挑战码面板与三张出身卡同屏（390×844 放得下）',
  '  A.game.scrollPage(0); A.game.render()',
  '  await save("v3-code", A.cv); saved.push("v3-code")',
  '',
  '  // 2 天赋三选一',
  '  tap(A.game, "org:0")',
  '  A.game.render()',
  '  await save("v3-talent", A.cv); saved.push("v3-talent")',
  '',
  '  // 3 交易页：顶栏 40×48 头像 + 板块卡右下角的迷你走势',
  '  //   （走势要走过几季才有数：sectorSeries 在 qi=0 时返回空数组，第一季本来就没得画）',
  '  const first = A.game.talentOffer[0]',
  '  tap(A.game, "talent:" + first.id)',
  '  for (let i = 0; i < 6; i++) {',
  '    if (A.game.view === "event") { tap(A.game, "ev:0"); continue }',
  '    tap(A.game, "step")',
  '  }',
  '  // 推到一半撞上事件卡：先把卡点掉，截图要的是交易页本身',
  '  let guard2 = 0',
  '  while (A.game.view === "event" && guard2++ < 20) tap(A.game, "ev:0")',
  '  // 轻提示 3.4 秒后自己走；直接推 4 秒的 dt，把它从截图上清掉',
  '  for (let i = 0; i < 80; i++) A.game.frame(0.05)',
  '  A.game.scrollPage(0); A.game.render()',
  '  await save("v3-trade", A.cv); saved.push("v3-trade")',
  '',
  '  // 4 一路到结局',
  '  let guard = 0',
  '  while (A.game.view !== "over" && guard++ < 400) {',
  '    if (A.game.view === "event") { tap(A.game, "ev:0"); continue }',
  '    if (A.game.view !== "trade") throw new Error("没料到的屏幕 " + A.game.view)',
  '    tap(A.game, "year")',
  '  }',
  '  // 六层仪式直接推到底（不点跳过，跳过那张 chip 会挡住角上的东西）',
  '  for (let i = 0; i < 40; i++) A.game.frame(0.1)',
  '  A.game.render()',
  '  // 5 结局顶部：96×120 胸像 + 金额 + 带天赋 / 记忆点',
  '  A.game.scrollPage(0); A.game.render()',
  '  await save("v3-end-top", A.cv); saved.push("v3-end-top")',
  '',
  '  // 6 结局长图那一段：滚到「那三十六年 · 指数」露头的位置（坐标从这一帧的 fillText 里读，不猜布局）',
  '  A.texts.length = 0',
  '  A.game.render()',
  '  const head = A.texts.filter(function (t) { return t.t.indexOf("那三十六年") === 0 })[0]',
  '  if (!head) throw new Error("结局屏没画「那三十六年 · 指数」")',
  '  A.game.scrollPage(Math.max(0, head.y - 96))',
  '  A.game.render()',
  '  await save("v3-end", A.cv); saved.push("v3-end")',
  '',
  '  document.title = "DONE:" + saved.join(",")',
  '}',
  'main().catch(function (e) { document.title = "ERR:" + (e && e.message ? e.message : e) })',
].join('\n')

const page =
  '<!doctype html><html><head><meta charset="utf-8"><title>v3-shots</title>' +
  '<style>html,body{margin:0;background:#06090d}canvas{display:block}</style></head><body>' +
  '<script>' + js + '</scr' + 'ipt><script>' + PAGE_BODY + '</scr' + 'ipt></body></html>'

const srv = http.createServer(function (req, res) {
  const u = new URL(req.url || '/', 'http://127.0.0.1')
  if (req.method === 'POST' && u.pathname === '/save') {
    let body = ''
    req.on('data', function (c) {
      body += c
    })
    req.on('end', function () {
      const m = /^data:image\/png;base64,(.*)$/.exec(body)
      if (!m) {
        res.statusCode = 400
        res.end('bad')
        return
      }
      const name = u.searchParams.get('name') || 'shot'
      fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(m[1], 'base64'))
      console.log('✓ docs/shots/' + name + '.png')
      res.end('ok')
    })
    return
  }
  res.setHeader('Content-Type', 'text/html;charset=utf-8')
  res.end(page)
})
const port = Number(process.argv[2] || 5252)
srv.listen(port, '127.0.0.1', function () {
  console.log('v3 shots on http://127.0.0.1:' + port)
})
