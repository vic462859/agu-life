#!/usr/bin/env node
/**
 * V2b 真产物自测（开发工具，不进 src）：用一套 wx 桩跑 dist-minigame/game.js，
 * 验「点击 → vibrateShort + InnerAudioContext.play」「开关关掉后不再放声」。
 *
 * 为什么跑产物而不是跑 src：InnerAudioContext / vibrateShort 的接线只存在于 runtime/wx.ts，
 * 而 wx 的这几个 API 只有产物里那份桩调用才验得到。
 * 用法：node docs/shots/_v2b-wx-selftest.mjs     （先 node scripts/gen-sfx.mjs && npm run game:build）
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
  '..',
)
const FILE = path.join(ROOT, 'dist-minigame', 'game.js')
if (!fs.existsSync(FILE)) {
  console.error('✗ 没有 dist-minigame/game.js：先跑 npm run game:build')
  process.exit(2)
}
for (const name of ['click', 'up', 'down']) {
  const p = path.join(ROOT, 'dist-minigame', 'audio', name + '.wav')
  if (!fs.existsSync(p)) {
    console.error('✗ 缺少音效文件：' + p + '（先跑 node scripts/gen-sfx.mjs && npm run game:build）')
    process.exit(2)
  }
}

const lines = []
function say(s) {
  console.log(s)
  lines.push(s)
}

/* ---------------- 2D 上下文桩：只记账 ---------------- */
function charW(ch) {
  const c = ch.codePointAt(0) || 0
  return c >= 0x2e80 ? 1 : 0.55
}
function makeCtx() {
  const ctx = {
    fillStyle: '',
    font: '',
    globalAlpha: 1,
    fillRect() {},
    fillText() {},
    measureText(t) {
      const m = /(\d+(?:\.\d+)?)px/.exec(String(ctx.font))
      const px = m ? Number(m[1]) : 14
      let w = 0
      for (const ch of String(t)) w += charW(ch) * px
      return { width: w }
    },
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    fill() {},
    stroke() {},
    clearRect() {},
    setTransform() {},
    translate() {},
    scale() {},
    createLinearGradient() {
      return { addColorStop() {} }
    },
  }
  return ctx
}

/* ---------------- wx 桩 ---------------- */
const storage = new Map()
const touch = {}
const played = []
const stops = []
const vibs = []

globalThis.wx = {
  createCanvas() {
    const ctx = makeCtx()
    return { width: 0, height: 0, getContext() { return ctx } }
  },
  getSystemInfoSync() {
    return { windowWidth: 390, windowHeight: 844, pixelRatio: 2 }
  },
  onTouchStart(cb) { touch.start = cb },
  onTouchMove(cb) { touch.move = cb },
  onTouchEnd(cb) { touch.end = cb },
  onTouchCancel(cb) { touch.cancel = cb },
  getStorageSync(k) { return storage.has(k) ? storage.get(k) : '' },
  setStorageSync(k, v) { storage.set(k, v) },
  // 每个音效一个实例：记下 src（是 audio/<name>.wav 才算接对）与 play/stop 次数
  createInnerAudioContext() {
    const a = {
      src: '',
      volume: 1,
      play() { played.push(this.src) },
      stop() { stops.push(this.src) },
      destroy() {},
    }
    return a
  },
  vibrateShort(o) { vibs.push((o && o.type) || '') },
  getClipboardData(o) { if (o && o.success) o.success({ data: '' }) },
  setClipboardData(o) { if (o && o.success) o.success() },
  canvasToTempFilePath(o) { if (o && o.success) o.success({ tempFilePath: 'wxfile://tmp/poster.png' }) },
  saveImageToPhotosAlbum(o) { if (o && o.success) o.success() },
}

/* ---------------- 跑产物 ---------------- */
say('=== V2b 小游戏手感 · 真产物自测 ===')
say('产物：dist-minigame/game.js  ' + (fs.statSync(FILE).size / 1024).toFixed(1) + ' KB · 音效包 3 个 WAV')
new Function(fs.readFileSync(FILE, 'utf8'))()
const game = globalThis.__AGU_GAME__
if (!game) {
  console.error('✗ 入口没挂上 __AGU_GAME__')
  process.exit(3)
}
await new Promise((r) => setTimeout(r, 80))

function region(id) {
  return game.regions().find((h) => h.id === id) || null
}
function reveal(id) {
  for (let i = 0; i < 16; i++) {
    game.render()
    const r = region(id)
    if (!r) throw new Error('没有这个命中区: ' + id)
    if (r.rect.y >= 0 && r.rect.y + r.rect.h <= game.viewport.h) return r.rect
    game.scrollPage(Math.max(0, game.scrolled + r.rect.y - 200))
  }
  throw new Error('滚不到可见位置: ' + id)
}
/** 用真触摸回调点一下（验 wx.onTouchStart/onTouchEnd 的接线）。 */
function wxTap(id) {
  const r = reveal(id)
  const x = r.x + r.w / 2
  const y = r.y + r.h / 2
  touch.start({ touches: [{ clientX: x, clientY: y }] })
  touch.end({ touches: [], changedTouches: [{ clientX: x, clientY: y }] })
  game.render()
}

let fails = 0
function check(ok, msg, extra) {
  say((ok ? '  ✓ ' : '  ✗ ') + msg + (extra == null ? '' : '　' + extra))
  if (!ok) fails += 1
}

/* 1 开局：点出身卡 ⇒ 有效点击（震一下 + 放一声） */
played.length = 0
vibs.length = 0
wxTap('org:0')
say('')
say('▸ 开局点第一张出身卡（wx.onTouchStart → Game.down → up）')
check(vibs.length >= 1, 'vibrateShort 被调用', 'type=' + JSON.stringify(vibs))
check(vibs.every((t) => t === 'light'), '震动类型是 light')
check(played.length >= 1, 'InnerAudioContext.play 被调用', 'src=' + JSON.stringify(played))
check(played.every((s) => s === 'audio/click.wav'), '点击放的是 audio/click.wav')
check(game.view === 'trade', '进到交易页', 'view=' + game.view)

/* 2 过一季：结算那一下要响（涨/跌两种 WAV）+ 再震一下 */
played.length = 0
vibs.length = 0
wxTap('step')
say('')
say('▸ 点「过一季」（结算）')
check(played.length >= 1, '结算放了结算音效', 'src=' + JSON.stringify(played))
check(
  played.some((s) => s === 'audio/up.wav' || s === 'audio/down.wav'),
  '结算音是 up.wav 或 down.wav（不是点击音）',
)
check(vibs.indexOf('light') >= 0, '结算也震了一下')

/* 3 关音效：点 chip 本身还会响（关之前那一下），关掉之后一次都不许响 */
wxTap('sfx')
say('')
say('▸ 关掉音效（顶栏 chip）')
const savedRaw = storage.get('agu_sfx_v1')
check(game.sfxEnabled === false, '音效开关已关', 'storage=agu_sfx_v1 ' + savedRaw)
check(savedRaw != null && JSON.parse(savedRaw).sfx === false, '偏好写进了 wx storage')
played.length = 0
vibs.length = 0
for (let i = 0; i < 3; i++) {
  if (game.view === 'event') wxTap('ev:0')
  else wxTap('step')
}
check(played.length === 0, '音效关掉后 InnerAudioContext.play 一次都没调用', 'plays=' + played.length)
check(vibs.length >= 1, '音效关不影响震动', 'vibrations=' + vibs.length)

/* 4 重开一局（同一个 storage）：开关状态跟着存档回来 */
const reopened = [JSON.parse(storage.get('agu_sfx_v1') || '{}').sfx]
check(reopened[0] === false, '重读 storage 仍是关的')

/* 5 再开音效 + 关震动 */
played.length = 0
vibs.length = 0
wxTap('sfx')
wxTap('hb')
say('')
say('▸ 重新打开音效、关掉震动')
check(game.sfxEnabled === true, '音效已开')
check(game.hapticEnabled === false, '震动已关', 'storage=agu_sfx_v1 ' + storage.get('agu_sfx_v1'))
played.length = 0
vibs.length = 0
if (game.view === 'event') wxTap('ev:0')
else wxTap('step')
check(played.length >= 1, '音效重新打开后又会响', 'plays=' + played.length)
check(vibs.length === 0, '震动关掉后 vibrateShort 一次都没调用', 'vibrations=' + vibs.length)
say('')
say(fails === 0 ? '=== 自测通过：点击震+响 / 结算响 / 两个开关都拦得住 ===' : '=== 自测失败：' + fails + ' 条 ===')
process.exit(fails === 0 ? 0 : 1)
