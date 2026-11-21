<script setup lang="ts">
/**
 * 图表试验台（M1-C）：三块真实数据的画面 + 一条强制降级的对照。
 * 数据全部来自 core（只读），页面自己不造数据。
 */
import { computed, ref } from 'vue'
import { buildQuarters } from '../../core'
import LineChart from '../../ui/components/charts/LineChart.vue'
import Sparkline from '../../ui/components/charts/Sparkline.vue'

/** 史实序列的年块顺序（1991..2026 顺序播放）。 */
const CAL = Array.from({ length: 36 }, (_, i) => 1991 + i)
const quarters = buildQuarters(CAL)

/** 36 年指数走势：144 个季初点位。 */
const points = quarters.map((q) => ({ t: String(q.y) + 'Q' + q.q, v: q.p0 }))

const last = points.length - 1
const peak2007 = (2007 - 1991) * 4 + 3
const peak2015 = (2015 - 1991) * 4 + 1

const marks = computed(() => [
  { idx: peak2007, label: '2007', color: '#f0c25a' },
  { idx: last, label: '现在', color: '#37e0cc' },
])

/** 单季高低振幅（百分点）：hi/lo 是季内相对季初的最大涨幅 / 最大跌幅。 */
const amp = quarters.map((q) => Math.round((q.hi - q.lo) * 1000) / 10)

/** 净值：把季度收益率连乘起来。 */
const net = (() => {
  let v = 1
  const out: number[] = []
  for (const q of quarters) {
    v = v * (1 + q.ret)
    out.push(Math.round(v * 10000) / 10000)
  }
  return out
})()

/** 回撤带：距历史高点的百分比（<=0）。 */
const drawdown = (() => {
  let hi = net[0]
  return net.map((v) => {
    if (v > hi) hi = v
    return Math.round((v / hi - 1) * 1000) / 10
  })
})()

const hi = Math.max(...points.map((p) => p.v))
const lo = Math.min(...points.map((p) => p.v))
const stat = (n: number): string => Math.round(n).toLocaleString('en-US')

const force = ref(false)
const version = ref(0)
function toggleFallback(): void {
  force.value = !force.value
  version.value++
}
function grabFlag(): boolean {
  try {
    const g = globalThis as unknown as { __AGU_CHART_FALLBACK__?: boolean }
    return !!g && g.__AGU_CHART_FALLBACK__ === true
  } catch (e) {
    return false
  }
}
const flagOn = computed(() => (version.value, grabFlag()))
</script>

<template>
  <view class="lab">
    <view class="lab__hd">
      <text class="lab__title">图表试验台</text>
      <text class="lab__sub">{{ points.length }} 季 · {{ points[0].t }} → {{ points[last].t }}</text>
    </view>

    <view class="card">
      <view class="card__hd">
        <text class="card__t">上证指数 · 36 年季线</text>
        <text class="card__d">{{ stat(lo) }} – {{ stat(hi) }}</text>
      </view>
      <LineChart :key="'a' + version" :points="points" :marks="marks" :height="400" :force-fallback="force" />
      <view class="card__ft">
        <text class="dot dot--gold" />2007 顶
        <text class="dot dot--teal" />现在
      </view>
    </view>

    <view class="card">
      <view class="card__hd">
        <text class="card__t">单季高低振幅</text>
        <text class="card__d">点 · 百分点</text>
      </view>
      <LineChart
        :key="'b' + version"
        :points="amp.map((v, i) => ({ t: points[i].t, v }))"
        :height="240"
        accent="#37e0cc"
        :fill="false"
        :force-fallback="force"
      />
    </view>

    <view class="card">
      <view class="card__hd">
        <text class="card__t">净值 · 迷你走势</text>
        <text class="card__d">{{ net[net.length - 1].toFixed(2) }}×</text>
      </view>
      <Sparkline :key="'c' + version" :values="net" :height="88" accent="#f0c25a" :force-fallback="force" />
      <view class="card__hd card__hd--gap">
        <text class="card__t">回撤带</text>
        <text class="card__d">最深 {{ Math.min(...drawdown).toFixed(1) }}%</text>
      </view>
      <Sparkline :key="'d' + version" :values="drawdown" :height="72" accent="#ef4444" :force-fallback="force" />
    </view>

    <view class="card card--diag">
      <view class="card__hd">
        <text class="card__t">降级路径对照</text>
        <text class="card__d">本卡固定降级 · 全页 {{ flagOn || force ? '已降级' : 'canvas' }}</text>
      </view>
      <LineChart :key="'e' + version" :points="points" :marks="marks" :height="260" :force-fallback="true" />
      <text class="card__note">
        上面这条一定是 CSS 降级视图（forceFallback=true）。控制台执行
        __AGU_CHART_FALLBACK__ = true 后点下面的按钮，整页会一起切到降级。
      </text>
      <button class="btn" size="mini" @tap="toggleFallback">
        {{ force ? '恢复 canvas' : '强制降级并重挂' }}
      </button>
    </view>
  </view>
</template>

<style scoped>
.lab {
  min-height: 100vh;
  background: #0b1015;
  padding: 24rpx 24rpx 64rpx;
  box-sizing: border-box;
}
.lab__hd {
  padding: 8rpx 4rpx 20rpx;
}
.lab__title {
  display: block;
  font-size: 36rpx;
  color: #e6edf3;
  font-weight: 600;
}
.lab__sub {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #8b97a6;
  letter-spacing: 1rpx;
}
.card {
  background: #111a23;
  border: 1rpx solid #1e2a36;
  border-radius: 16rpx;
  padding: 20rpx 20rpx 16rpx;
  margin-bottom: 20rpx;
}
.card--diag {
  background: #0e161d;
}
.card__hd {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12rpx;
}
.card__hd--gap {
  margin-top: 18rpx;
}
.card__t {
  font-size: 26rpx;
  color: #e6edf3;
}
.card__d {
  font-size: 22rpx;
  color: #8b97a6;
}
.card__ft {
  margin-top: 6rpx;
  font-size: 20rpx;
  color: #8b97a6;
}
.card__note {
  display: block;
  margin-top: 10rpx;
  font-size: 20rpx;
  line-height: 1.6;
  color: #8b97a6;
}
.dot {
  display: inline-block;
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  margin: 0 8rpx 0 16rpx;
}
.dot--gold {
  background: #f0c25a;
}
.dot--teal {
  background: #37e0cc;
}
.btn {
  margin-top: 16rpx;
  background: #16202a;
  color: #e6edf3;
  border: 1rpx solid #1e2a36;
  font-size: 22rpx;
}
</style>
