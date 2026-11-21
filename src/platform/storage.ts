/** 平台存储适配：H5 走 localStorage，小程序走 uni storage，都没有就退到内存。
 *  core 不碰这些；只有这一层知道平台差异。 */

export interface StorageLike {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

const memory = new Map<string, string>()

/** 内存实现（无存储环境下兜底，也让测试不依赖真存储）。 */
export const memoryStorage: StorageLike = {
  get: function (key) {
    const v = memory.get(key)
    return typeof v === 'string' ? v : null
  },
  set: function (key, value) {
    memory.set(key, value)
  },
  remove: function (key) {
    memory.delete(key)
  },
}

function browserStorage(): StorageLike | null {
  // #ifdef H5
  try {
    const ls = (globalThis as unknown as { localStorage?: Storage }).localStorage
    if (ls) {
      return {
        get: function (key) {
          const v = ls.getItem(key)
          return typeof v === 'string' ? v : null
        },
        set: function (key, value) {
          ls.setItem(key, value)
        },
        remove: function (key) {
          ls.removeItem(key)
        },
      }
    }
  } catch (e) {
    return null
  }
  // #endif
  return null
}

function uniStorage(): StorageLike | null {
  // #ifndef H5
  try {
    if (typeof uni !== 'undefined' && uni.getStorageSync) {
      return {
        get: function (key) {
          const v = uni.getStorageSync(key)
          return v === '' || v === null || v === undefined ? null : String(v)
        },
        set: function (key, value) {
          uni.setStorageSync(key, value)
        },
        remove: function (key) {
          uni.removeStorageSync(key)
        },
      }
    }
  } catch (e) {
    return null
  }
  // #endif
  return null
}

/** 挑一个能用的存储实现。 */
export function createStorage(): StorageLike {
  return browserStorage() || uniStorage() || memoryStorage
}
