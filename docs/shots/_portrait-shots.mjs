// 人物截图生成器（开发工具，不进 src）：esbuild 打包 portrait.ts → 页面里画 → POST 回 PNG。
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

const root = path.resolve('.')
const outDir = path.join(root, 'docs/shots')

const bundle = await build({
  entryPoints: [path.join(root, 'src/ui/share/portrait.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'Portrait',
  target: 'es2020',
  write: false,
})

const js = bundle.outputFiles[0].text
const PAGE_HEAD =
  '<!doctype html><html><head><meta charset="utf-8"><title>portrait-shot</title>' +
  '<style>body{margin:0;background:#06090d;color:#9fadbe;font:12px/1.4 system-ui}canvas{display:block}</style>' +
  '</head><body><div id="gallery"></div><script>'
const PAGE_TAIL = '</body></html>'
const PAGE_BODY = "const D = Portrait.DEFAULT_PORTRAIT_COLORS\nconst FULL = [\n  { name: 'portrait-18',   spec: { age: 18, wealth: 0, health: 96, family: 55, record: 0,  mood: 'calm' } },\n  { name: 'portrait-bust', spec: { age: 47, wealth: 1, health: 14, family: 22, record: 0,  mood: 'bust' } },\n  { name: 'portrait-rich', spec: { age: 58, wealth: 4, health: 72, family: 74, record: 8,  mood: 'up'   } },\n  { name: 'portrait-old',  spec: { age: 85, wealth: 2, health: 38, family: 66, record: 28, mood: 'down' } }\n]\nconst BUSTS = [\n  { name: 'bust-18',    spec: { age: 18, wealth: 0, health: 96, family: 55, record: 0,  mood: 'calm' } },\n  { name: 'bust-crash', spec: { age: 47, wealth: 1, health: 14, family: 22, record: 0,  mood: 'bust' } },\n  { name: 'bust-rich',  spec: { age: 58, wealth: 4, health: 72, family: 74, record: 8,  mood: 'up'   } },\n  { name: 'bust-old',   spec: { age: 85, wealth: 2, health: 38, family: 66, record: 28, mood: 'down' } },\n  { name: 'bust-sick',  spec: { age: 72, wealth: 2, health: 12, family: 30, record: 0,  mood: 'sick' } }\n]\nconst PROPS = [\n  { spec: { age: 85, wealth: 2, health: 40, family: 40, record: 0, mood: 'calm' } },\n  { spec: { age: 50, wealth: 4, health: 80, family: 40, record: 0, mood: 'calm' } },\n  { spec: { age: 40, wealth: 3, health: 80, family: 40, record: 0, mood: 'up' } },\n  { spec: { age: 25, wealth: 0, health: 90, family: 20, record: 0, mood: 'calm' } },\n  { spec: { age: 45, wealth: 1, health: 70, family: 80, record: 0, mood: 'calm' } }\n]\nasync function save(name, dataUrl) {\n  const r = await fetch('/save?name=' + name, { method: 'POST', body: dataUrl })\n  return r.ok\n}\nfunction fresh(cv, w, h) {\n  cv.width = w\n  cv.height = h\n  const ctx = cv.getContext('2d')\n  ctx.fillStyle = '#0a0f16'\n  ctx.fillRect(0, 0, w, h)\n  return ctx\n}\n/** 先按逻辑尺寸画小图，再整数倍放大展示（放大用宿主 canvas 的 drawImage，不是精灵内核） */\nfunction zoom(spec, lw, lh, times, fn) {\n  const small = document.createElement('canvas')\n  fresh(small, lw, lh)\n  fn(small.getContext('2d'), spec, lw, lh)\n  const big = document.createElement('canvas')\n  const ctx = fresh(big, lw * times, lh * times)\n  ctx.imageSmoothingEnabled = false\n  ctx.drawImage(small, 0, 0, lw * times, lh * times)\n  return big\n}\nasync function main() {\n  const g = document.getElementById('gallery')\n  // 全身（顶栏用）\n  for (const s of FULL) {\n    const cv = document.createElement('canvas')\n    const ctx = fresh(cv, 360, 460)\n    Portrait.drawPortrait(ctx, s.spec, 0, 0, 360, 460, { colors: D })\n    g.appendChild(cv)\n    await save(s.name, cv.toDataURL('image/png'))\n  }\n  // 48px 轮廓档并排\n  const cell = Math.round(48 * 0.8)\n  const strip = fresh(document.createElement('canvas'), cell * 4 * 4, 48 * 4)\n  const stripCv = strip.canvas\n  for (let i = 0; i < FULL.length; i++) {\n    const small = document.createElement('canvas')\n    const sc = fresh(small, cell, 48)\n    Portrait.drawPortrait(sc, FULL[i].spec, 0, 0, cell, 48, { colors: D })\n    strip.drawImage(small, i * cell * 4, 0, cell * 4, 48 * 4)\n  }\n  g.appendChild(stripCv)\n  await save('portrait-48', stripCv.toDataURL('image/png'))\n  // 配件表\n  const sheet = fresh(document.createElement('canvas'), 200 * PROPS.length, 280)\n  for (let i = 0; i < PROPS.length; i++) {\n    const one = document.createElement('canvas')\n    const oc = fresh(one, 200, 280)\n    Portrait.drawPortrait(oc, PROPS[i].spec, 0, 0, 200, 280, { colors: D })\n    sheet.drawImage(one, i * 200, 0)\n  }\n  g.appendChild(sheet.canvas)\n  await save('portrait-props', sheet.canvas.toDataURL('image/png'))\n  // 胸像 ×5，放大 4 倍\n  for (const b of BUSTS) {\n    const big = zoom(b.spec, 32 * 10, 40 * 10, 1.2, (ctx, spec, lw2, lh2) => Portrait.drawBust(ctx, spec, 0, 0, lw2, lh2, { colors: D }))\n    g.appendChild(big)\n    await save('portrait-' + b.name, big.toDataURL('image/png'))\n  }\n  // 胸像 32px 并排，放大 6 倍\n  const bh = 32\n  const bwid = 26\n  const row = document.createElement('canvas')\n  const rctx = fresh(row, bwid * BUSTS.length * 6, bh * 6)\n  rctx.imageSmoothingEnabled = false\n  for (let i = 0; i < BUSTS.length; i++) {\n    const small = document.createElement('canvas')\n    const sc = fresh(small, bwid, bh)\n    Portrait.drawBust(sc, BUSTS[i].spec, 0, 0, bwid, bh, { colors: D })\n    rctx.drawImage(small, i * bwid * 6, 0, bwid * 6, bh * 6)\n  }\n  g.appendChild(row)\n  await save('portrait-bust-32', row.toDataURL('image/png'))\n  document.title = 'OK:' + BUSTS.length\n}\nmain()\n"


const page = PAGE_HEAD + js + '</scr' + 'ipt><script>' + PAGE_BODY + '</scr' + 'ipt>' + PAGE_TAIL

const srv = http.createServer(function (req, res) {
  const u = new URL(req.url || '/', 'http://127.0.0.1')
  if (req.method === 'POST' && u.pathname === '/save') {
    let body = ''
    req.on('data', function (c) { body += c })
    req.on('end', function () {
      const m = /^data:image\/png;base64,(.*)$/.exec(body)
      if (!m) { res.statusCode = 400; res.end('bad'); return }
      fs.writeFileSync(path.join(outDir, (u.searchParams.get('name') || 'shot') + '.png'), Buffer.from(m[1], 'base64'))
      res.end('ok')
    })
    return
  }
  res.setHeader('Content-Type', 'text/html;charset=utf-8')
  res.end(page)
})
srv.listen(Number(process.argv[2] || 5210), '127.0.0.1', function () { console.log('portrait shots on ' + (process.argv[2] || 5210)) })
