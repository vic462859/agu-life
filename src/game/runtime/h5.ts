/** 唯一允许摸 DOM 的地方：H5 运行时。canvas + pointer/touch + localStorage + 战报导出 + 合成音效。 */
import { Game } from '../app'
import type { ClipHost, Storage } from '../app'
import type { Ctx2D } from '../paint'
import { POSTER_NO_CANVAS, paintPoster } from '../posterjob'
import type { PosterSink } from '../posterjob'
import type { HapticPlay, SfxKind, SfxPlay } from '../sfx'

export interface H5Handle {
  game: Game
  dispose(): void
}

/** 地址栏 ?seed=123 可复现同一局（截图 / 复现 bug 用）。 */
function seedFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get('seed')
  if (!raw) return null
  const n = Number(raw)
  return isFinite(n) ? n : null
}

const BTN =
  'font:600 14px "PingFang SC","Microsoft YaHei",sans-serif;color:#16110a;background:#d8a441;' +
  'border:0;border-radius:8px;padding:10px 18px;text-decoration:none;display:inline-block'

/**
 * 战报落地：离屏 canvas 画 1080×1440（poster.ts 的纯函数），
 * 再以 <img> 铺在页面最上层 —— 手机上长按就能存，桌面上点「保存图片」直接下载。
 * 画布拿不到 / 导出被浏览器拦下都给一句人话，不白屏。
 */
function showPoster(url: string): void {
  const wrap = document.createElement('div')
  wrap.id = 'agu-poster'
  wrap.style.cssText =
    'position:fixed;inset:0;z-index:20;background:rgba(6,9,13,0.94);display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:14px;padding:16px;box-sizing:border-box;'
  const img = document.createElement('img')
  img.alt = '战报'
  img.src = url
  img.style.cssText = 'max-width:88vw;max-height:78vh;display:block;box-shadow:0 10px 44px rgba(0,0,0,.65)'
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:12px'
  const save = document.createElement('a')
  save.href = url
  save.download = 'agu-life-poster.png'
  save.textContent = '保存图片'
  save.style.cssText = BTN
  const close = document.createElement('button')
  close.textContent = '关闭'
  close.style.cssText = BTN
  close.addEventListener('click', function () {
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap)
  })
  const tip = document.createElement('div')
  tip.textContent = '长按海报可存到相册；模拟游戏，不构成投资建议'
  tip.style.cssText = 'color:#6b798b;font:400 12px "PingFang SC","Microsoft YaHei",sans-serif'
  row.appendChild(save)
  row.appendChild(close)
  wrap.appendChild(img)
  wrap.appendChild(row)
  wrap.appendChild(tip)
  document.body.appendChild(wrap)
}

/** 音效 + 震动：浏览器端全部程序合成，不加载任何音频文件（与小游戏的 3 个 WAV 同源、同长）。 */
interface Senses {
  sfx: SfxPlay
  haptic: HapticPlay
  /** 用户第一次碰屏幕时把音频上下文唤醒（浏览器自动播放策略）。 */
  wake(): void
}

function createSenses(): Senses {
  let ac: AudioContext | null = null

  function boot(): AudioContext | null {
    try {
      if (!ac) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return null
        ac = new Ctor()
      }
      if (ac.state === 'suspended') void ac.resume()
      return ac
    } catch (e) {
      return null
    }
  }

  /** 一声：from→to 的扫频（相等就是定音），dur 是响的时长。 */
  function beep(from: number, to: number, dur: number, type: OscillatorType, vol: number): void {
    const a = boot()
    if (!a) return
    try {
      const t = a.currentTime
      const o = a.createOscillator()
      const g = a.createGain()
      o.type = type
      o.frequency.setValueAtTime(from, t)
      if (to !== from) o.frequency.linearRampToValueAtTime(to, t + dur)
      // 起音 4ms：60ms 的点击经不起 10ms 的爬升，但 0 起音会爆音
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(vol, t + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g)
      g.connect(a.destination)
      o.start(t)
      o.stop(t + dur + 0.02)
    } catch (e) {
      // 响不了就静音，绝不让音效打断这一局
    }
  }

  return {
    wake() {
      boot()
    },
    // 与 scripts/gen-sfx.mjs 的三个 WAV 同一组频率：点击 1250 正弦 / 涨 660→990 三角 / 跌 440→220 三角
    sfx(kind: SfxKind) {
      if (kind === 'click') beep(1250, 1250, 0.06, 'sine', 0.12)
      else if (kind === 'up') beep(660, 990, 0.12, 'triangle', 0.14)
      else beep(440, 220, 0.16, 'triangle', 0.14)
    },
    haptic() {
      try {
        if (navigator.vibrate) navigator.vibrate(12)
      } catch (e) {
        // 桌面浏览器没有振动：当作没有这个能力
      }
    },
  }
}

/**
 * 挑战码的剪贴板：只在安全上下文（https / localhost）里存在。
 * 没有就当平台不支持 —— 开局屏不会摆一个按不动的按钮。
 */
function createClip(): ClipHost | null {
  const c = navigator.clipboard
  if (!c) return null
  return {
    read() {
      return c.readText().catch(function () {
        return ''
      })
    },
    write(text: string) {
      void c.writeText(text).catch(function () {
        // 被浏览器拒绝（非用户手势 / 权限）：提示照给，不打断这一局
      })
    },
  }
}

export function mountH5(canvas: HTMLCanvasElement): H5Handle {
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  const got = canvas.getContext('2d')
  if (!got) throw new Error('canvas 2d 不可用')
  // 显式标注类型：闭包里才保住非空收窄
  const raw: CanvasRenderingContext2D = got
  // DOM 的 fillStyle 是 string | 渐变 | 图案，比契约更宽；表现层只用其中的字符串那一种。
  const ctx = raw as unknown as Ctx2D

  const storage: Storage = {
    get(key) {
      try {
        return window.localStorage.getItem(key)
      } catch (e) {
        return null
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value)
      } catch (e) {
        // 无痕模式 / 配额满：存档失败不该影响这一局
      }
    },
  }

  const senses = createSenses()

  const poster: PosterSink = async function (end, assetText) {
    let url = ''
    try {
      const cv = document.createElement('canvas')
      if (!paintPoster(cv, end, assetText)) return { ok: false, msg: POSTER_NO_CANVAS }
      url = cv.toDataURL('image/png')
    } catch (e) {
      return { ok: false, msg: POSTER_NO_CANVAS }
    }
    if (!url) return { ok: false, msg: '画布导出失败（可能被浏览器限制），可长按海报保存' }
    showPoster(url)
    return { ok: true, msg: '战报已生成：点「保存图片」下载，手机上可长按保存' }
  }

  const seed = seedFromUrl()
  const game = new Game({
    ctx,
    width: 0,
    height: 0,
    storage,
    seed: seed == null ? undefined : seed,
    sfx: senses.sfx,
    haptic: senses.haptic,
    poster,
    clip: createClip() || undefined,
  })

  function fit(): void {
    const rect = canvas.getBoundingClientRect()
    const w = Math.max(240, Math.round(rect.width || window.innerWidth))
    const h = Math.max(320, Math.round(rect.height || window.innerHeight))
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    raw.setTransform(dpr, 0, 0, dpr, 0, 0)
    game.resize(w, h)
  }

  function at(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  // 手势三件套：按下 / 移动 / 抬起。移动用 pointermove 的坐标喂 down 之后的同一手。
  const onDown = (clientX: number, clientY: number) => {
    senses.wake()
    const p = at(clientX, clientY)
    game.down(p.x, p.y)
  }
  const onMove = (clientX: number, clientY: number) => {
    const p = at(clientX, clientY)
    game.move(p.x, p.y)
  }
  const onUp = () => game.up()

  const onPointerDown = (e: PointerEvent) => {
    onDown(e.clientX, e.clientY)
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch (err) {
      // 某些环境不支持捕获：不影响后续 pointermove 落在 canvas 上
    }
  }
  const onPointerMove = (e: PointerEvent) => {
    if (e.buttons === 0 && e.pointerType === 'mouse') return
    onMove(e.clientX, e.clientY)
  }
  const onTouchStart = (e: TouchEvent) => {
    const t = e.changedTouches[0]
    if (t) onDown(t.clientX, t.clientY)
    e.preventDefault()
  }
  const onTouchMove = (e: TouchEvent) => {
    const t = e.changedTouches[0]
    if (t) onMove(t.clientX, t.clientY)
    e.preventDefault()
  }
  const onTouchEnd = (e: TouchEvent) => {
    onUp()
    e.preventDefault()
  }

  const pointerBound = 'onpointerdown' in window
  if (pointerBound) {
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('pointerleave', onUp)
  } else {
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd, { passive: false })
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false })
  }

  const onResize = () => fit()
  window.addEventListener('resize', onResize)

  fit()
  let raf = 0
  let last = 0
  const frame = (t: number) => {
    const dt = last ? (t - last) / 1000 : 0
    last = t
    game.frame(dt)
    game.render()
    raf = window.requestAnimationFrame(frame)
  }
  raf = window.requestAnimationFrame(frame)

  return {
    game,
    dispose() {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      if (pointerBound) {
        canvas.removeEventListener('pointerdown', onPointerDown)
        canvas.removeEventListener('pointermove', onPointerMove)
        canvas.removeEventListener('pointerup', onUp)
        canvas.removeEventListener('pointercancel', onUp)
        canvas.removeEventListener('pointerleave', onUp)
      } else {
        canvas.removeEventListener('touchstart', onTouchStart)
        canvas.removeEventListener('touchmove', onTouchMove)
        canvas.removeEventListener('touchend', onTouchEnd)
        canvas.removeEventListener('touchcancel', onTouchEnd)
      }
    },
  }
}
