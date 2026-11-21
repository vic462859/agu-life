/**
 * 取海报画布（1080×1440，1:1 像素坐标，不做 DPR 缩放）。
 * 双端分支用条件编译隔离；H5 的 DOM 访问只出现在这个文件的 #ifdef H5 段里。
 */
import { POSTER_H, POSTER_W, type PosterCtx } from './poster'

function wait(ms: number): Promise<void> {
  return new Promise<void>(function (r) {
    setTimeout(r, ms)
  })
}

// #ifdef H5
function findH5Canvas(id: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const cands: unknown[] = []
  const host = document.getElementById(id)
  if (host) {
    cands.push(host)
    const shadow = (host as unknown as { shadowRoot?: { querySelector?: (s: string) => unknown } | null }).shadowRoot
    if (shadow && typeof shadow.querySelector === 'function') cands.push(shadow.querySelector('canvas'))
    if (typeof (host as unknown as { querySelector?: unknown }).querySelector === 'function') {
      cands.push((host as unknown as { querySelector: (s: string) => unknown }).querySelector('canvas'))
    }
  }
  if (typeof document.querySelector === 'function') {
    cands.push(document.querySelector('canvas[canvas-id="' + id + '"]'))
  }
  for (let i = 0; i < cands.length; i++) {
    const el = cands[i] as HTMLCanvasElement | null
    if (!el || typeof el.getContext !== 'function') continue
    try {
      if (el.getContext('2d')) return el
    } catch (e) {
      /* 换下一个候选 */
    }
  }
  return null
}
// #endif

async function once(id: string, instance: unknown): Promise<PosterCtx | null> {
  // #ifdef H5
  {
    const el = findH5Canvas(id)
    if (el) {
      el.width = POSTER_W
      el.height = POSTER_H
      const ctx = el.getContext('2d')
      if (ctx) return ctx as unknown as PosterCtx
    }
  }
  // #endif
  // #ifdef MP-WEIXIN
  {
    const node = await new Promise<{ node: unknown } | null>(function (resolve) {
      try {
        uni
          .createSelectorQuery()
          .in(instance as never)
          .select('#' + id)
          .fields({ node: true, size: true }, function (res: unknown) {
            const r = res as { node?: unknown } | null
            resolve(r && r.node ? { node: r.node } : null)
          })
          .exec()
      } catch (e) {
        resolve(null)
      }
    })
    if (node && node.node) {
      const cv = node.node as { width: number; height: number; getContext: (t: string) => unknown }
      cv.width = POSTER_W
      cv.height = POSTER_H
      const ctx = cv.getContext('2d')
      if (ctx) return ctx as PosterCtx
    }
  }
  // #endif
  return null
}

/** 拿不到画布就返回 null，调用方要显示可读提示，不能白屏。 */
export async function acquirePoster(id: string, instance?: unknown, attempts = 4): Promise<PosterCtx | null> {
  for (let i = 0; i < attempts; i++) {
    const ctx = await once(id, instance)
    if (ctx) return ctx
    if (i < attempts - 1) await wait(70 * (i + 1))
  }
  return null
}
