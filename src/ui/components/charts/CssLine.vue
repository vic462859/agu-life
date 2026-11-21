<script setup lang="ts">
/**
 * CSS 降级视图：拿不到 canvas 上下文时，用同一份 geometry 结果摆 div 画折线。
 * 绝不白屏 —— 这是双端 canvas 取不到节点时的最后一道兜底。
 */
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import { estimateWidth } from './canvas'
import { pathFromPoints, toSeries } from './geometry'

const props = withDefaults(
  defineProps<{
    values: number[]
    /** 高度，CSS 像素（由调用方从 rpx 换算好）。 */
    height: number
    accent?: string
    zeroLine?: boolean
    stroke?: number
    /** 与 canvas 版同一组标注：降级时也不丢「当前位置」。 */
    marks?: { idx: number; color?: string }[]
    /** 固定 y 域（可选）：与 canvas 版、与同屏其他图共享同一把尺子。 */
    domain?: readonly [number, number] | null
  }>(),
  { accent: '#f0c25a', zeroLine: false, stroke: 2, marks: () => [], domain: null },
)

const inst = getCurrentInstance()
const fid = 'cssl-' + (inst ? inst.uid : 0)
const width = ref(0)
const ready = ref(false)

/** 先给个估算宽度，保证首帧就能画；量到了再修正。 */
function measure(): void {
  width.value = estimateWidth()
  ready.value = true
  try {
    uni
      .createSelectorQuery()
      .in(inst as never)
      .select('#' + fid)
      .boundingClientRect(function (res: unknown) {
        const r = res as { width?: number } | null
        const w = r && Number(r.width)
        if (isFinite(w as number) && (w as number) > 0) width.value = w as number
      })
      .exec()
  } catch (e) {
    /* 量不到就沿用估算宽度，不影响出图 */
  }
}

onMounted(measure)

const geo = computed(() =>
  pathFromPoints(toSeries(props.values), {
    width: Math.max(32, width.value),
    height: Math.max(8, props.height),
    padding: { top: 6, right: 4, bottom: 6, left: 4 },
    zeroLine: props.zeroLine,
    domain: props.domain,
  }),
)

interface Seg {
  left: number
  top: number
  w: number
  rot: string
}

const segs = computed<Seg[]>(() => {
  const g = geo.value
  const out: Seg[] = []
  const half = props.stroke / 2
  for (let i = 1; i < g.xs.length; i++) {
    const dx = g.xs[i] - g.xs[i - 1]
    const dy = g.ys[i] - g.ys[i - 1]
    const len = Math.sqrt(dx * dx + dy * dy)
    out.push({
      left: g.xs[i - 1],
      top: g.ys[i - 1] - half,
      w: Math.max(0.5, len),
      rot: 'rotate(' + Math.atan2(dy, dx).toFixed(4) + 'rad)',
    })
  }
  return out
})

/** 标注：竖线 + 圆点，位置与 canvas 版一致（同一份 geo.xs / geo.ys）。 */
const markLines = computed<{ left: number; top: number; color: string }[]>(() => {
  const g = geo.value
  const out: { left: number; top: number; color: string }[] = []
  for (const m of props.marks || []) {
    const i = Math.floor(Number(m && m.idx))
    if (!isFinite(i) || i < 0 || i >= g.xs.length) continue
    out.push({ left: g.xs[i], top: g.ys[i], color: m.color || props.accent })
  }
  return out
})

/** 点太密就不画点，只留最后一个；单点/全等值时靠点撑住画面。 */
const dots = computed<{ left: number; top: number }[]>(() => {
  const g = geo.value
  const n = g.xs.length
  if (!n) return []
  if (n > 40) return [{ left: g.xs[n - 1], top: g.ys[n - 1] }]
  return g.xs.map((x, i) => ({ left: x, top: g.ys[i] }))
})
</script>

<template>
  <view :id="fid" class="cssl" :style="{ height: height + 'px' }">
    <view
      v-if="geo.zeroY !== null"
      class="cssl__zero"
      :style="{ top: geo.zeroY + 'px' }"
    />
    <view
      v-for="(s, i) in segs"
      :key="'s' + i"
      class="cssl__seg"
      :style="{
        left: s.left + 'px',
        top: s.top + 'px',
        width: s.w + 'px',
        height: stroke + 'px',
        background: accent,
        transform: s.rot,
      }"
    />
    <view
      v-for="(m, i) in markLines"
      :key="'m' + i"
      class="cssl__mark"
      :style="{ left: m.left + 'px', background: m.color }"
    />
    <view
      v-for="(m, i) in markLines"
      :key="'md' + i"
      class="cssl__mdot"
      :style="{ left: m.left - 3 + 'px', top: m.top - 3 + 'px', background: m.color }"
    />
    <view
      v-for="(d, i) in dots"
      :key="'d' + i"
      class="cssl__dot"
      :style="{
        left: d.left - 2 + 'px',
        top: d.top - 2 + 'px',
        background: accent,
      }"
    />
    <view v-if="!ready || !geo.xs.length" class="cssl__empty" />
  </view>
</template>

<style scoped>
.cssl {
  position: relative;
  width: 100%;
  overflow: hidden;
}
.cssl__seg {
  position: absolute;
  transform-origin: 0 50%;
  border-radius: 1px;
  pointer-events: none;
}
.cssl__dot {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  pointer-events: none;
}
.cssl__mark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  opacity: 0.5;
  pointer-events: none;
}
.cssl__mdot {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  pointer-events: none;
}
.cssl__zero {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.18);
}
.cssl__empty {
  position: absolute;
  left: 0;
  top: 50%;
  right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
}
</style>
