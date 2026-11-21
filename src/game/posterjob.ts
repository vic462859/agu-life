/**
 * 战报海报：把 poster.ts 的纯绘制函数落到一张**离屏画布**上。
 * 这里只管「画」，导出与授权是平台层的事（runtime/* 实现 PosterSink）——
 * 所以 src/game 里不碰任何平台全局，也照样能出图。
 */
import type { EndView } from '../core'
import type { PosterCtx } from '../ui/share/poster'
import { POSTER_H, POSTER_W, buildPosterData, drawPoster } from '../ui/share/poster'

/** 双端都满足的最小画布：尺寸可写 + 能取 2d 上下文。 */
export interface CanvasLike {
  width: number
  height: number
  getContext(kind: string): unknown
}

export interface PosterResult {
  ok: boolean
  msg: string
}

/** 平台层交给 app 的导出口：画 + 存，失败了也要给一句人话。 */
export type PosterSink = (end: EndView, assetText: string) => Promise<PosterResult>

/**
 * 在给定画布上画 1080×1440 战报（1:1 像素，不做 DPR 缩放）。
 * 返回 false = 这个环境画不出来（拿不到 2d 上下文 / 绘制抛错），调用方给可读提示。
 */
export function paintPoster(cv: CanvasLike | null, end: EndView, assetText: string): boolean {
  if (!cv) return false
  let ctx: unknown = null
  try {
    cv.width = POSTER_W
    cv.height = POSTER_H
    ctx = cv.getContext('2d')
  } catch (e) {
    return false
  }
  if (!ctx) return false
  try {
    drawPoster(ctx as PosterCtx, buildPosterData(end, assetText))
    return true
  } catch (e) {
    return false
  }
}

/** 画布拿不到时各方共用的那句提示（H5 与 wx 一字不差，用户截图里认得出是同一件事）。 */
export const POSTER_NO_CANVAS = '这个环境画不出海报（画布不可用）。'
