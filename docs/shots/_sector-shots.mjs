// 板块走势截图（开发工具，不进 src）：seed 存档 -> 打开 H5 交易页 -> 点「继续上一局」-> 截 PNG。
// 用法：node docs/shots/_sector-shots.mjs [qi=4] [name=sector-series]
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { build } from 'esbuild'

const root = path.resolve('.')
const shots = path.join(root, 'docs/shots')
const dist = path.join(root, 'dist/build/h5')
const TYPES = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }

const qi = Number(process.argv[2] || 4)
const name = process.argv[3] || 'sector-series'
const PORT = Number(process.env.SHOT_PORT || 5231)
const CDP_PORT = Number(process.env.SHOT_CDP || 9331)

const bundle = await build({
  stdin: { contents: "export * from './src/core'", resolveDir: root, loader: 'ts' },
  bundle: true, format: 'iife', globalName: 'C', target: 'es2020', write: false,
})
const coreJs = bundle.outputFiles[0].text

const seedPage =
  '<!doctype html><html><head><meta charset="utf-8"><title>seed</title></head><body><script>' +
  coreJs +
  '</scr' + 'ipt><script>' +
  'const qi = Number((location.hash || "").replace("#", "") || ' + qi + ')\n' +
  'const seed = 19911219\n' +
  'const rng = C.createRng(seed)\n' +
  'let g = C.createGame(0, "real", seed, rng).state\n' +
  'let guard = 0\n' +
  'while (guard++ < 600 && g.phase === "trade" && (g.s.qi < qi || g.pending)) {\n' +
  '  if (g.pending) {\n' +
  '    if (g.pending.type === "event") g = C.chooseEvent(g, 0, rng).state\n' +
  '    else if (g.pending.type === "year") g = C.chooseYear(g, 0, rng).state\n' +
  '    else break\n' +
  '  } else { g = C.step(g, rng).state }\n' +
  '}\n' +
  'localStorage.setItem(C.SAVE_KEY, C.serialize(g, Date.now()))\n' +
  'document.title = "SEED_OK:" + g.s.qi + ":" + g.phase\n' +
  '</scr' + 'ipt></body></html>'

const server = http.createServer(function (req, res) {
  const clean = decodeURIComponent((req.url || '/').split('?')[0])
  if (clean === '/seed') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(seedPage); return }
  const file = path.join(dist, clean === '/' ? 'index.html' : clean)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const idx = path.join(dist, 'index.html')
    if (clean !== '/' ) { res.statusCode = 404; res.end('not found'); return }
    res.setHeader('Content-Type', TYPES['.html']); fs.createReadStream(idx).pipe(res); return
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
})
await new Promise(function (r) { server.listen(PORT, '127.0.0.1', r) })

const chromePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find(function (p) { return fs.existsSync(p) })
if (!chromePath) { console.log('no chrome'); process.exit(2) }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'agu-shot-'))
const VIEW_H = Number(process.env.SHOT_H || 1200)
const VIEW_W = Number(process.env.SHOT_W || 390)
const DSF = Number(process.env.SHOT_DSF || 2)
const chrome = spawn(chromePath, [
  '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  '--window-size=' + VIEW_W + ',' + VIEW_H, 'about:blank',
], { stdio: 'ignore' })

async function targetWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json()
      const page = list.find(function (t) { return t.type === 'page' })
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch (e) { /* 还没起来 */ }
    await sleep(200)
  }
  throw new Error('no cdp target')
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

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
  return r.result ? r.result.value : undefined
}
async function waitFor(expression, ms) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await evaluate(expression)) return true
    await sleep(150)
  }
  return false
}

await cmd('Page.enable')
await cmd('Runtime.enable')
await cmd('Page.addScriptToEvaluateOnNewDocument', { source: [
  'window.__DBG = {};',
  '(function(){',
  '  var orig = HTMLCanvasElement.prototype.getContext;',
  '  HTMLCanvasElement.prototype.getContext = function(){',
  '    var k = this.__k || (this.__k = "c" + Math.random().toString(36).slice(2,7));',
  '    window.__DBG["ctx:" + k] = (window.__DBG["ctx:" + k] || 0) + 1;',
  '    return orig.apply(this, arguments);',
  '  };',
  '  ["clearRect","fill","stroke"].forEach(function(m){',
  '    var o = CanvasRenderingContext2D.prototype[m];',
  '    CanvasRenderingContext2D.prototype[m] = function(){',
  '      var k = this.canvas.__k || (this.canvas.__k = "c" + Math.random().toString(36).slice(2,7));',
  '      this.canvas.__paint = (this.canvas.__paint || 0) + 1;',
  '      window.__DBG[m + ":" + k] = (window.__DBG[m + ":" + k] || 0) + 1;',
  '      return o.apply(this, arguments);',
  '    };',
  '  });',
  '})();',
].join('') })
await cmd('Emulation.setDeviceMetricsOverride', {
  width: VIEW_W,
  height: VIEW_H,
  deviceScaleFactor: DSF,
  mobile: process.env.SHOT_MOBILE !== '0',
})

if (process.env.SHOT_PATH === 'chartlab') {
  await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/#/pages/chart-lab/chart-lab' })
  const labOk = await waitFor('document.querySelectorAll(".lab .card").length >= 4', 25000)
  await sleep(1800)
  const docH = await evaluate('document.documentElement.scrollHeight')
  console.log('lab cards: ' + labOk + ' docH: ' + docH)
  const full = process.env.SHOT_FULL === '0'
    ? await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    : await cmd('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: VIEW_W, height: docH, scale: 1 },
    })
  const outLab = path.join(shots, name + '.png')
  fs.writeFileSync(outLab, Buffer.from(full.data, 'base64'))
  console.log('wrote ' + outLab + ' (' + fs.statSync(outLab).size + ' bytes)')
  ws.close(); chrome.kill(); server.close(); process.exit(0)
}

await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/seed#' + qi })
const seeded = await waitFor('String(document.title).indexOf("SEED_OK") === 0', 20000)
const seedTitle = await evaluate('document.title')
console.log('seed: ' + seeded + ' ' + seedTitle)

await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' })
const resumeReady = await waitFor('!!document.querySelector("#resume")', 25000)
console.log('resume sheet: ' + resumeReady)
await evaluate('document.querySelector("#resume").click()')
const cardsReady = await waitFor('!!document.querySelector("#sector-0")', 20000)
await sleep(1200)
const legend = await evaluate('(function(){var n=document.querySelectorAll(".ag-sector-lg-t");var v=document.querySelectorAll(".ag-sector-lg-v");var out=[];for(var i=0;i<n.length;i++)out.push(n[i].innerText+" "+(v[i]?v[i].innerText:""));return out.join(" | ")})()')
const canvases = await evaluate('document.querySelectorAll(".ag-sector-spark canvas").length')
console.log('cards: ' + cardsReady + ' canvases: ' + canvases)
console.log('legend: ' + legend)
  console.log('SIZES ' + await evaluate('(function(){var p=document.querySelector(".ag-sector");var panel=document.querySelector(".ag-sectors").parentElement;var r=p.getBoundingClientRect();var pr=panel.getBoundingClientRect();return JSON.stringify({card:[Math.round(r.width),Math.round(r.height)],panel:Math.round(pr.height)})})()'))
if (process.env.SHOT_DIAG) {
  if (process.env.SHOT_DIAG === '7') {
    await evaluate('window.scrollTo(0, document.documentElement.scrollHeight)')
    await sleep(600)
    const doc = await evaluate('(function(){var o={};[".ag-sectors",".ag-dock",".ag-shell"].forEach(function(s){var e=document.querySelector(s);o[s]=e?[Math.round(e.getBoundingClientRect().top+window.scrollY),Math.round(e.getBoundingClientRect().height)]:null});o.docH=document.documentElement.scrollHeight;o.scrollY=Math.round(window.scrollY);return JSON.stringify(o)})()')
    console.log('DOC ' + doc)
    const s2 = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const tmp = path.join(os.tmpdir(), 'agu-bottom.png')
    fs.writeFileSync(tmp, Buffer.from(s2.data, 'base64'))
    console.log('BOTTOM ' + tmp)
    ws.close(); chrome.kill(); server.close(); process.exit(0)
  }
  if (process.env.SHOT_DIAG === '6') {
    await evaluate('window.scrollTo(0, document.documentElement.scrollHeight)')
    await sleep(500)
    const geo = await evaluate('(function(){var d=document.querySelector(".ag-dock");var s=document.querySelector(".ag-dock-sub");var sh=document.querySelector(".ag-shell");var r=d?d.getBoundingClientRect():null;var rs=s?s.getBoundingClientRect():null;var cs=sh?getComputedStyle(sh):null;var sk=[".ag-dock-in"];var inn=document.querySelector(".ag-dock-in");var ri=inn?inn.getBoundingClientRect():null;return JSON.stringify({vh:window.innerHeight,vw:window.innerWidth,dock:r?[Math.round(r.top),Math.round(r.bottom),Math.round(r.height)]:null,btn:ri?[Math.round(ri.top),Math.round(ri.bottom),Math.round(ri.height)]:null,sub:rs?[Math.round(rs.top),Math.round(rs.bottom),Math.round(rs.height)]:null,shellPadB:cs?cs.paddingBottom:null,docH:document.documentElement.scrollHeight,scrollY:Math.round(window.scrollY),dockPad:d?[getComputedStyle(d).paddingTop,getComputedStyle(d).paddingBottom]:null})})()')
    console.log('GEO ' + geo)
    ws.close(); chrome.kill(); server.close(); process.exit(0)
  }
  if (process.env.SHOT_DIAG === '5') {
    const before = await evaluate('(function(){var c=document.querySelector(".ag-sector");var panel=document.querySelector(".ag-sectors").parentElement;var a=[Math.round(c.getBoundingClientRect().height),Math.round(panel.getBoundingClientRect().height)];document.querySelectorAll(".ag-sector-spark,.ag-sector-lg").forEach(function(e){e.style.display="none"});return JSON.stringify({after:a, before:[Math.round(c.getBoundingClientRect().height),Math.round(panel.getBoundingClientRect().height)]})})()')
    console.log('HEIGHTS ' + before)
    ws.close(); chrome.kill(); server.close(); process.exit(0)
  }
  if (process.env.SHOT_DIAG === '3') {
    await evaluate('document.querySelector("#sector-1").click()')
    await sleep(900)
    const ink2 = await evaluate('(function(){var a=[];document.querySelectorAll(".ag-sector-spark canvas").forEach(function(c){var n=-1;try{var d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;n=0;for(var i=3;i<d.length;i+=4)if(d[i]>8)n++}catch(e){n=-2}a.push(n)});return a.join(",")})()')
    const dbg2 = await evaluate('(function(){var a=[];document.querySelectorAll(".ag-sector-spark canvas").forEach(function(c){a.push([c.__k||"?", c.__paint||0])});return JSON.stringify(a)})()')
    console.log('AFTER_CLICK ink=' + ink2 + ' dbg=' + dbg2)
    ws.close(); chrome.kill(); server.close(); process.exit(0)
  }
  for (let i = 0; i < 8; i++) {
    const ink = await evaluate('(function(){var a=[];document.querySelectorAll(".ag-sector-spark canvas").forEach(function(c){var n=-1;try{var d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;n=0;for(var i=3;i<d.length;i+=4)if(d[i]>8)n++}catch(e){n=-2}a.push(n)});return a.join(",")})()')
    console.log('INK t=' + (i * 300) + 'ms ' + ink)
    await sleep(300)
  }
  const diag = await evaluate('(function(){var out=[];document.querySelectorAll(".ag-sector-spark canvas").forEach(function(c){var r=c.getBoundingClientRect();var ink=-1;try{var ctx=c.getContext("2d");var d=ctx.getImageData(0,0,c.width,c.height).data;var n=0;for(var i=3;i<d.length;i+=4)if(d[i]>8)n++;ink=n}catch(e){ink=-2}out.push({id:c.id,rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],attr:[c.width,c.height],style:[c.style.width,c.style.height],ink:ink})});var boxes=[];document.querySelectorAll(".ag-sector-spark").forEach(function(e){var r=e.getBoundingClientRect();boxes.push([Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)])});return JSON.stringify({canvases:out,boxes:boxes})})()')
  console.log('DIAG ' + diag)
  const html = await evaluate('document.querySelectorAll(".ag-sector-spark")[0].outerHTML.replace(/></g,">\n<").slice(0,1200)')
  console.log('HTML ' + html)
  const dbg = await evaluate('(function(){var a=[];document.querySelectorAll(".ag-sector-spark canvas").forEach(function(c){a.push([c.__k||"?", c.__paint||0, c.width, c.height])});return JSON.stringify({domCanvases:a, allPaintedKeys:Object.keys(window.__DBG).filter(function(k){return k.indexOf("fill:")===0})})})()')
  console.log('DBG ' + dbg)
  const ids = await evaluate('(function(){var a=[];document.querySelectorAll(".ag-sector-spark canvas").forEach(function(c){a.push([c.isConnected, c.getAttribute("canvas-id"), c.getAttribute("id"), c.parentElement.tagName, c.parentElement.getAttribute("canvas-id"), c.parentElement.className])});return JSON.stringify(a)})()')
  console.log('IDS ' + ids)
  ws.close(); chrome.kill(); server.close(); process.exit(0)
}
if (process.env.SHOT_SCROLL === 'bottom') {
  await evaluate('window.scrollTo(0, document.documentElement.scrollHeight)')
} else {
  await evaluate('(function(){var el=document.getElementById("sector-0");el.scrollIntoView({block:"start"});window.scrollBy(0,-120)})()')
}
await sleep(700)
const shot = process.env.SHOT_FULL === '1'
  ? await cmd('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: VIEW_W,
      height: await evaluate('document.documentElement.scrollHeight'),
      scale: 1,
    },
  })
  : await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
const out = path.join(shots, name + '.png')
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('wrote ' + out + ' (' + fs.statSync(out).size + ' bytes)')

ws.close()
chrome.kill()
server.close()
process.exit(0)
