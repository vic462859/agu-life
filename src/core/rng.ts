/** 可 seed 的随机源实现（mulberry32）。core 内所有随机都必须走它。 */
import type { RngLike } from './types'

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 造一个 RngLike：同 seed ⇒ 同一串随机数。 */
export function createRng(seed: number): RngLike {
  const r = mulberry32(seed)
  return {
    next: function () { return r() },
    int: function (n: number) { return Math.floor(r() * n) },
  }
}
