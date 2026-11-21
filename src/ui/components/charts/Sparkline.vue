<script setup lang="ts">
/**
 * 迷你走势（日志 / 结局卡用）。
 * 与 LineChart 同一套几何与降级逻辑，只是没有标注和网格。
 */
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { acquireCanvas, toPx } from './canvas'
import { pathFromPoints, toSeries } from './geometry'
import { drawArea, drawDot, drawLine } from './paint'
import type { CanvasHandle } from './canvas'
import CssLine from './CssLine.vue'

const props = withDefaults(
  defineProps<{
    /** 一串数值（净值 / 回撤 / 任何连续序列）。 */
    values: number[]
    /** 高度，rpx 数值。 */
    height?: number
    accent?: string
    /** 是否填充下方。 */
    fill?: boolean
    /** 调试开关：true 时跳过 canvas，直接渲染 CSS 降级视图。 */
    forceFallback?: boolean
    /** 固定 y 域 [min, max]（可选）。多张图传同一个域才能横向比坡度。 */
    domain?: readonly [number, number] | null
  }>(),
  { height: 96, accent: '#37e0cc', fill: true, forceFallback: false, domain: null },
)

const inst = getCurrentInstance()
const cid = 'sp-' + (inst ? inst.uid : 0)
const mode = ref<'canvas' | 'css'>('canvas')
const handle = ref<CanvasHandle | null>(null)
let dead = false

const cssHeight = computed(() => Math.max(16, Math.round(toPx(props.height))))
const boxStyle = computed(() => 'height:' + cssHeight.value + 'px')
const cvStyle = computed(() => 'width:100%;height:' + cssHeight.value + 'px;display:block')

function flagOn(): boolean {
  try {
    const g = globalThis as unknown as { __AGU_CHART_FALLBACK__?: boolean }
    return !!g && g.__AGU_CHART_FALLBACK__ === true
  } catch (e) {
    // 老基础库没有 globalThis：当作开关未打开，不影响出图。
    return false
  }
}

function paintCanvas(h: CanvasHandle): void {
  const ctx = h.ctx
  ctx.clearRect(0, 0, h.width, h.height)
  const geo = pathFromPoints(toSeries(props.values), {
    width: h.width,
    height: h.height,
    padding: { top: 4, right: 3, bottom: 4, left: 3 },
    domain: props.domain,
  })
  if (!geo.xs.length) return
  const frame = { width: h.width, height: h.height, padding: geo.padding }
  if (props.fill) drawArea(ctx, frame, geo.xs, geo.ys, h.height - geo.padding.bottom, props.accent)
  drawLine(ctx, geo.xs, geo.ys, props.accent, 1.5)
  const last = geo.xs.length - 1
  drawDot(ctx, geo.xs[last], geo.ys[last], 2, props.accent)
}

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

/** 同 LineChart：布局稳定后补画两次，避免按旧宽度画进新位图。 */
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
    return [props.values, props.accent, props.fill, props.height, props.forceFallback, props.domain]
  },
  function () {
    void paint()
  },
  { deep: true },
)

defineExpose({ repaint: paint })
</script>

<template>
  <view class="sp" :style="boxStyle">
    <template v-if="mode === 'canvas'">
      <!-- #ifdef MP-WEIXIN -->
      <canvas :id="cid" type="2d" class="sp__cv" :style="cvStyle" />
      <!-- #endif -->
      <!-- #ifdef H5 -->
      <view :id="cid" class="sp__cv" :style="cvStyle" />
      <!-- #endif -->
    </template>
    <CssLine
      v-else
      :values="values"
      :height="cssHeight"
      :accent="accent"
      :stroke="2"
      :domain="domain"
    />
  </view>
</template>

<style scoped>
.sp {
  position: relative;
  width: 100%;
}
.sp__cv {
  display: block;
}
</style>
