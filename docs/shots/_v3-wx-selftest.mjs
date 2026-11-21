#!/usr/bin/env node
/**
 * 真产物自测（开发工具，不进 src）：用一套 wx 桩跑 dist-minigame/game.js，
 * 走完「出身 → 天赋 → 开局 → 过几季 → 结局」，把每一步的屏幕、命中区、像素证据打出来。
 *
 * 为什么要跑产物而不是跑 src：这条链路里有四件事只有产物才验得到 ——
 * iife 打包 / 入口挂载（minigame/game.js）/ wx 的四个 touch 回调 / 剪贴板与相册导出。
 * 用法：node docs/shots/_v3-wx-selftest.mjs     （先 npm run game:build）
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
const KB = (fs.statSync(FILE).size / 1024).toFixed(1)

const lines = []
function say(s) {
  console.log(s)
  lines.push(s)
}

/* ---------------- 2D 上下文桩：只记账 ---------------- */

function charW(ch) {
  const c = ch.codePointAt(0) || 0
  // CJK 按一个字一个字号算，西文按 0.55 —— 只为了换行/截断走到真实分支
  return c >= 0x2e80 ? 1 : 0.55
}

function makeCtx(o) {
  const box = { texts: [], fills: [], pathFills: [], frames: 0, totalFills: 0, totalTexts: 0 }
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    get record() {
      return box
    },
    fillRect(x, y, w, h) {
      // 每帧的第一笔就是整屏底色：拿它认帧边界，只留最后一帧的像素
      if (o.frames && x === 0 && y === 0 && w > 0 && h > 0 && String(ctx.fillStyle) === '#06090d') {
        box.frames += 1
        box.texts.length = 0
        box.fills.length = 0
        box.pathFills.length = 0
      }
      box.totalFills += 1
      if (box.fills.length < 6000) box.fills.push({ style: String(ctx.fillStyle), x: x, y: y, w: w, h: h })
    },
    fillText(t, x, y) {
      box.totalTexts += 1
      if (box.texts.length < 3000) box.texts.push({ t: String(t), x: x, y: y })
    },
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
    fill() {
      // 面积与折线带走的是路径填充（契约里没有 lineWidth），没有 fillRect 可记账
      if (box.pathFills.length < 400) box.pathFills.push(String(ctx.fillStyle))
    },
    stroke() {},
    clearRect() {},
    setTransform() {},
    translate() {},
    scale() {},
    createLinearGradient() {
      return { addColorStop() {} }
    },
  }
  return { ctx, box }
}

/* ---------------- wx 桩 ---------------- */

const storage = new Map()
const touch = {}
const clip = { data: '' }
const album = { saved: [] }
let canvasCount = 0
let screenBox = null

function makeCanvas(record) {
  const made = makeCtx({ frames: record })
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return made.ctx
    },
    record: made.box,
  }
  return canvas
}

const screen = makeCanvas(true)
screenBox = screen.record

globalThis.wx = {
  createCanvas() {
    canvasCount += 1
    // 第一次是屏幕画布；之后（战报导出）每次给一张新的离屏画布
    return canvasCount === 1 ? screen : makeCanvas(false)
  },
  getSystemInfoSync() {
    return { windowWidth: 390, windowHeight: 844, pixelRatio: 2 }
  },
  onTouchStart(cb) {
    touch.start = cb
  },
  onTouchMove(cb) {
    touch.move = cb
  },
  onTouchEnd(cb) {
    touch.end = cb
  },
  onTouchCancel(cb) {
    touch.cancel = cb
  },
  getStorageSync(k) {
    return storage.has(k) ? storage.get(k) : ''
  },
  setStorageSync(k, v) {
    storage.set(k, v)
  },
  getClipboardData(o) {
    if (o && o.success) o.success({ data: clip.data })
  },
  setClipboardData(o) {
    clip.data = o && o.data ? o.data : ''
    if (o && o.success) o.success()
  },
  canvasToTempFilePath(o) {
    if (o && o.success) o.success({ tempFilePath: 'wxfile://tmp/poster.png' })
  },
  saveImageToPhotosAlbum(o) {
    album.saved.push(o && o.filePath)
    if (o && o.success) o.success()
  },
}

// 预置一份跨局记忆：6 个记忆点、什么都没解锁 —— 天赋屏因此会出现（有东西可买）
storage.set(
  'agu_meta_v1',
  JSON.stringify({ v: 1, points: 6, unlocked: [], lastSettled: null, currentTalent: null }),
)

/* ---------------- 跑产物 ---------------- */

say('=== V3 小游戏真产物自测 ===')
say('产物：dist-minigame/game.js  ' + KB + ' KB')
new Function(fs.readFileSync(FILE, 'utf8'))()
const game = globalThis.__AGU_GAME__
if (!game) {
  console.error('✗ 入口没挂上 __AGU_GAME__')
  process.exit(3)
}
say('挂载：wx.createCanvas #1 · ' + screen.width + '×' + screen.height + '（dpr=2，390×844 CSS）')

await new Promise((r) => setTimeout(r, 80))
if (!(screenBox.frames > 0)) {
  console.error('✗ 帧循环没跑起来（一帧都没画）')
  process.exit(4)
}
say('帧循环：真 rAF 桩下已画 ' + screenBox.frames + ' 帧，累计 fillRect ' + screenBox.totalFills + ' 次')

function region(id) {
  const r = game.regions().find(function (h) {
    return h.id === id
  })
  return r || null
}
function centerOf(id) {
  const r = region(id)
  if (!r) throw new Error('没有这个命中区: ' + id)
  return { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 }
}
/** 用真触摸回调点一下（验 wx.onTouchStart/onTouchEnd 的接线） */
function wxTap(x, y) {
  touch.start({ touches: [{ clientX: x, clientY: y }] })
  touch.end({ touches: [], changedTouches: [{ clientX: x, clientY: y }] })
  game.render()
}
function reveal(id) {
  for (let i = 0; i < 16; i++) {
    game.render()
    const r = region(id)
    if (!r) throw new Error('没有这个命中区: ' + id)
    if (r.rect.y >= 0 && r.rect.y + r.rect.h <= game.viewport.h) return r.rect
    game.scrollPage(Math.max(0, game.scrolled + r.rect.y - 200))
  }
  game.render()
  const r = region(id)
  if (!r) throw new Error('滚不到: ' + id)
  return r.rect
}
function tapVisible(id) {
  const r = reveal(id)
  wxTap(r.x + r.w / 2, r.y + r.h / 2)
}
function texts() {
  return screenBox.texts
    .map(function (t) {
      return t.t
    })
    .join(' | ')
}
function push(step) {
  const ids = game
    .regions()
    .map(function (r) {
      return r.id
    })
    .filter(function (id) {
      return id !== 'log:area'
    })
  say('')
  say('▸ ' + step)
  say('  屏幕：' + game.view + '　命中区 ' + ids.length + ' 个：' + ids.slice(0, 14).join(', '))
  if (game.noticeNow) say('  轻提示：' + game.noticeNow)
}

/* ---- 1 出身页：挑战码 ---- */
game.render()
push('开局（出身页）')
say('  挑战码：' + game.challengeCode + '　剪贴板：' + (game.hasClipboard ? '可用' : '无'))
say('  屏上文字含挑战码：' + (texts().indexOf(game.challengeCode) >= 0))
say('  屏上文字含「挑战码 · 同一个码就是同一局」：' + (texts().indexOf('挑战码 · 同一个码就是同一局') >= 0))
say('  记忆点：' + game.metaPoints)

// 点「复制」→ 走 wx.setClipboardData 桩
const copyAt = centerOf('code:copy')
wxTap(copyAt.x, copyAt.y)
push('点挑战码复制')
say('  剪贴板里的内容：' + clip.data + '（等于本局码：' + (clip.data === game.challengeCode) + '）')

// 长按也复制一次：按住 0.6s（dt 只从 frame 里来）
clip.data = ''
const holdAt = centerOf('code:copy')
touch.start({ touches: [{ clientX: holdAt.x, clientY: holdAt.y }] })
for (let i = 0; i < 14; i++) game.frame(0.05)
touch.end({ touches: [], changedTouches: [{ clientX: holdAt.x, clientY: holdAt.y }] })
push('长按挑战码 0.7s')
say('  剪贴板里的内容：' + clip.data + '（长按也能复制：' + (clip.data === game.challengeCode) + '）')

// 粘一条坏码：验证「读剪贴板 → decodeChallenge → 给人话」
clip.data = 'AGU-这不是码'
const pasteAt = centerOf('code:paste')
wxTap(pasteAt.x, pasteAt.y)
await new Promise((r) => setTimeout(r, 30))
push('粘贴一条坏码')
say('  认码结果照实说：' + game.noticeNow)

// 再粘一条真码（刚才复制进去的那条）
clip.data = game.challengeCode
wxTap(pasteAt.x, pasteAt.y)
await new Promise((r) => setTimeout(r, 30))
push('粘贴一条真码')

/* ---- 2 天赋屏 ---- */
const orgAt = centerOf('org:0')
wxTap(orgAt.x, orgAt.y)
push('点第一张出身卡')
const offer = game.talentOffer
say('  天赋三行：' + offer.map(function (t) { return t.name + (t.unlocked ? '(已解锁)' : '(锁 ' + t.price + ' 点)') }).join(' / '))
say('  屏上文字含「带一样东西上路」：' + (texts().indexOf('带一样东西上路') >= 0))

const first = offer[0]
tapVisible('talent:' + first.id)
push('点锁着的第一条（记忆点够 ⇒ 当场解锁）')
say('  记忆点：' + game.metaPoints + '　还在这屏：' + (game.view === 'talent'))
tapVisible('talent:' + first.id)
push('再点一次（这次是「带上路」）')
say('  屏幕：' + game.view + '　带的天赋：' + game.carriedTalent)

/* ---- 3 过几季 ---- */
for (let i = 0; i < 3; i++) {
  if (game.view === 'event') {
    push('事件卡（第 ' + (i + 1) + ' 次推进撞上的）')
    tapVisible('ev:0')
    continue
  }
  tapVisible('step')
}
const g1 = game.game
push('过完三季')
say('  季数：' + g1.s.qi + '　资产：' + Math.round(g1.s.asset) + '　年份：' + g1.s.qi / 4)

/* ---- 4 一路到结局 ---- */
let guard = 0
while (game.view !== 'over' && guard++ < 400) {
  if (game.view === 'event') {
    tapVisible('ev:0')
    continue
  }
  if (game.view !== 'trade') throw new Error('没料到的屏幕: ' + game.view)
  tapVisible('year')
}
push('走到结局（' + guard + ' 手）')
if (game.view !== 'over') throw new Error('没走到结局')
tapVisible('skip')
game.render()
push('跳过六层仪式')
const over = texts()
say('  含「那三十六年 · 指数」：' + (over.indexOf('那三十六年 · 指数') >= 0))
say('  含「记忆点 +」：' + (over.indexOf('记忆点 +') >= 0))
say('  含带天赋那行：' + (over.indexOf('带天赋：') >= 0) + ' → ' + (over.match(/带天赋：[^|]*/) || [''])[0])

// 长图 / 静物 / 胸像：从这一屏的像素里找证据（颜色是内核里的常量）
function count(style, minW) {
  return screenBox.fills.filter(function (f) {
    return f.style === style && (!minW || (f.w === 1 && f.h === 1))
  }).length
}
game.scrollPage(1e9)
game.render()
const px = screenBox.fills
const paths = screenBox.pathFills
const area = paths.filter(function (s) {
  return s === '#3ee0cb'
}).length
const line = paths.filter(function (s) {
  return s === '#f6cf72'
}).length
const cloth = px.filter(function (f) {
  return f.style === '#6b798b'
}).length
say('  像素：长图面积填充 ' + area + ' 次 · 折线带填充 ' + line + ' 次 · 静物布色 ' + cloth + ' 笔')
if (area <= 0 || line <= 0 || cloth <= 0) throw new Error('结局屏缺长图或静物')

/* ---- 5 战报导出（wx.canvasToTempFilePath + saveImageToPhotosAlbum） ---- */
const posterAt = centerOf('poster')
wxTap(posterAt.x, posterAt.y)
await new Promise((r) => setTimeout(r, 60))
push('点「生成战报」')
say('  提示：' + game.noticeNow + '　相册：' + album.saved.join(','))
if (album.saved.length !== 1) throw new Error('战报没落到相册')

/* ---- 6 重新开始：换 seed、清天赋 ---- */
const againAt = centerOf('again')
wxTap(againAt.x, againAt.y)
push('点「再来一次」')
say('  回到：' + game.view + '　新码：' + game.challengeCode)
say('  跨局记忆点结余：' + game.metaPoints)

say('')
say('=== 自测通过：出身 → 天赋 → 开局 → 过几季 → 结局 → 战报 → 重开 ===')
say('累计 fillRect ' + screenBox.totalFills + ' 次 · fillText ' + screenBox.totalTexts + ' 次 · 离屏画布 ' + (canvasCount - 1) + ' 张')
process.exit(0)
