<script setup lang="ts">
/**
 * 36 年指数走势图。
 * H5 自建 <canvas>（不经 uni-canvas 包装）+ devicePixelRatio 缩放；
 * 小程序走 type="2d" 节点查询（异步，带重试）。
 * 两端都拿不到上下文时退到 CssLine（同一份 geometry），不白屏。
 *
 * 尺寸口径只有一处：resolveCanvasSize(cssW, cssH, dpr)。
 * 几何永远吃 CSS 尺寸，dpr 只体现在位图尺寸与 setTransform 上 —— 乘两次就会
 * 变成「整条线挤成右上角一根竖条」（M1-C 的 dsf≥2 事故）。
 */
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { acquireCanvas, toPx } from './canvas'
import { niceTicks, pathFromPoints, scaleLinear } from './geometry'
import { drawArea, drawDot, drawGrid, drawLine, drawMarks, drawZero } from './paint'
import type { CanvasHandle } from './canvas'
import CssLine from './CssLine.vue'

interface Mark {
  idx: number
  label?: string
  color?: string
}

const props = withDefaults(
  defineProps<{
    /** 数据点：t 是标签（年/季/序号），v 是数值。 */
    points: { t: string; v: number }[]
    /** 高度，rpx 数值（内部按 uni.upx2px 换算成 CSS 像素）。 */
    height?: number
    /** 标注：idx 是 points 下标，落到折线上并画竖虚线。 */
    marks?: Mark[]
    /** 主色。 */
    accent?: string
    /** 是否填充折线下方。 */
    fill?: boolean
    /** 是否把 0 纳入纵轴并画零轴。 */
    zeroLine?: boolean
    /** 固定 y 域（多图共用一把尺子时用）。不传 = 按本串数据自动缩放。 */
    domain?: [number, number] | null
    /** 调试开关：true 时跳过 canvas，直接渲染 CSS 降级视图。 */
    forceFallback?: boolean
  }>(),
  {
    height: 380,
    marks: () => [],
    accent: '#f0c25a',
    fill: true,
    zeroLine: false,
    domain: null,
    forceFallback: false,
  },
)

const inst = getCurrentInstance()
const cid = 'lc-' + (inst ? inst.uid : 0)
const mode = ref<'canvas' | 'css'>('canvas')
const handle = ref<CanvasHandle | null>(null)
let dead = false

const cssHeight = computed(() => Math.max(48, Math.round(toPx(props.height))))
const boxStyle = computed(() => 'height:' + cssHeight.value + 'px')
const cvStyle = computed(() => 'width:100%;height:' + cssHeight.value + 'px;display:block')

/** 全局降级闸：控制台里 __AGU_CHART_FALLBACK__ = true 即可双向验证降级路径。 */
function flagOn(): boolean {
  try {
    const g = globalThis as unknown as { __AGU_CHART_FALLBACK__?: boolean }
    return !!g && g.__AGU_CHART_FALLBACK__ === true
  } catch (e) {
    // 老基础库没有 globalThis：当作开关未打开，不影响出图。
    return false
  }
}

function drawEmpty(ctx: CanvasHandle['ctx'], w: number, h: number): void {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(8, Math.round(h / 2) + 0.5)
  ctx.lineTo(w - 8, Math.round(h / 2) + 0.5)
  ctx.stroke()
  ctx.restore()
}

function paintCanvas(h: CanvasHandle): void {
  const ctx = h.ctx
  const width = h.width
  const height = h.height
  ctx.clearRect(0, 0, width, height)

  const accent = props.accent
  const geo = pathFromPoints(props.points, {
    width,
    height,
    padding: { top: 16, right: 10, bottom: 10, left: 10 },
    zeroLine: props.zeroLine,
    domain: props.domain,
  })
  if (!geo.xs.length) {
    drawEmpty(ctx, width, height)
    return
  }
  const frame = { width, height, padding: geo.padding }
  const innerTop = geo.padding.top
  const innerBottom = height - geo.padding.bottom
  const scaleY = scaleLinear([geo.yMin, geo.yMax], [innerBottom, innerTop])

  drawGrid(ctx, frame, niceTicks(geo.yMin, geo.yMax, 4), scaleY, 'rgba(255,255,255,0.055)')
  if (geo.zeroY !== null) drawZero(ctx, geo.zeroY, frame, 'rgba(255,255,255,0.20)')
  if (props.fill) drawArea(ctx, frame, geo.xs, geo.ys, innerBottom, accent)
  drawLine(ctx, geo.xs, geo.ys, accent, 2)
  const last = geo.xs.length - 1
  drawDot(ctx, geo.xs[last], geo.ys[last], 2.5, accent, 2, 'rgba(11,16,21,0.9)')
  drawMarks(ctx, frame, props.marks || [], geo.xs, geo.ys, accent, '#8b97a6')
}

/**
 * force=true 时重新量宽、重设位图并重画。
 * 布局（字体回流、首屏尺寸）可能在我们画完之后才稳定，所以挂载后会补画两次。
 */
async function paint(force = false): Promise<void> {
  if (dead) return
  if (props.forceFallback || flagOn()) {
    mode.value = 'css'
    handle.value = null
    return
  }
  let h = force ? null : handle.value
  if (!h) {
    h = await acquireCanvas(cid, inst, cssHeight.value)
    if (dead) return
    if (!h) {
      // 节点/上下文取不到：转 CSS 降级，不留白屏。
      mode.value = 'css'
      handle.value = null
      return
    }
    handle.value = h
    mode.value = 'canvas'
    await nextTick()
  }
  paintCanvas(h)
}

/** 补画两次就够，别做成轮询。 */
function repaintAfterLayout(): void {
  const ticks = [80, 320]
  for (let i = 0; i < ticks.length; i++) {
    setTimeout(function () {
      if (!dead) void paint(true)
    }, ticks[i])
  }
}

onMounted(function () {
  nextTick(function () {
    void paint()
    repaintAfterLayout()
  })
})

onBeforeUnmount(function () {
  dead = true
})

watch(
  function () {
    return [
      props.points,
      props.marks,
      props.accent,
      props.fill,
      props.zeroLine,
      props.domain,
      props.height,
      props.forceFallback,
    ]
  },
  function () {
    void paint()
  },
  { deep: true },
)

/** 供页面手动重挂（切降级开关后用）。 */
defineExpose({ repaint: paint })
</script>

<template>
  <view class="lc" :style="boxStyle">
    <template v-if="mode === 'canvas'">
      <!-- #ifdef MP-WEIXIN -->
      <canvas
        :id="cid"
        type="2d"
        class="lc__cv"
        :style="cvStyle"
      />
      <!-- #endif -->
      <!-- #ifdef H5 -->
      <view :id="cid" class="lc__cv" :style="cvStyle" />
      <!-- #endif -->
    </template>
    <CssLine
      v-else
      :values="points.map((p) => p.v)"
      :height="cssHeight"
      :accent="accent"
      :zero-line="zeroLine"
      :marks="marks"
      :domain="domain"
    />
    <view v-if="mode === 'css'" class="lc__tag">降级视图</view>
  </view>
</template>

<style scoped>
.lc {
  position: relative;
  width: 100%;
}
.lc__cv {
  display: block;
}
.lc__tag {
  position: absolute;
  right: 6px;
  top: 4px;
  font-size: 20rpx;
  color: #8b97a6;
  opacity: 0.7;
}
</style>
