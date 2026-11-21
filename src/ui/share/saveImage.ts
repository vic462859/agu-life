/** 把海报存成图片：H5 走 <a download>，小程序走 相册。授权被拒给可读提示。 */
export interface SaveResult {
  ok: boolean
  msg: string
}

// #ifdef H5
function findCanvas(id: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const host = document.getElementById(id)
  if (host && typeof (host as unknown as HTMLCanvasElement).toDataURL === 'function') return host as unknown as HTMLCanvasElement
  const inner =
    (host && typeof host.querySelector === 'function' ? (host.querySelector('canvas') as HTMLCanvasElement | null) : null) ||
    (typeof document.querySelector === 'function'
      ? (document.querySelector('canvas[canvas-id="' + id + '"]') as HTMLCanvasElement | null)
      : null)
  return inner && typeof inner.toDataURL === 'function' ? inner : null
}
// #endif

export async function savePoster(id: string, fileName = 'agu-life-poster.png'): Promise<SaveResult> {
  // #ifdef H5
  {
    const el = findCanvas(id)
    if (!el) return { ok: false, msg: '找不到海报画布，请重新生成一次' }
    let url = ''
    try {
      url = el.toDataURL('image/png')
    } catch (e) {
      return { ok: false, msg: '画布导出失败（可能被浏览器限制），可长按海报保存' }
    }
    try {
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return { ok: true, msg: '已下载 ' + fileName }
    } catch (e) {
      return { ok: false, msg: '浏览器拦下了下载，可长按海报保存' }
    }
  }
  // #endif
  // #ifdef MP-WEIXIN
  {
    const tmp = await new Promise<{ ok: boolean; path: string; msg: string }>(function (resolve) {
      try {
        uni.canvasToTempFilePath({
          canvasId: id,
          fileType: 'png',
          success: function (r: { tempFilePath: string }) {
            resolve({ ok: true, path: r.tempFilePath, msg: '' })
          },
          fail: function (e: { errMsg?: string }) {
            resolve({ ok: false, path: '', msg: (e && e.errMsg) || '导出失败' })
          },
        } as never)
      } catch (e) {
        resolve({ ok: false, path: '', msg: '导出失败' })
      }
    })
    if (!tmp.ok || !tmp.path) return { ok: false, msg: '导出图片失败（' + tmp.msg + '）' }

    const saved = await new Promise<{ ok: boolean; msg: string }>(function (resolve) {
      try {
        uni.saveImageToPhotosAlbum({
          filePath: tmp.path,
          success: function () {
            resolve({ ok: true, msg: '' })
          },
          fail: function (e: { errMsg?: string }) {
            resolve({ ok: false, msg: (e && e.errMsg) || '' })
          },
        } as never)
      } catch (e) {
        resolve({ ok: false, msg: '保存失败' })
      }
    })
    if (saved.ok) return { ok: true, msg: '已保存到相册' }
    if (/auth|deny|denied|authorize|forbidden/i.test(saved.msg)) {
      return { ok: false, msg: '相册授权被拒绝：点右上角「···」→ 设置 → 允许「保存到相册」，再点一次保存' }
    }
    return { ok: false, msg: '保存失败：' + saved.msg }
  }
  // #endif
  return { ok: false, msg: '当前平台不支持保存图片' }
}
