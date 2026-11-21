#!/usr/bin/env node
/**
 * 五件静物对照表（开发工具）：两排都调**同一个函数**（ui/share/portrait.ts 的 drawStillLife），
 * 只有「底」不同 —— 上排复刻小游戏结局屏（先铺 bg2 画框再画，和 views/over.ts 一样），
 * 下排复刻 H5 结局卡（透明画布上画，合成时下面垫卡片底色，和 EndCard.vue 一样）。
 * 每格按真画尺寸 96×96 画，再整数 4 倍放大（关插值）。
 * 页面还会对同一函数的两次调用做逐条 fillRect 比对：一致才算「两端同一份几何」。
 * 用法：node docs/shots/_v3-stilllife.mjs [端口] → 浏览器打开 → docs/shots/v3-stilllife.png
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

const root = path.resolve('.')
const shots = path.join(root, 'docs', 'shots')

const bundle = await build({
  stdin: { contents: "export { drawStillLife } from './src/ui/share/portrait'", resolveDir: root, loader: 'ts' },
  bundle: true,
  format: 'iife',
  globalName: 'S',
  target: 'es2020',
  write: false,
})
const js = bundle.outputFiles[0].text

const BODY = [
  'const KINDS = ["glass", "case", "paper", "cane", "pill"]',
  'const SIZE = 96, ZOOM = 4, GAP = 20, MARGIN = 24, LABEL = 26, HEAD = 30',
  'const GAME_BG = "#0f1620", CARD_BG = "#0a0f16", SHEET_BG = "#06090d", BORDER = "rgba(255,255,255,0.11)"',
  'const CELL = SIZE * ZOOM',
  'const W = MARGIN * 2 + CELL * KINDS.length + GAP * (KINDS.length - 1)',
  'const ROW_H = HEAD + CELL + LABEL',
  'const H = MARGIN * 2 + ROW_H * 2',
  '',
  '/** 记录 fillRect 指令的假 ctx（用来逐条比对同一函数的两次调用）。 */',
  'function recorder() {',
  '  const log = []',
  '  // blit 会 save/restore 并在里面改 globalAlpha —— 桩也得有这两个方法，否则玻璃/公文包那四件会抛',
  '  return { log: log, fillStyle: "", globalAlpha: 1, save: function () {}, restore: function () {}, fillRect: function (x, y, w, h) { log.push([String(this.fillStyle), x, y, w, h]) } }',
  '}',
  '',
  '/** 一格：mode=game 先铺画框（同 views/over.ts），mode=h5 保持透明（同 EndCard.vue 的 clearRect）。 */',
  'function cellOf(k, mode) {',
  '  const cv = document.createElement("canvas")',
  '  cv.width = SIZE; cv.height = SIZE',
  '  const c = cv.getContext("2d")',
  '  if (mode === "game") {',
  '    c.fillStyle = GAME_BG; c.fillRect(0, 0, SIZE, SIZE)',
  '    c.fillStyle = BORDER',
  '    c.fillRect(0, 0, SIZE, 1); c.fillRect(0, SIZE - 1, SIZE, 1)',
  '    c.fillRect(0, 0, 1, SIZE); c.fillRect(SIZE - 1, 0, 1, SIZE)',
  '  } else {',
  '    c.clearRect(0, 0, SIZE, SIZE)',
  '  }',
  '  S.drawStillLife(c, k, 0, 0, SIZE, SIZE)',
  '  return cv',
  '}',
  '',
  'function main() {',
  '  const same = []',
  '  for (const k of KINDS) {',
  '    const a = recorder(); const b = recorder()',
  '    S.drawStillLife(a, k, 0, 0, SIZE, SIZE)',
  '    S.drawStillLife(b, k, 0, 0, SIZE, SIZE)',
  '    same.push(k + ":" + (JSON.stringify(a.log) === JSON.stringify(b.log)) + "/" + a.log.length)',
  '  }',
  '',
  '  const out = document.createElement("canvas")',
  '  out.width = W; out.height = H',
  '  const g = out.getContext("2d")',
  '  g.fillStyle = SHEET_BG; g.fillRect(0, 0, W, H)',
  '  const rows = [',
  '    { title: "小游戏结局屏那条路径 · 先铺 bg2 画框再 drawStillLife（每格 96→4×）", mode: "game", base: GAME_BG },',
  '    { title: "H5 结局卡那条路径 · 透明画布 + drawStillLife，垫卡片底色（每格 96→4×）", mode: "h5", base: CARD_BG },',
  '  ]',
  '  for (let r = 0; r < rows.length; r++) {',
  '    const y0 = MARGIN + r * ROW_H',
  '    g.fillStyle = "#9fadbe"',
  '    g.font = "600 13px \'PingFang SC\', \'Microsoft YaHei\', sans-serif"',
  '    g.fillText(rows[r].title, MARGIN, y0 + 14)',
  '    for (let i = 0; i < KINDS.length; i++) {',
  '      const x = MARGIN + i * (CELL + GAP)',
  '      const y = y0 + HEAD',
  '      if (rows[r].mode === "h5") { g.fillStyle = rows[r].base; g.fillRect(x, y, CELL, CELL) }',
  '      const small = cellOf(KINDS[i], rows[r].mode)',
  '      g.imageSmoothingEnabled = false',
  '      g.drawImage(small, x, y, CELL, CELL)',
  '      g.fillStyle = "#6b798b"',
  '      g.font = "12px ui-monospace, Consolas, monospace"',
  '      g.fillText(KINDS[i], x, y + CELL + 17)',
  '    }',
  '  }',
  '  fetch("/save", { method: "POST", body: out.toDataURL("image/png") }).then(function () {',
  '    document.body.appendChild(out)',
  '    document.title = "DONE:" + W + "x" + H + "|" + same.join(",")',
  '  })',
  '}',
  'main()',
].join('\n')

const page =
  '<!doctype html><html><head><meta charset="utf-8"><title>v3-stilllife</title>' +
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
      const m = /^data:image\/png;base64,(.*)$/.exec(body)
      if (!m) {
        res.statusCode = 400
        res.end('bad')
        return
      }
      fs.writeFileSync(path.join(shots, 'v3-stilllife.png'), Buffer.from(m[1], 'base64'))
      console.log('✓ docs/shots/v3-stilllife.png')
      res.end('ok')
    })
    return
  }
  res.setHeader('Content-Type', 'text/html;charset=utf-8')
  res.end(page)
})
const port = Number(process.argv[2] || 5270)
srv.listen(port, '127.0.0.1', function () {
  console.log('stilllife on http://127.0.0.1:' + port)
})
