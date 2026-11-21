// C1 截图（开发工具，不进 src）：
//   event-1997.png     1997 年底人生事件卡（新补齐的 14 条之一）
//   challenge-code.png 开场层的挑战码入口 + 认码结果
// 用法：node docs/shots/_c1-shots.mjs
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
const PORT = Number(process.env.SHOT_PORT || 5241)
const CDP_PORT = Number(process.env.SHOT_CDP || 9341)

const bundle = await build({
  stdin: { contents: "export * from './src/core'\nexport * from './src/core/challenge'", resolveDir: root, loader: 'ts' },
  bundle: true, format: 'iife', globalName: 'C', target: 'es2020', write: false,
})
const coreJs = bundle.outputFiles[0].text

/** 造一局停在某一年年底人生事件上的存档（pending 会被 serialize 一起存）。 */
function seedPageFor(year) {
  return '<!doctype html><html><head><meta charset="utf-8"><title>seed</title></head><body><script>' +
    coreJs + '</scr' + 'ipt><script>' + [
    'const seed = 19911219',
    'const rng = C.createRng(seed)',
    'let g = C.createGame(0, "real", seed, rng).state',
    'let guard = 0',
    'while (guard++ < 3000 && g.phase === "trade") {',
    '  if (g.pending) {',
    '    if (g.pending.type === "year" && g.pending.year === ' + year + ') break',
    '    if (g.pending.type === "event") g = C.chooseEvent(g, 0, rng).state',
    '    else if (g.pending.type === "year") g = C.chooseYear(g, 0, rng).state',
    '    else break',
    '  } else { g = C.step(g, rng).state }',
    '}',
    'localStorage.setItem(C.SAVE_KEY, C.serialize(g, Date.now()))',
    'document.title = "SEED_OK:" + g.s.qi + ":" + (g.pending ? g.pending.type + "/" + g.pending.year : "none")',
  ].join('\n') + '</scr' + 'ipt></body></html>'
}

/** 造一局走完 36 年 + 晚年、停在结局页的存档（用来验结局页上的挑战码）。 */
const seedEndPage = '<!doctype html><html><head><meta charset="utf-8"><title>seed</title></head><body><script>' +
  coreJs + '</scr' + 'ipt><script>' + [
  'const seed = C.clampSeed(31337)',
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
  'localStorage.setItem(C.SAVE_KEY, C.serialize(g, Date.now()))',
  'document.title = "SEED_OK:" + g.phase + ":" + Math.round(g.s.asset)',
].join('\n') + '</scr' + 'ipt></body></html>'

/** 只算一个挑战码：让 Node 不必重复实现编码。 */
const codePage = '<!doctype html><html><head><meta charset="utf-8"><title>code</title></head><body><script>' +
  coreJs + '</scr' + 'ipt><script>' +
  'document.title = "CODE:" + C.encodeChallenge(31337, "real")' +
  '</scr' + 'ipt></body></html>'

const server = http.createServer(function (req, res) {
  const clean = decodeURIComponent((req.url || '/').split('?')[0])
  if (clean === '/seedyear') {
    const y = Number(new URLSearchParams((req.url || '').split('?')[1] || '').get('y') || 2026)
    res.setHeader('Content-Type', 'text/html;charset=utf-8')
    res.end(seedPageFor(y))
    return
  }
  if (clean === '/seedend') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(seedEndPage); return }
  if (clean === '/code') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(codePage); return }
  const file = path.join(dist, clean === '/' ? 'index.html' : clean)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404
    res.end('not found')
    return
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
})
await new Promise(function (r) { server.listen(PORT, '127.0.0.1', r) })

function finish(code) {
  try { ws.close() } catch (e) { /* 已经关了 */ }
  try { chrome.kill() } catch (e) { /* 已经退了 */ }
  server.close()
  process.exit(code)
}

const chromePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find(function (p) { return fs.existsSync(p) })
if (!chromePath) { console.log('no chrome'); server.close(); process.exit(2) }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'agu-c1-'))
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
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.text || '') + ' ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || ''))
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
  const ok = await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');if(!e)return false;e.click();return true})()')
  return !!ok
}
/** 打一段字进 uni 的 input（H5 里是 uni-input 包着原生 input）。 */
async function typeInto(sel, text) {
  const ok = await evaluate('(function(){' +
    'var host=document.querySelector(' + JSON.stringify(sel) + ');if(!host)return false;' +
    'var el=host.matches("input")?host:host.querySelector("input");if(!el)return false;' +
    'el.focus();' +
    'var setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;' +
    'setter.call(el,' + JSON.stringify(text) + ');' +
    'el.dispatchEvent(new Event("input",{bubbles:true}));' +
    'return true})()')
  return !!ok
}
async function shoot(name, full) {
  const out = path.join(shots, name)
  let params = { format: 'png', captureBeyondViewport: false }
  if (full) {
    const h = await evaluate('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)')
    params = { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: VIEW_W, height: Math.min(Math.round(h), 2600), scale: 1 } }
  }
  const shot = await cmd('Page.captureScreenshot', params)
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log('wrote ' + out + ' (' + fs.statSync(out).size + ' bytes)')
}

await cmd('Page.enable')
await cmd('Runtime.enable')
await cmd('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: VIEW_H, deviceScaleFactor: DSF, mobile: true })

/* --- 1. 1997 年底事件卡 --- */
await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/seedyear?y=1997' })
const seeded = await waitFor('String(document.title).indexOf("SEED_OK") === 0', 20000)
console.log('seed1997: ' + seeded + ' ' + (await evaluate('document.title')))

await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' })
await evaluate('try{localStorage.removeItem("agu_fast")}catch(e){}')
const resumeReady = await waitFor('!!document.querySelector("#resume")', 25000)
console.log('resume sheet: ' + resumeReady)
await click('#resume')
const modal = await waitFor('!!document.querySelector("#opt-0")', 20000)
const cardText = await evaluate('(function(){var m=document.querySelector("#opt-0");var root=m?m.closest("view,div"):null;var t=document.querySelector("body")?document.body.innerText:"";var i=t.indexOf("1997");return t.slice(Math.max(0,i-40), i+260)})()')
console.log('event modal: ' + modal + ' | text: ' + JSON.stringify(String(cardText).replace(/\s+/g, ' ')))
await sleep(900)
await shoot('event-1997.png', false)

/* --- 2. 挑战码入口 --- */
await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/code' })
await waitFor('String(document.title).indexOf("CODE:") === 0', 20000)
const code = String(await evaluate('document.title')).slice(5)
console.log('challenge code: ' + code)

await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' })
try { await cmd('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:' + PORT, storageTypes: 'local_storage' }) } catch (e) { /* 老 chrome 没这个命令 */ }
await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/?fresh=1' })
const orgReady = await waitFor('!!document.querySelector("#org-0")', 25000)
console.log('org picker: ' + orgReady)
const opened = await click('#challenge-open')
const inputReady = await waitFor('!!document.querySelector("#challenge-input")', 10000)
const typed = await typeInto('#challenge-input', code)
const applied = await click('#challenge-apply')
await sleep(600)
const msg = await evaluate('(function(){var e=document.querySelector(".ag-cc-msg--ok");return e?e.innerText:""})()')
console.log('challenge ui: open=' + opened + ' input=' + inputReady + ' typed=' + typed + ' apply=' + applied)
console.log('challenge msg: ' + JSON.stringify(String(msg).replace(/\s+/g, ' ')))
await evaluate('(function(){var e=document.querySelector("#challenge-open")||document.querySelector("#challenge-input");if(e)e.scrollIntoView({block:"center"})})()')
await sleep(500)
await shoot('challenge-code.png', true)

/* 认了码之后真的按这一局开局：出身一选就进交易页，顶栏的码要和输入的一致 */
const started = await click('#org-0')
const chip = await waitFor('!!document.querySelector("#challenge-chip")', 20000)
const chipText = await evaluate('(function(){var e=document.querySelector("#challenge-chip");return e?e.innerText:""})()')
const seedShown = await evaluate('(function(){var e=document.querySelector("#challenge-chip .ag-cc-chip-v");return e?e.innerText:""})()')
console.log('start with code: start=' + started + ' chip=' + chip + ' chipText=' + JSON.stringify(String(chipText).replace(/\s+/g, ' ')) + ' code=' + code + ' match=' + (String(seedShown).trim() === code))

/* 开局后：顶栏下面那条「本局挑战码」细行 */
await sleep(700)
await shoot('challenge-ingame.png', false)

/* 结局页：挑战码 + 「同一局：指数 X× / 你 Y×」 */
await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/seedend' })
const endSeeded = await waitFor('String(document.title).indexOf("SEED_OK:end") === 0', 25000)
console.log('seedend: ' + endSeeded + ' ' + (await evaluate('document.title')))
await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' })
const resume2 = await waitFor('!!document.querySelector("#resume")', 25000)
await click('#resume')
const endCard = await waitFor('!!document.querySelector("#challenge-card")', 25000)
await sleep(2200)
const share = await evaluate('(function(){var e=document.querySelector("#challenge-card");return e?e.innerText.replace(/\s+/g," "):""})()')
console.log('end card: resume=' + resume2 + ' challenge=' + endCard + ' text=' + JSON.stringify(share))
await evaluate('(function(){var e=document.querySelector("#challenge-card");if(e)e.scrollIntoView({block:"center"})})()')
await sleep(500)
await shoot('challenge-end.png', false)

/* 结局页口径一致：正文「指数走了 27.7 倍」与挑战码卡「指数 27.7×」同屏 */
await evaluate('(function(){var all=[].slice.call(document.querySelectorAll(".ag-panel,.ag-end-cc"));var t=all.filter(function(p){return String(p.innerText||"").indexOf("那三十六年")===0})[0];if(t)window.scrollTo(0,Math.max(0,t.getBoundingClientRect().top+window.scrollY-24))})()')
await sleep(500)
// 结局页很长，普通 390×844 视口塞不下「正文 + 挑战码卡」两段：这里把视口拉到 1500 高再截，仍是一屏。
await cmd('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: 1500, deviceScaleFactor: DSF, mobile: true })
await evaluate('(function(){var all=[].slice.call(document.querySelectorAll(".ag-panel,.ag-end-cc"));var t=all.filter(function(p){return String(p.innerText||"").indexOf("那三十六年")===0})[0];var c=document.querySelector("#challenge-card");if(t&&c){var bottom=c.getBoundingClientRect().bottom;var need=bottom+24-window.innerHeight;if(need>0)window.scrollBy(0,need)}})()')
await sleep(600)
const twoNumbers = await evaluate('(function(){var t=document.body.innerText;var a=/指数走了 [\\d.]+ 倍/.exec(t);var b=/指数 [\\d.]+×/.exec(t);var r=function(sel){var e=document.querySelector(sel);if(!e)return null;var b=e.getBoundingClientRect();return [Math.round(b.top),Math.round(b.bottom)]};return JSON.stringify({epoch:a?a[0]:null,card:b?b[0]:null,scrollY:Math.round(window.scrollY),vh:window.innerHeight,cardBox:r("#challenge-card")})})()')
console.log('index numbers on screen: ' + twoNumbers)
await shoot('end-consistent.png', false)
await cmd('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: VIEW_H, deviceScaleFactor: DSF, mobile: true })

/* 复盘/档案：交易季数 144/144 与四档仓位百分比合计 100（统计修好后） */
await cmd('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: 1500, deviceScaleFactor: DSF, mobile: true })
await evaluate('(function(){var all=[].slice.call(document.querySelectorAll(".ag-panel"));var t=all.filter(function(p){return String(p.innerText||"").indexOf("三十六年复盘")===0})[0];if(t)window.scrollTo(0,Math.max(0,t.getBoundingClientRect().top+window.scrollY-16))})()')
await sleep(600)
const stats = await evaluate('(function(){var t=document.body.innerText;var a=/交易季数[^0-9]*([0-9]+)/.exec(t);var m=t.match(/满仓 [0-9]+%|半仓 [0-9]+%|四分之一仓 [0-9]+%|空仓 [0-9]+%/g)||[];var sum=0;for(var i=0;i<m.length;i++)sum+=Number((m[i].match(/[0-9]+/)||[0])[0]);return JSON.stringify({season:a?a[0].replace(/\s+/g,""):null,pcts:m,sum:sum})})()')
console.log('end stats: ' + stats)
await shoot('end-stats-fixed.png', false)
await cmd('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: VIEW_H, deviceScaleFactor: DSF, mobile: true })

/* 2026 那张年度事件卡（本轮修好后第一次能弹出来） */
await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/seedyear?y=2026' })
const seeded2026 = await waitFor('String(document.title).indexOf("SEED_OK") === 0', 25000)
console.log('seed2026: ' + seeded2026 + ' ' + (await evaluate('document.title')))
await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' })
const resume3 = await waitFor('!!document.querySelector("#resume")', 25000)
await click('#resume')
const modal2026 = await waitFor('!!document.querySelector("#opt-0")', 25000)
const text2026 = await evaluate('(function(){var t=document.body.innerText;var i=t.indexOf("2026 · 年底");return i<0?"(没找到 2026 · 年底)":t.slice(i, i+220)})()')
console.log('event 2026: resume=' + resume3 + ' modal=' + modal2026 + ' text=' + JSON.stringify(String(text2026).replace(/\s+/g, ' ')))
await sleep(900)
await shoot('event-2026.png', false)

finish(0)
