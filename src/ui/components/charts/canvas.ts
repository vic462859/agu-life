/**
 * 双端 canvas 获取：这是整个 charts 目录里唯一碰平台 API 的地方。
 * 分支用条件编译隔离，几何与绘制全部在 geometry.ts / paint.ts。
 *
 * 约定：拿不到节点或上下文一律返回 null（调用方转 CSS 降级），永不抛。
 */
import type { Ctx2D } from './paint'
import { resolveCanvasSize } from './geometry'

export interface CanvasHandle {
  ctx: Ctx2D
  /** CSS 像素宽。 */
  width: number
  /** CSS 像素高。 */
  height: number
  /** 设备像素比，绘制前已按它 setTransform，所以后续一律按 CSS 像素画。 */
  dpr: number
}

/** 取节点最多试几次（页面未就绪时前几次会落空）。 */
const ATTEMPTS = 3
/** 两次之间等多久（毫秒）。 */
const RETRY_MS = 60

function wait(ms: number): Promise<void> {
  return new Promise<void>(function (resolve) {
    setTimeout(resolve, ms)
  })
}

/** rpx → CSS 像素。取不到 uni 时按 750 设计稿的 1/2 估算。 */
export function toPx(rpx: number): number {
  const n = Number(rpx)
  const v = isFinite(n) ? n : 0
  try {
    return uni.upx2px(v)
  } catch (e) {
    return v / 2
  }
}

/** 拿不到 canvas 时的兜底宽度估算：窗口宽减去页面/卡片左右内边距。 */
export function estimateWidth(): number {
  try {
    const info = uni.getSystemInfoSync()
    const win = Number(info && info.windowWidth)
    if (isFinite(win) && win > 0) return Math.max(96, win - toPx(96))
  } catch (e) {
    /* 取不到系统信息就退回设计稿宽度 */
  }
  return 300
}

function devicePixelRatio(): number {
  try {
    const info = uni.getSystemInfoSync()
    const r = Number(info && info.pixelRatio)
    if (isFinite(r) && r > 0) return Math.min(4, r)
  } catch (e) {
    /* 忽略 */
  }
  return 1
}

// #ifdef H5
/**
 * H5 的画布由我们自己在宿主 <view> 里建。
 * 不用 uni-canvas 包装：它会在绘制之后按自己的尺寸逻辑重铺显示框，
 * dpr≥2 时 CSS 框被撑成位图尺寸 ⇒ 内容被放大一倍并裁掉左半（M1-C 的 dsf 事故）。
 */
function findH5Canvas(id: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const host = document.getElementById(id)
  if (!host) return null
  const self = host as unknown as HTMLCanvasElement
  if (typeof self.getContext === 'function' && self.tagName === 'CANVAS') return self
  let cv = typeof host.querySelector === 'function' ? (host.querySelector('canvas') as HTMLCanvasElement | null) : null
  if (!cv) {
    try {
      cv = document.createElement('canvas')
      cv.style.display = 'block'
      cv.style.width = '100%'
      cv.style.height = '100%'
      host.appendChild(cv)
    } catch (e) {
      return null
    }
  }
  try {
    if (cv && cv.getContext('2d')) return cv
  } catch (e) {
    /* 取不到上下文就交给调用方降级 */
  }
  return null
}
// #endif

async function acquireOnce(
  id: string,
  instance: unknown,
  cssHeight: number,
): Promise<CanvasHandle | null> {
  const dpr = devicePixelRatio()
  // #ifdef H5
  {
    const el = findH5Canvas(id)
    if (el) {
      const host = (document.getElementById(id) || el) as HTMLElement
      const rect = typeof host.getBoundingClientRect === 'function' ? host.getBoundingClientRect() : null
      const rawW = (rect && rect.width) || host.clientWidth || 0
      const size = resolveCanvasSize(Number(rawW) || estimateWidth(), cssHeight, dpr)
      el.width = size.bitmapW
      el.height = size.bitmapH
      el.style.width = size.cssW + 'px'
      el.style.height = size.cssH + 'px'
      const ctx = el.getContext('2d') as unknown as Ctx2D & {
        setTransform?: (a: number, b: number, c: number, d: number, e: number, f: number) => void
      }
      if (!ctx) return null
      if (typeof ctx.setTransform === 'function') ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
      else ctx.clearRect(0, 0, size.cssW, size.cssH)
      return { ctx, width: size.cssW, height: size.cssH, dpr: size.dpr }
    }
  }
  // #endif
  // #ifdef MP-WEIXIN
  {
    const node = await new Promise<{ node: unknown; width: number; height: number } | null>(function (
      resolve,
    ) {
      try {
        uni
          .createSelectorQuery()
          .in(instance as never)
          .select('#' + id)
          .fields({ node: true, size: true }, function (res: unknown) {
            const r = res as { node?: unknown; width?: number; height?: number } | null
            if (!r || !r.node) resolve(null)
            else resolve({ node: r.node, width: Number(r.width) || 0, height: Number(r.height) || 0 })
          })
          .exec()
      } catch (e) {
        resolve(null)
      }
    })
    if (node && node.node) {
      const cv = node.node as {
        width: number
        height: number
        getContext: (t: string) => unknown
      }
      const size = resolveCanvasSize(node.width || estimateWidth(), node.height || cssHeight, dpr)
      cv.width = size.bitmapW
      cv.height = size.bitmapH
      const ctx = cv.getContext('2d') as (Ctx2D & {
        setTransform?: (a: number, b: number, c: number, d: number, e: number, f: number) => void
      }) | null
      if (!ctx) return null
      if (typeof ctx.setTransform === 'function') ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
      return { ctx, width: size.cssW, height: size.cssH, dpr: size.dpr }
    }
  }
  // #endif
  return null
}

/** 临时探针：把 dpr / 量到的尺寸 / 真实 DOM 尺寸打成一串，供 --dump-dom 取证。 */
export function debugInfo(id: string, h: CanvasHandle | null): string {
  const out: string[] = []
  try {
    const g = globalThis as unknown as { devicePixelRatio?: number; innerWidth?: number }
    out.push('win.dpr=' + g.devicePixelRatio + ' innerW=' + g.innerWidth)
    out.push('docClientW=' + (document.documentElement ? document.documentElement.clientWidth : -1))
    const info = uni.getSystemInfoSync() as unknown as { windowWidth?: number; pixelRatio?: number }
    out.push('uniW=' + info.windowWidth + ' uniDpr=' + info.pixelRatio)
    out.push('toPx400=' + toPx(400))
    const host = document.getElementById(id) as HTMLElement | null
    const r = host && host.getBoundingClientRect ? host.getBoundingClientRect() : null
    out.push('hostRect=' + (r ? Math.round(r.width) + 'x' + Math.round(r.height) : 'null'))
    const el = host && host.querySelector ? (host.querySelector('canvas') as HTMLCanvasElement | null) : null
    out.push('cv=' + (el ? el.width + 'x' + el.height + ' css=' + el.style.width + 'x' + el.style.height : 'null'))
    const box = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null
    out.push('cvBox=' + (box ? Math.round(box.width) + 'x' + Math.round(box.height) : 'null'))
    const par = el && el.parentElement ? el.parentElement : null
    const pbox = par && par.getBoundingClientRect ? par.getBoundingClientRect() : null
    out.push('par=' + (par ? par.tagName + ':' + (pbox ? Math.round(pbox.width) + 'x' + Math.round(pbox.height) : '?') : 'null'))
    out.push('computedW=' + (el ? String(getComputedStyle(el).width) : '?'))
    out.push('handle=' + (h ? Math.round(h.width) + 'x' + Math.round(h.height) + ' dpr=' + h.dpr : 'null'))
  } catch (e) {
    out.push('ERR ' + String(e))
  }
  return out.join(' | ')
}

/**
 * 取 canvas：带重试（页面未就绪时前几次会查不到节点）。
 * 全部失败返回 null —— 调用方必须据此渲染 CSS 降级视图，不能白屏。
 */
export async function acquireCanvas(
  id: string,
  instance: unknown,
  cssHeight: number,
): Promise<CanvasHandle | null> {
  for (let i = 0; i < ATTEMPTS; i++) {
    const h = await acquireOnce(id, instance, cssHeight)
    if (h) return h
    if (i < ATTEMPTS - 1) await wait(RETRY_MS * (i + 1))
  }
  return null
}
