#!/usr/bin/env node
/**
 * H5 结局卡截图（开发工具）：证明「线上那侧」的报纸也修好了 —— 不是只有小游戏。
 * 做法（与 docs/shots/_c1-shots.mjs 同一套）：把 core 打进一个 /seedend 页，在同源里写一份走完的存档，
 * 再打开真产物 dist/build/h5，点「继续上一局」进结局屏，把静物那块滚到屏幕中间截图；
 * 顺手读一次那张 canvas 的像素，报「不透明像素数 + 前几个颜色」，白屏/空白一眼能看出来。
 *
 * 前置：npm run build:h5（产物在 dist/build/h5）
 * 用法：node docs/shots/_v3-h5-shots.mjs
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { build } from 'esbuild'

const root = path.resolve('.')
const shots = path.join(root, 'docs', 'shots')
const dist = path.join(root, 'dist', 'build', 'h5')
const OUT = path.join(shots, 'v3-end-h5.png')
const PORT = Number(process.env.SHOT_PORT || 5281)
const CDP_PORT = Number(process.env.SHOT_CDP || 9381)
const VIEW_W = 390
const VIEW_H = 844
const DSF = 2

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('✗ 没有 dist/build/h5：先 npm run build:h5')
  process.exit(2)
}

const TYPES = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }

const bundle = await build({
  stdin: { contents: "export * from './src/core'", resolveDir: root, loader: 'ts' },
  bundle: true, format: 'iife', globalName: 'C', target: 'es2020', write: false,
})
const coreJs = bundle.outputFiles[0].text

/** 造一局走完 36 年 + 晚年、停在结局的存档（同 _c1-shots.mjs 的 seedEndPage）。 */
const seedEnd = '<!doctype html><html><head><meta charset="utf-8"><title>seed</title></head><body><script>' +
  coreJs + '</scr' + 'ipt><script>' + [
  'const seed = 31337',
  'const rng = C.createRng(seed)',
  'let g = C.createGame(0, "real", seed, rng).state',
  'let guard = 0',
  'while (g.phase === "trade" && guard++ < 3000) {',
  '  if (g.pending) {',
  '    if (g.pending.type === "year") g = C.chooseYear(g, 0, rng).state',
  '    else if (g.pending.type === "event") g = C.chooseEvent(g, 0, rng).state',
  '    else break',
  '  } else { g = C.step(g, rng).state }',
  '}',
  'let lg = 0',
  'while (g.phase === "late" && lg++ < 100) {',
  '  g = C.lateStep(g, rng).state',
  '  if (g.phase === "end") break',
  '  g = C.chooseLate(g, 0, rng).state',
  '}',
  '// 这张图的重点是一件静物：把终值压到本金的 0.4 倍，结局就会选中 paper（揉皱的报纸）',
  'g.s.asset = Math.round(g.s.start * 0.4)',
  'localStorage.setItem(C.SAVE_KEY, C.serialize(g, Date.now()))',
  'document.title = "SEED_OK:" + g.phase + ":" + Math.round(g.s.asset)',
].join('\n') + '</scr' + 'ipt></body></html>'

const server = http.createServer(function (req, res) {
  const clean = decodeURIComponent((req.url || '/').split('?')[0])
  if (clean === '/seedend') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(seedEnd); return }
  const file = path.join(dist, clean === '/' ? 'index.html' : clean)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end('not found'); return }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
})
await new Promise(function (r) { server.listen(PORT, '127.0.0.1', r) })

function finish(code) {
  try { ws.close() } catch (e) { /* 已关 */ }
  try { chrome.kill() } catch (e) { /* 已退 */ }
  server.close()
  process.exit(code)
}

const chromePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find(function (p) { return fs.existsSync(p) })
if (!chromePath) { console.error('✗ 找不到 Chrome（可用 CHROME_PATH 指定）'); server.close(); process.exit(2) }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'agu-v3-h5-'))
const chrome = spawn(chromePath, [
  '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  '--window-size=' + VIEW_W + ',' + VIEW_H, 'about:blank',
], { stdio: 'ignore' })

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

async function targetWs() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json()
      const page = list.find(function (t) { return t.type === 'page' })
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch (e) { /* 还没起来 */ }
    await sleep(200)
  }
  throw new Error('no cdp target')
}

const wsUrl = await targetWs()
const ws = new WebSocket(wsUrl)
await new Promise(function (r, j) { ws.addEventListener('open', r); ws.addEventListener('error', j) })
let seq = 0
const waiting = new Map()
ws.addEventListener('message', function (ev) {
  const m = JSON.parse(String(ev.data))
  if (m.id && waiting.has(m.id)) { const fn = waiting.get(m.id); waiting.delete(m.id); fn(m) }
})
function cmd(method, params) {
  const id = ++seq
  ws.send(JSON.stringify({ id: id, method: method, params: params || {} }))
  return new Promise(function (res, rej) {
    waiting.set(id, function (m) { if (m.error) rej(new Error(method + ': ' + m.error.message)); else res(m.result) })
  })
}
async function evaluate(expression) {
  const r = await cmd('Runtime.evaluate', { expression: expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) {
    const d = r.exceptionDetails.exception
    throw new Error('eval: ' + (r.exceptionDetails.text || '') + ' ' + ((d && d.description) || ''))
  }
  return r.result ? r.result.value : undefined
}
async function waitFor(expression, ms) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await evaluate(expression)) return true
    await sleep(120)
  }
  return false
}

await cmd('Page.enable')
await cmd('Runtime.enable')
await cmd('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: VIEW_H, deviceScaleFactor: DSF, mobile: true })

/* 1. 同源写一份走完的存档 */
await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/seedend' })
const seeded = await waitFor('String(document.title).indexOf("SEED_OK:end") === 0', 30000)
console.log('seed end: ' + seeded + ' · ' + (await evaluate('document.title')))

/* 2. 打开真产物 → 续玩 → 结局屏 */
await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' })
await evaluate('try{localStorage.removeItem("agu_fast")}catch(e){}')
const resume = await waitFor('!!document.querySelector("#resume")', 30000)
await evaluate('(function(){var e=document.querySelector("#resume");if(e)e.click()})()')
const endCard = await waitFor('!!document.querySelector("#challenge-card")', 30000)
console.log('resume sheet: ' + resume + ' · end card: ' + endCard)

/* 3. 读静物那张 canvas 的像素：白屏 / 空白在这里会露 */
const px = await evaluate('(function(){' +
  'try{' +
  'var host=document.querySelector(".ag-end-still-cv");if(!host)return "no-canvas";' +
  'var e=host.tagName==="CANVAS"?host:host.querySelector("canvas");if(!e)return JSON.stringify({note:"host is " + host.tagName + ", 没有内层 canvas", cls: host.className});' +
  'var w=e.width|0,h=e.height|0;' +
  'if(!w||!h)return JSON.stringify({w:w,h:h,note:"canvas is empty"});' +
  'var c=e.getContext("2d");if(!c)return "no-ctx";' +
  'var d=c.getImageData(0,0,w,h).data;' +
  'var n=0,byColor={};' +
  'for(var i=0;i<d.length;i+=4){if(d[i+3]>0){n++;var k=d[i]+","+d[i+1]+","+d[i+2];byColor[k]=(byColor[k]||0)+1}}' +
  'var top=Object.keys(byColor).sort(function(a,b){return byColor[b]-byColor[a]}).slice(0,4).map(function(k){return k+"×"+byColor[k]});' +
  'var r=host.getBoundingClientRect();' +
  'return JSON.stringify({w:w,h:h,opaque:n,top:top,css:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]})' +
  '}catch(err){return JSON.stringify({error:String(err&&err.message||err)})}})()')
console.log('still canvas: ' + px)

/* 4. 把它滚到屏幕上方，整页截一张（证明这是结局卡本身，不是孤立的小图） */
await evaluate('(function(){var e=document.querySelector(".ag-end-still-cv");if(e){var r=e.getBoundingClientRect();window.scrollBy(0, r.top + r.height/2 - window.innerHeight*0.42)}})()')
await sleep(900)
const shot = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
console.log('✓ docs/shots/v3-end-h5.png (' + fs.statSync(OUT).size + ' bytes)')

/* 5. 静物那一格再单独放一张大图（6 倍），用来判「线上那侧认不认得出是报纸」 */
const rect = await evaluate('(function(){var e=document.querySelector(".ag-end-still-cv");if(!e)return null;var r=e.getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()')
if (rect && rect[2] > 8) {
  const zoom = await cmd('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: rect[0] - 6, y: rect[1] - 6 + (await evaluate('window.scrollY')), width: rect[2] + 12, height: rect[3] + 12, scale: 6 },
  })
  fs.writeFileSync(path.join(shots, '_v3-h5-still-zoom.png'), Buffer.from(zoom.data, 'base64'))
  console.log('✓ docs/shots/_v3-h5-still-zoom.png（静物 6×，' + Math.round(rect[2]) + '×' + Math.round(rect[3]) + ' CSS）')
} else {
  console.log('! 静物那格的 rect 太小，跳过放大图：' + JSON.stringify(rect))
}

finish(0)
