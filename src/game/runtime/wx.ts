/** 唯一允许摸 wx 的地方：小游戏运行时。wx.createCanvas + 触摸 + wx storage + 相册导出 + 音效。 */
import { Game } from '../app'
import type { ClipHost, Storage } from '../app'
import type { Ctx2D } from '../paint'
import { POSTER_NO_CANVAS, paintPoster } from '../posterjob'
import type { CanvasLike, PosterSink } from '../posterjob'
import type { HapticPlay, SfxKind, SfxPlay } from '../sfx'

/** 小游戏全局。没有官方 @types，这里按用到的成员声明，不引依赖。 */
interface TouchLike {
  clientX: number
  clientY: number
}
interface TouchEventLike {
  touches?: TouchLike[]
  changedTouches?: TouchLike[]
}
interface TempFileResult {
  tempFilePath: string
}
interface ErrLike {
  errMsg?: string
}
/** InnerAudioContext 里我们用到的成员（官方类型不进小游戏包）。 */
interface InnerAudioLike {
  src: string
  volume: number
  play(): void
  stop(): void
  destroy(): void
}
declare const wx: {
  createCanvas(): CanvasLike
  getSystemInfoSync(): { windowWidth: number; windowHeight: number; pixelRatio: number }
  onTouchStart(cb: (e: TouchEventLike) => void): void
  onTouchMove(cb: (e: TouchEventLike) => void): void
  onTouchEnd(cb: (e: TouchEventLike) => void): void
  onTouchCancel(cb: (e: TouchEventLike) => void): void
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  /** 短音效：一个文件一个实例，src 相对 game.js。 */
  createInnerAudioContext(): InnerAudioLike
  /** 震动：light 是 wx 最轻的一档。 */
  vibrateShort(o: { type?: 'heavy' | 'medium' | 'light'; success?: () => void; fail?: (e: ErrLike) => void }): void
  canvasToTempFilePath(o: {
    canvas?: CanvasLike
    fileType?: string
    success?: (r: TempFileResult) => void
    fail?: (e: ErrLike) => void
  }): void
  saveImageToPhotosAlbum(o: { filePath: string; success?: () => void; fail?: (e: ErrLike) => void }): void
  /** 复制挑战码：小游戏里唯一的「分享这一局」的办法。 */
  setClipboardData(o: { data: string; success?: () => void; fail?: (e: ErrLike) => void }): void
  /** 粘贴挑战码：小游戏没有输入框，剪贴板就是唯一入口。 */
  getClipboardData(o: { success?: (r: { data: string }) => void; fail?: (e: ErrLike) => void }): void
}

function pick(e: TouchEventLike): TouchLike | null {
  return (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null
}

/** 授权被拒时给的那句话：与 H5 的 saveImage.ts 一字不差（用户在哪一端看到的都是同一件事）。 */
const ALBUM_DENIED = '相册授权被拒绝：点右上角「···」→ 设置 → 允许「保存到相册」，再点一次保存'

function canvasToTemp(cv: CanvasLike): Promise<{ ok: boolean; path: string; msg: string }> {
  return new Promise(function (resolve) {
    try {
      wx.canvasToTempFilePath({
        canvas: cv,
        fileType: 'png',
        success: function (r) {
          resolve({ ok: true, path: r && r.tempFilePath ? r.tempFilePath : '', msg: '' })
        },
        fail: function (e) {
          resolve({ ok: false, path: '', msg: (e && e.errMsg) || '导出失败' })
        },
      })
    } catch (e) {
      resolve({ ok: false, path: '', msg: '导出失败' })
    }
  })
}

function saveAlbum(path: string): Promise<{ ok: boolean; msg: string }> {
  return new Promise(function (resolve) {
    try {
      wx.saveImageToPhotosAlbum({
        filePath: path,
        success: function () {
          resolve({ ok: true, msg: '' })
        },
        fail: function (e) {
          resolve({ ok: false, msg: (e && e.errMsg) || '' })
        },
      })
    } catch (e) {
      resolve({ ok: false, msg: '保存失败' })
    }
  })
}

/**
 * 战报导出链路：wx.createCanvas 拿一张离屏画布（第一次是屏幕画布，之后都是离屏）
 * → poster.ts 画 1080×1440 → wx.canvasToTempFilePath → wx.saveImageToPhotosAlbum。
 * 每一步失败都返回人话；授权被拒走 ALBUM_DENIED。
 */
const poster: PosterSink = async function (end, assetText) {
  let off: CanvasLike | null = null
  try {
    off = wx.createCanvas()
  } catch (e) {
    return { ok: false, msg: POSTER_NO_CANVAS }
  }
  if (!paintPoster(off, end, assetText)) return { ok: false, msg: POSTER_NO_CANVAS }

  const tmp = await canvasToTemp(off)
  if (!tmp.ok || !tmp.path) return { ok: false, msg: '导出图片失败（' + tmp.msg + '）' }

  const saved = await saveAlbum(tmp.path)
  if (saved.ok) return { ok: true, msg: '已保存到相册' }
  if (/auth|deny|denied|authorize|forbidden/i.test(saved.msg)) return { ok: false, msg: ALBUM_DENIED }
  return { ok: false, msg: '保存失败：' + saved.msg }
}

/**
 * 挑战码的剪贴板：写失败自己吞（用户会看到「已复制」，真机某些版本会静默失败），
 * 读失败给空串 —— decodeChallenge 对空串自有一句人话，这一层不重复判断。
 */
const clip: ClipHost = {
  read() {
    return new Promise(function (resolve) {
      try {
        wx.getClipboardData({
          success: function (r) {
            resolve(r && typeof r.data === 'string' ? r.data : '')
          },
          fail: function () {
            resolve('')
          },
        })
      } catch (e) {
        resolve('')
      }
    })
  },
  write(text: string) {
    try {
      wx.setClipboardData({
        data: text,
        success: function () {},
        fail: function () {},
      })
    } catch (e) {
      // 写不进去不影响这一局：提示照给，码在屏幕上还看得见
    }
  },
}

/* ---------------- 音效 / 震动 ---------------- */

/**
 * 三个 WAV 随包走（scripts/gen-sfx.mjs 生成，build-minigame.mjs 拷进 dist-minigame/audio/）。
 * 路径相对 game.js —— 小游戏里没有绝对路径这回事。
 */
const SFX_SRC: Record<SfxKind, string> = {
  click: 'audio/click.wav',
  up: 'audio/up.wav',
  down: 'audio/down.wav',
}

/** 一个音效一个 InnerAudioContext：短音靠 stop → play 从头放，连点不叠声。 */
const players = new Map<SfxKind, InnerAudioLike>()

const sfx: SfxPlay = function (kind) {
  try {
    let a = players.get(kind)
    if (!a) {
      a = wx.createInnerAudioContext()
      a.src = SFX_SRC[kind]
      a.volume = kind === 'click' ? 0.6 : 0.8
      players.set(kind, a)
    }
    a.stop()
    a.play()
  } catch (e) {
    // 放不出来就静音：音效不该打断这一局
  }
}

/**
 * 震动：三个时机都问「轻」这一档（kind 由表现层给，平台层不判断时机）。
 * 传一个空的 fail：机型不支持时不必在控制台刷一行红字。
 */
const haptic: HapticPlay = function () {
  try {
    wx.vibrateShort({ type: 'light', fail: function () {} })
  } catch (e) {
    // 不支持震动的机型：什么都不做
  }
}

export function mountWx(): Game {
  const info = wx.getSystemInfoSync()
  const dpr = Math.min(3, info.pixelRatio || 1)
  const canvas = wx.createCanvas()
  const w = Math.round(info.windowWidth)
  const h = Math.round(info.windowHeight)

  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const raw = canvas.getContext('2d') as {
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  }
  raw.setTransform(dpr, 0, 0, dpr, 0, 0)

  const storage: Storage = {
    get(key) {
      try {
        const v = wx.getStorageSync(key)
        return v === '' || v == null ? null : String(v)
      } catch (e) {
        return null
      }
    },
    set(key, value) {
      try {
        wx.setStorageSync(key, value)
      } catch (e) {
        // 配额满 / 机型限制：存档失败不该打断这一局
      }
    },
  }

  const game = new Game({
    ctx: canvas.getContext('2d') as unknown as Ctx2D,
    width: w,
    height: h,
    storage,
    sfx,
    haptic,
    poster,
    clip,
  })

  // 手势：小游戏没有 pointer 事件，三个 touch 事件就是全部输入
  wx.onTouchStart((e) => {
    const t = pick(e)
    if (t) game.down(t.clientX, t.clientY)
  })
  wx.onTouchMove((e) => {
    const t = pick(e)
    if (t) game.move(t.clientX, t.clientY)
  })
  wx.onTouchEnd(() => game.up())
  wx.onTouchCancel(() => game.up())

  const raf: (cb: (t: number) => void) => unknown =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16)
  let last = 0
  const frame = (t: number) => {
    const now = t || Date.now()
    const dt = last ? (now - last) / 1000 : 0
    last = now
    game.frame(dt)
    game.render()
    raf(frame)
  }
  raf(frame)

  return game
}
