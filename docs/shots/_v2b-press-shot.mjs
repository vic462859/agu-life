#!/usr/bin/env node
/**
 * V2b 截图（开发工具，不进 src）：esbuild 打包 src/game/app.ts → 浏览器里用真 canvas 画
 * 「常态 / 按下」两张同一屏，再上下拼成一张 docs/shots/v2b-press.png。
 * 为什么在浏览器里画：布局里全是 measureText，Node 里没有字体度量就拍不出真排版。
 *
 * 用法：node docs/shots/_v2b-press-shot.mjs [端口]   然后打开 http://127.0.0.1:<端口>
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
  'const W = 390, H = 844, DPR = 2, BAND = 28',
  'function makeStore() {',
  '  const map = new Map()',
  '  return { get(k) { return map.has(k) ? map.get(k) : null }, set(k, v) { map.set(k, v) } }',
  '}',
  'function boot() {',
  '  const cv = document.createElement("canvas")',
  '  cv.width = W * DPR; cv.height = H * DPR',
  '  cv.style.width = W + "px"; cv.style.height = H + "px"',
  '  const ctx = cv.getContext("2d")',
  '  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)',
  '  const game = new G.Game({ ctx: ctx, width: W, height: H, storage: makeStore(), seed: 4242 })',
  '  game.render()',
  '  return { game: game, cv: cv }',
  '}',
  'function region(game, id) {',
  '  const r = game.regions().find(function (h) { return h.id === id })',
  '  if (!r) throw new Error("没有命中区 " + id)',
  '  return r.rect',
  '}',
  'function reveal(game, id) {',
  '  for (let i = 0; i < 20; i++) {',
  '    game.render()',
  '    const r = region(game, id)',
  '    if (r.y >= 0 && r.y + r.h <= H) return r',
  '    game.scrollPage(Math.max(0, game.scrolled + r.y - (H - r.h) / 2))',
  '  }',
  '  return region(game, id)',
  '}',
  'function tap(game, id) {',
  '  const r = reveal(game, id)',
  '  game.tap(r.x + r.w / 2, r.y + r.h / 2)',
  '  game.render()',
  '}',
  'function copy(cv) {',
  '  const c = document.createElement("canvas")',
  '  c.width = W * DPR; c.height = H * DPR',
  '  c.getContext("2d").drawImage(cv, 0, 0)',
  '  return c',
  '}',
  'function save(name, cv) {',
  '  return fetch("/save?name=" + name, { method: "POST", body: cv.toDataURL("image/png") })',
  '}',
  'async function main() {',
  '  const A = boot()',
  '  tap(A.game, "org:0")',
  '  // 走两季：顶栏的资产 / 本季 Δ / 连盈有东西可看，两个开关也都在',
  '  for (let i = 0; i < 2; i++) {',
  '    if (A.game.view === "event") tap(A.game, "ev:0")',
  '    tap(A.game, "step")',
  '  }',
  '  let guard = 0',
  '  while (A.game.view === "event" && guard++ < 10) tap(A.game, "ev:0")',
  '  // 补间推完（否则大字还停在上一季的数上，截图会像卡住）',
  '  for (let i = 0; i < 30; i++) A.game.frame(0.05)',
  '  const step = reveal(A.game, "step")',
  '  A.game.render()',
  '  const normal = copy(A.cv)',
  '  // 按下态：只 down 不 up，时间一帧不走，所以两张图的差别只有那圈 1px 边',
  '  A.game.down(step.x + step.w / 2, step.y + step.h / 2)',
  '  A.game.render()',
  '  const pressed = copy(A.cv)',
  '  if (!A.game.pressedId) throw new Error("按下态没记上")',
  '  const out = document.createElement("canvas")',
  '  out.width = W * DPR; out.height = (H * 2 + BAND * 2) * DPR',
  '  const c = out.getContext("2d")',
  '  c.setTransform(DPR, 0, 0, DPR, 0, 0)',
  '  c.fillStyle = "#06090d"; c.fillRect(0, 0, W, H * 2 + BAND * 2)',
  '  c.fillStyle = "#9fadbe"; c.font = \'600 13px "PingFang SC", "Microsoft YaHei", sans-serif\'',
  '  c.fillText("常态：交易页（未按下）", 12, BAND - 9)',
  '  c.drawImage(normal, 0, 0, W * DPR, H * DPR, 0, BAND, W, H)',
  '  c.fillText("按下「过一季」：命中区里侧 1px 描边（全局统一）", 12, BAND * 2 + H - 9)',
  '  c.drawImage(pressed, 0, 0, W * DPR, H * DPR, 0, BAND * 2 + H, W, H)',
  '  document.body.appendChild(out)',
  '  await save("v2b-press", out)',
  '  document.title = "DONE:v2b-press"',
  '}',
  'main().catch(function (e) { document.title = "ERR:" + (e && e.message ? e.message : e) })',
].join('\n')

const pageHtml =
  '<!doctype html><html><head><meta charset="utf-8"><title>v2b-press</title>' +
  '<style>html,body{margin:0;background:#06090d}canvas{display:block}</style></head><body>' +
  '<script>' + js + '</scr' + 'ipt><script>' + PAGE_BODY + '</scr' + 'ipt></body></html>'

const srv = http.createServer(function (req, res) {
  const u = new URL(req.url || '/', 'http://127.0.0.1')
  if (req.method === 'POST' && u.pathname === '/save') {
    let body = ''
    req.on('data', function (c) { body += c })
    req.on('end', function () {
      const m = /^data:image\/png;base64,(.*)$/.exec(body)
      if (!m) { res.statusCode = 400; res.end('bad'); return }
      const name = u.searchParams.get('name') || 'shot'
      fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(m[1], 'base64'))
      console.log('✓ docs/shots/' + name + '.png')
      res.end('ok')
    })
    return
  }
  res.setHeader('Content-Type', 'text/html;charset=utf-8')
  res.end(pageHtml)
})
const port = Number(process.argv[2] || 5253)
srv.listen(port, '127.0.0.1', function () {
  console.log('v2b press shot on http://127.0.0.1:' + port)
})
