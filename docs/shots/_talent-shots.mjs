// C2 天赋截图（开发工具，不进 src）：
//   talent-picker.png  开局三选一：已解锁 / 锁住（含点数不够的两种状态）
//   talent-end.png     结局页：挑战码卡上的「带天赋：XX」+ 记忆点
// 用法：node docs/shots/_talent-shots.mjs（先 npm run build:h5）
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
const PORT = Number(process.env.SHOT_PORT || 5242)
const CDP_PORT = Number(process.env.SHOT_CDP || 9342)

const bundle = await build({
  stdin: { contents: "export * from './src/core'\nexport * from './src/core/meta'", resolveDir: root, loader: 'ts' },
  bundle: true, format: 'iife', globalName: 'C', target: 'es2020', write: false,
})
const coreJs = bundle.outputFiles[0].text

/** 只写 meta：记忆点 4、已解锁「第一桶金」（5 点，正好差一点，露出「还差 N 点」这一态）。 */
const seedMetaPage = '<!doctype html><html><head><meta charset="utf-8"><title>meta</title></head><body><script>' +
  coreJs + '</scr' + 'ipt><script>' + [
  'try { localStorage.removeItem("agu_life_save_v1") } catch (e) {}',
  'localStorage.setItem("agu_meta_v1", JSON.stringify({ v: 1, points: 4, unlocked: ["cash"], lastSettled: null, currentTalent: null }))',
  'document.title = "META_OK"',
].join('\n') + '</scr' + 'ipt></body></html>'

/** 走完一局到结局页，并把 meta 摆成「这一局带了第一桶金」。 */
const seedEndPage = '<!doctype html><html><head><meta charset="utf-8"><title>seed</title></head><body><script>' +
  coreJs + '</scr' + 'ipt><script>' + [
  'const seed = 31337',
  'const rng = C.createRng(seed)',
  'let g = C.createGame(0, "real", seed, rng, "cash").state',
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
  'localStorage.setItem(C.SAVE_KEY, C.serialize(g, Date.now()))',
  'localStorage.setItem("agu_meta_v1", JSON.stringify({ v: 1, points: 2, unlocked: ["cash", "sense", "net", "rep", "fam", "fa"], lastSettled: null, currentTalent: "cash" }))',
  'document.title = "SEED_OK:" + g.phase + ":" + Math.round(g.s.asset)',
].join('\n') + '</scr' + 'ipt></body></html>'

const server = http.createServer(function (req, res) {
  const clean = decodeURIComponent((req.url || '/').split('?')[0])
  if (clean === '/seedmeta') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(seedMetaPage); return }
  if (clean === '/seedend') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(seedEndPage); return }
  const file = path.join(dist, clean === '/' ? 'index.html' : clean)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end('not found'); return }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
})
await new Promise(function (r) { server.listen(PORT, '127.0.0.1', r) })

const chromePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find(function (p) { return fs.existsSync(p) })
if (!chromePath) { console.log('no chrome'); server.close(); process.exit(2) }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'agu-c2-'))
const VIEW_W = Number(process.env.SHOT_W || 390)
const VIEW_H = Number(process.env.SHOT_H || 844)
const DSF = Number(process.env.SHOT_DSF || 2)
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

const ws = new WebSocket(await targetWs())
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
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.text || ''))
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
async function click(sel) {
  return !!await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');if(!e)return false;e.click();return true})()')
}
async function shoot(name) {
  const out = path.join(shots, name)
  const h = await evaluate('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)')
  const shot = await cmd('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: VIEW_W, height: Math.min(Math.round(h), 2600), scale: 1 },
  })
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log('wrote ' + out + ' (' + fs.statSync(out).size + ' bytes)')
}
function finish(code) {
  try { ws.close() } catch (e) { /* 已关 */ }
  try { chrome.kill() } catch (e) { /* 已退 */ }
  server.close()
  process.exit(code)
}

await cmd('Page.enable')
await cmd('Runtime.enable')
await cmd('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: VIEW_H, deviceScaleFactor: DSF, mobile: true })

/* --- 1. 开局三选一 --- */
await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/seedmeta' })
console.log('meta seeded: ' + await waitFor('String(document.title) === "META_OK"', 20000))
await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' })
console.log('org picker: ' + await waitFor('!!document.querySelector("#org-0")', 25000))
await click('#org-0')
const picker = await waitFor('!!document.querySelector("#talent-cash")', 15000)
console.log('talent picker: ' + picker)
await sleep(600)
const pickerText = await evaluate('(function(){var e=document.querySelector("#talent-cash");var s=e?e.parentNode:document.body;return String(s.innerText||"").replace(/\\s+/g," ").slice(0,300)})()')
console.log('picker text: ' + JSON.stringify(pickerText))
const locked = await evaluate('(function(){var t=document.body.innerText;return JSON.stringify({owned:t.indexOf("已解锁")>=0, lock:t.indexOf("锁 · 5 点")>=0, short:t.indexOf("还差 1 点")>=0, price:t.indexOf("价 5 点")>=0})})()')
console.log('picker states: ' + locked)
await shoot('talent-picker.png')

/* --- 1b. 真的带着走一局：选天赋 → 选模式 → 开局，本金与标注都要对得上 --- */
await click('#talent-pick-cash')
const modeReady = await waitFor('!!document.querySelector("#mode-real")', 15000)
await click('#mode-real')
const chip = await waitFor('!!document.querySelector("#challenge-chip-talent")', 25000)
await sleep(900)
const started = await evaluate('(function(){var t=document.body.innerText;var m=/([0-9,]+)/.exec(t);' +
  'var chip=document.querySelector("#challenge-chip-talent");' +
  'var save=null;try{save=JSON.parse(localStorage.getItem("agu_life_save_v1")||"null")}catch(e){}' +
  'return JSON.stringify({chip:chip?String(chip.innerText).replace(/\\s+/g,""):null,' +
  'asset:save&&save.s?Math.round(save.s.asset):null,start:save&&save.s?Math.round(save.s.start):null,' +
  'meta:JSON.parse(localStorage.getItem("agu_meta_v1")||"null")})})()')
console.log('carried into game: mode=' + modeReady + ' chip=' + chip + ' ' + started)

/* --- 2. 结局页：带天赋：第一桶金 --- */
await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/seedend' })
console.log('end seeded: ' + await waitFor('String(document.title).indexOf("SEED_OK:end") === 0', 25000) + ' ' + await evaluate('document.title'))
await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' })
console.log('resume sheet: ' + await waitFor('!!document.querySelector("#resume")', 25000))
await click('#resume')
const endCard = await waitFor('!!document.querySelector("#challenge-card")', 25000)
await sleep(2400)
const ccText = await evaluate('(function(){var e=document.querySelector("#challenge-card");return e?String(e.innerText||"").replace(/\\s+/g," "):""})()')
const pointText = await evaluate('(function(){var e=document.querySelector("#end-points");return e?String(e.innerText||"").replace(/\\s+/g," "):""})()')
console.log('end card: ' + endCard + ' text=' + JSON.stringify(ccText))
console.log('end points: ' + JSON.stringify(pointText))
await cmd('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: 1500, deviceScaleFactor: DSF, mobile: true })
await evaluate('(function(){var e=document.querySelector("#challenge-card");if(e)window.scrollTo(0,Math.max(0,e.getBoundingClientRect().top+window.scrollY-140))})()')
await sleep(700)
await shoot('talent-end.png')
await cmd('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: VIEW_H, deviceScaleFactor: DSF, mobile: true })
finish(0)
